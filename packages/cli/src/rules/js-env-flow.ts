import { maskDocumentationTextInCode } from './code-context.js';

// Data flow for NET-EXFIL-ENV in JavaScript and TypeScript: which reads of the whole `process.env`
// reach a network send in the same file. The code is the language view, so comments are blank, and
// each string or regex literal is one operand. A value flows through a `const`, `let`, or `var`
// initializer and through an assignment to a declared name. A name resolves to its declaration in
// the innermost scope: a block declares its `const`, `let`, `var`, and destructured names, and a
// function declares its parameters. So functions that share a name do not share its value. Each
// pass is a regex scan, a bracket scan, or a sort, so a large or hostile file stays near linear.
// ponytail: return values, function arguments, loop targets, a rest element
// (`const { ...rest } = process.env`), and `import { env } from 'node:process'` are not followed.
// Move to an AST pass if real scans show any of these.

/**
 * `process.env`, also after a spread (`...process.env`), but not as a property of another object.
 * Split like the patterns in network-exfil.ts, so static-analysis hooks do not flag this file.
 */
export const PROCESS_ENV_TOKEN_SOURCE = ['(?<![\\w$])(?<![^.]\\.)process\\.', 'env(?![\\w$])'].join(
  ''
);
const PROCESS_ENV_TOKEN = new RegExp(PROCESS_ENV_TOKEN_SOURCE, 'g');
// The rule always reported `JSON.stringify(process.env)` without a send. The match ends where the
// token starts.
const STRINGIFIED_PROCESS_ENV = new RegExp(
  ['JSON\\.stringify\\s*\\(\\s*(?=process\\.', 'env\\s*\\))'].join(''),
  'g'
);

// What can follow a read that does not pass every variable on: a key lookup, an assignment, a
// truthiness test (`process.env && ...`, `env ? a : b`), or a comparison.
const NOT_A_VALUE_AFTER = /\s*(?:\??\.|\[|=(?!=)|&&|\?(?![?.])|[!=]==?|[<>]|instanceof\b|in\b)/y;
// Words before a read that make it a test: a membership test (`'CI' in env`) reads one key.
const TEST_WORDS = ['in', 'typeof', 'instanceof'];
// A name after `#` is a private class member (`this.#token`), not a variable.
const IDENTIFIER = /(?<![\w$#])[A-Za-z_$][\w$]*/g;

const CLIENT_CONSTRUCTOR = String.raw`(?:https?\.(?:request|get)|net\.(?:connect|createConnection)|tls\.connect|new\s+(?:WebSocket|net\.Socket)|axios\.create)`;
// Calls whose arguments leave the machine. A client constructor counts too, as in the Python flow:
// its host goes to a DNS lookup and a connect.
const SEND_CALL = new RegExp(
  String.raw`(?<![\w$.#])(?:fetch|axios(?:\.(?:get|post|put|patch|delete|head|options|request))?|navigator\.sendBeacon|${CLIENT_CONSTRUCTOR})\s*\(`,
  'g'
);
const CLIENT_VALUE = new RegExp(String.raw`\s*(?:await\s+)?${CLIENT_CONSTRUCTOR}\s*\(`, 'y');
// Methods that send through a name that holds a client: a request body, a socket write, a
// WebSocket message, or an axios instance verb.
const CLIENT_SEND_CALL =
  /(?<![\w$.#])([A-Za-z_$][\w$]*)\.(?:write|end|send|get|post|put|patch|delete|request)\s*\(/g;

// A declaration keyword before a name or a destructuring pattern (`let{a,b}=c` in minified code).
const DECLARATION = /(?<![\w$.#])(?:const|let|var)(?:\s+|(?=[{[]))/g;
const DECLARED_NAME = /[A-Za-z_$][\w$]*/y;
// The optional type annotation and the `=` after a declared name.
const INITIALIZER = /\s*(?::[^=;\n]{0,200})?=(?![=>])/y;
// The comma before the next target of the same statement: `const a = 1, b = 2`.
const NEXT_DECLARATOR = /\s*,\s*/y;
// `name = value`, `name += value`, and `name.key = value`, which changes what `name` holds.
const ASSIGNMENT = /(?<![\w$.#])([A-Za-z_$][\w$]*)(?:\.[A-Za-z_$#][\w$]*)*\s*\+?=(?![=>])/g;

// Calls that start a child process. Their `env` option is the child's environment and does not
// flow into the call result: `execFileSync(cmd, args, { env: { ...process.env, CI: '1' } })`.
const PROCESS_LAUNCH_CALL =
  /(?<![\w$])(?:[\w$]+\.)?(?:spawn|spawnSync|exec|execSync|execFile|execFileSync|fork|execa|execaSync|execaCommand|execaCommandSync)\s*\(/g;
// The word of an `env` key, bare or quoted (`'env'`). It runs on the content, because the view
// turns a quoted key into string text. The flow reads the punctuation around it in the view.
const ENV_OPTION = /(?<![\w$.])(?:env|(['"])env\1)(?![\w$])/g;

// A `{` after the `)` of these keywords opens a block, not a function body.
const CONTROL_KEYWORDS = ['if', 'for', 'while', 'switch', 'with', 'await'];

// A line break ends a statement unless the line ends with, or the next line starts with, an
// operator that continues the expression.
const CONTINUES_AFTER = new Set('=+-*/%&|^<>!?:,.([{');
const CONTINUES_BEFORE = new Set('.?:+-*/%&|^<>=,');

// The extensions whose view masks JavaScript comments and strings.
const JAVASCRIPT_SCAN_PATH = /\.(?:[cm]?js|[jt]sx|ts)$/;
// Stands for a character of string or regex literal text. It is not a name, an operator, or a
// bracket, so the scans read a literal as one operand. The view blanks every quote, so a quote in
// the flow's code is always literal text.
const LITERAL_TEXT = '"';
const LITERAL_TEXT_CODE = LITERAL_TEXT.charCodeAt(0);
const SPACE_CODE = 32;
const LINE_BREAK_CODE = 10;
const UTF16 = new TextDecoder('utf-16le');

/**
 * Blanks each `process.env` token in a prepared view, except the reads that send the whole
 * environment: `JSON.stringify(process.env)` in any file, and in a JavaScript or TypeScript file,
 * each whole read whose value reaches a network send.
 */
export function maskProcessEnvReadsNotSent(
  view: string,
  content: string,
  filePath: string
): string {
  const tokens = [...view.matchAll(PROCESS_ENV_TOKEN)];
  if (tokens.length === 0) return view;

  const kept = new Set(
    [...view.matchAll(STRINGIFIED_PROCESS_ENV)].map((match) => match.index + match[0].length)
  );
  if (JAVASCRIPT_SCAN_PATH.test(filePath)) {
    for (const read of findSentProcessEnvReads(view, content, filePath)) kept.add(read);
  }

  // Splice the blanks in, so a large file is not split into one string per character.
  let masked = '';
  let copiedUntil = 0;
  for (const token of tokens) {
    if (kept.has(token.index)) continue;
    masked += view.slice(copiedUntil, token.index) + ' '.repeat(token[0].length);
    copiedUntil = token.index + token[0].length;
  }
  return masked + view.slice(copiedUntil);
}

/** Returns the offset of each whole `process.env` read whose value reaches a network send. */
function findSentProcessEnvReads(view: string, content: string, filePath: string): number[] {
  const reads = wholeProcessEnvReads(view);
  if (reads.length === 0 || view.search(SEND_CALL) < 0) return [];

  const code = markLiteralText(view, content, filePath);
  const scan = scanBrackets(code);
  const ends = expressionEnds(code, scan.lineContinues);
  // A function runs from its parameters to the end of its body.
  const functionScopes = scan.functions.map((fn) => ({
    start: fn.parameters.start,
    end: (fn.braced ? scan.closing[fn.body] : ends[fn.body]) ?? code.length,
  }));
  const declared = declarators(code, scan, ends);
  const declarations = collectDeclarations(code, scan, declared, functionScopes);
  const values = valueRegions(code, ends, declared, declarations);
  const sends = sendRegions(code, scan, declarations);
  const functions = functionScopes.map((scope) => barrier(scope.start, scope.end));
  const flowRegions = [...sends, ...values, ...functions];
  const childEnvironments = childEnvironmentRegions(code, content, scan, ends, flowRegions);

  return traceReadsIntoSends(code, declarations, reads, [...flowRegions, ...childEnvironments]);
}

/**
 * Assigns each read and each whole use of a declared name to its innermost region. A read in a
 * send is sent; a read in a value goes to the declaration that gets the value. Then walks back
 * from the uses in the sends through the declarations.
 */
function traceReadsIntoSends(
  code: string,
  declarations: Declaration[],
  reads: number[],
  regions: Region[]
): number[] {
  const sentReads: number[] = [];
  const readsByDeclaration = new Map<number, number[]>();
  const readRegions = innermostRanges(regions, reads);
  reads.forEach((read, idx) => {
    const region = regions[readRegions[idx] ?? -1];
    if (region?.kind === 'send') sentReads.push(read);
    else if (region?.kind === 'value') pushTo(readsByDeclaration, region.declaration, read);
  });

  const uses = wholeNameUses(code, new Set(declarations.map((declaration) => declaration.name)));
  const useDeclarations = resolveNames(declarations, uses);
  const useRegions = innermostRanges(
    regions,
    uses.map((use) => use.offset)
  );
  const usesByDeclaration = new Map<number, number[]>();
  const pending: number[] = [];
  uses.forEach((_, idx) => {
    const declaration = useDeclarations[idx] ?? -1;
    const region = regions[useRegions[idx] ?? -1];
    if (declaration < 0) return;
    if (region?.kind === 'send') pending.push(declaration);
    else if (region?.kind === 'value') pushTo(usesByDeclaration, region.declaration, declaration);
  });

  const visited = new Set<number>();
  for (let declaration = pending.pop(); declaration !== undefined; declaration = pending.pop()) {
    if (visited.has(declaration)) continue;
    visited.add(declaration);
    // A loop, not a spread: a crafted file can hold more reads than a call takes arguments.
    for (const read of readsByDeclaration.get(declaration) ?? []) sentReads.push(read);
    for (const use of usesByDeclaration.get(declaration) ?? []) pending.push(use);
  }
  return sentReads;
}

/** Each `process.env` read that takes the whole object, in offset order. */
function wholeProcessEnvReads(code: string): number[] {
  const reads: number[] = [];

  for (const match of code.matchAll(PROCESS_ENV_TOKEN)) {
    const end = match.index + match[0].length;
    if (!isTestedOrLookedUp(code, match.index, end)) reads.push(match.index);
  }
  return reads;
}

/** Each use of a declared name that reads its whole value, in offset order. */
function wholeNameUses(code: string, names: Set<string>): NameUse[] {
  const uses: NameUse[] = [];

  for (const match of code.matchAll(IDENTIFIER)) {
    const name = match[0];
    const start = match.index;
    if (!names.has(name)) continue;
    if (isPropertyName(code, start)) continue;

    const end = start + name.length;
    if (isTestedOrLookedUp(code, start, end)) continue;
    // An object key (`{ env: value }`) names a property. A shorthand key (`{ env }`) is a use.
    const previous = code[previousCodeIndex(code, start)];
    const startsProperty = previous === '{' || previous === ',';
    if (startsProperty && code[nextCodeIndex(code, end)] === ':') continue;

    uses.push({ name, offset: start });
  }
  return uses;
}

/**
 * Whether the reference in [start, end) only tests or looks into the value: a key lookup, an
 * assignment, `!env`, `typeof env`, `'CI' in env`, `env && ...`, `env ? a : b`, or a comparison.
 * The result is then a key's value or a boolean, not every variable.
 */
function isTestedOrLookedUp(code: string, start: number, end: number): boolean {
  NOT_A_VALUE_AFTER.lastIndex = end;
  if (NOT_A_VALUE_AFTER.test(code)) return true;

  const previous = previousCodeIndex(code, start);
  const char = code[previous];
  const beforeChar = code[previous - 1];
  if (char === '!' || char === '<') return true;
  // `== env` and `!== env` compare; `= env` assigns, and `=> env` is an arrow body.
  if (char === '=') return beforeChar === '=' || beforeChar === '!';
  if (char === '>') return beforeChar !== '=';
  return TEST_WORDS.some((word) => endsWithWord(code, previous, word));
}

/**
 * What each `const`, `let`, or `var` statement declares: each name with the start of its
 * initializer, and each destructuring pattern, whose names hold parts of the value. Each carries
 * the offset of the keyword. A statement can declare several (`const a = 1, { b } = c`); the
 * expression ends step from one to the next.
 */
function declarators(code: string, scan: BracketScan, ends: Int32Array): Declarators {
  const names: Declarator[] = [];
  const patterns: Array<Range & { offset: number }> = [];

  for (const match of code.matchAll(DECLARATION)) {
    let cursor = match.index + match[0].length;
    for (;;) {
      let name: string | undefined;
      if (code[cursor] === '{' || code[cursor] === '[') {
        const end = scan.closing[cursor] ?? code.length;
        patterns.push({ start: cursor + 1, end, offset: match.index });
        cursor = end + 1;
      } else {
        DECLARED_NAME.lastIndex = cursor;
        name = DECLARED_NAME.exec(code)?.[0];
        if (name === undefined) break;
        cursor = DECLARED_NAME.lastIndex;
      }

      INITIALIZER.lastIndex = cursor;
      const valueStart = INITIALIZER.test(code) ? INITIALIZER.lastIndex : undefined;
      if (name !== undefined) names.push({ name, offset: match.index, valueStart });
      if (valueStart !== undefined) cursor = ends[valueStart] ?? code.length;

      NEXT_DECLARATOR.lastIndex = cursor;
      if (!NEXT_DECLARATOR.test(code)) break;
      cursor = NEXT_DECLARATOR.lastIndex;
    }
  }
  return { names, patterns };
}

/**
 * Each `const`, `let`, `var`, and destructured name, scoped to the innermost block of its
 * statement, and each parameter, scoped to its function.
 */
function collectDeclarations(
  code: string,
  scan: BracketScan,
  declared: Declarators,
  functionScopes: Range[]
): Declaration[] {
  const blocks = scan.braces.map((brace) => ({
    start: brace + 1,
    end: scan.closing[brace] ?? code.length,
  }));
  const blockOf = (offsets: number[]): Range[] =>
    [...innermostRanges(blocks, offsets)].map(
      (index) => blocks[index] ?? { start: -1, end: code.length }
    );
  const nameBlocks = blockOf(declared.names.map((declarator) => declarator.offset));
  const patternBlocks = blockOf(declared.patterns.map((pattern) => pattern.offset));
  const indexByScopedName = new Map<string, number>();
  const declarations: Declaration[] = [];
  const declare = (name: string, scope: Range): void => {
    // `var` can declare a name twice in one block. Both declare the same variable.
    const key = `${scope.start}:${name}`;
    if (indexByScopedName.has(key)) return;
    indexByScopedName.set(key, declarations.length);
    declarations.push({ name, scope, isClient: false });
  };

  declared.names.forEach((declarator, idx) => {
    const scope = nameBlocks[idx];
    if (scope !== undefined) declare(declarator.name, scope);
  });
  // A parameter list binds names in its function; a pattern binds them in its statement's block.
  const parameterLists = scan.functions.map((fn) => fn.parameters);
  for (const bound of bindingNames(code, scan, [...parameterLists, ...declared.patterns])) {
    const isParameter = bound.list < parameterLists.length;
    const scope = isParameter
      ? functionScopes[bound.list]
      : patternBlocks[bound.list - parameterLists.length];
    if (scope !== undefined) declare(bound.name, scope);
  }
  return declarations;
}

/**
 * The names that each parameter list or destructuring pattern binds, with the index of its list. A
 * key (`{ key: name }`), a type (`name: Type`), and a default value (`name = value`) bind nothing:
 * a name there that shadowed an outer copy would hide its flow. Nested patterns go on a stack, so
 * deep nesting cannot exhaust the call stack.
 */
function bindingNames(
  code: string,
  scan: BracketScan,
  lists: Range[]
): Array<NameUse & { list: number }> {
  const names: Array<NameUse & { list: number }> = [];

  lists.forEach((list, listIndex) => {
    const pending = [{ ...list, inObject: code[list.start - 1] === '{' }];
    for (let elements = pending.pop(); elements !== undefined; elements = pending.pop()) {
      let idx = nextCodeIndex(code, elements.start);
      while (idx < elements.end) {
        if (code.startsWith('...', idx)) idx = nextCodeIndex(code, idx + 3);
        const target = elements.inObject ? afterPatternKey(code, scan, idx) : idx;

        if (code[target] === '{' || code[target] === '[') {
          const close = scan.closing[target] ?? code.length;
          pending.push({ start: target + 1, end: close, inObject: code[target] === '{' });
          idx = close + 1;
        } else {
          DECLARED_NAME.lastIndex = target;
          const name = DECLARED_NAME.exec(code)?.[0];
          if (name !== undefined) names.push({ name, offset: target, list: listIndex });
          idx = target + (name?.length ?? 1);
        }
        idx = nextElement(code, scan, idx, elements.end);
      }
    }
  });
  return names;
}

/** In an object pattern, the target after `key:` or `[key]:`, else the element itself. */
function afterPatternKey(code: string, scan: BracketScan, idx: number): number {
  let keyEnd = idx;
  if (code[idx] === '[') {
    keyEnd = (scan.closing[idx] ?? code.length) + 1;
  } else {
    DECLARED_NAME.lastIndex = idx;
    if (DECLARED_NAME.exec(code) !== null) keyEnd = DECLARED_NAME.lastIndex;
  }
  const colon = nextCodeIndex(code, keyEnd);
  return code[colon] === ':' ? nextCodeIndex(code, colon + 1) : idx;
}

/** The start of the next element after `idx`: past a type or a default value and its comma. */
function nextElement(code: string, scan: BracketScan, idx: number, end: number): number {
  for (let at = idx; at < end; at += 1) {
    const char = code[at];
    if (char === '(' || char === '[' || char === '{') at = scan.closing[at] ?? end;
    else if (char === ',') return nextCodeIndex(code, at + 1);
  }
  return end;
}

/**
 * The value of each initializer and each assignment to a declared name. A value that constructs a
 * network client marks its declaration as a client.
 */
function valueRegions(
  code: string,
  ends: Int32Array,
  declared: Declarators,
  declarations: Declaration[]
): Region[] {
  const assignments: Assignment[] = [];
  const valueStarts = new Set<number>();

  for (const { name, offset, valueStart } of declared.names) {
    if (valueStart === undefined) continue;
    valueStarts.add(valueStart);
    assignments.push({ name, offset, valueStart });
  }
  for (const match of code.matchAll(ASSIGNMENT)) {
    const valueStart = match.index + match[0].length;
    // A declaration's own `=` is already an initializer.
    if (valueStarts.has(valueStart)) continue;
    assignments.push({ name: match[1] ?? '', offset: match.index, valueStart });
  }

  const assignedDeclarations = resolveNames(declarations, assignments);
  return assignments.flatMap((assignment, idx) => {
    const declaration = assignedDeclarations[idx] ?? -1;
    if (declaration < 0) return [];

    CLIENT_VALUE.lastIndex = assignment.valueStart;
    const target = declarations[declaration];
    if (target !== undefined && CLIENT_VALUE.test(code)) target.isClient = true;

    const end = ends[assignment.valueStart] ?? code.length;
    return [{ start: assignment.valueStart, end, kind: 'value' as const, declaration }];
  });
}

/** The arguments of each send call and of each send method on a name that holds a client. */
function sendRegions(code: string, scan: BracketScan, declarations: Declaration[]): Region[] {
  const sends = [...code.matchAll(SEND_CALL)].map((match) => argumentRegion(code, scan, match));

  const clientCalls = [...code.matchAll(CLIENT_SEND_CALL)];
  const receivers = resolveNames(
    declarations,
    clientCalls.map((match) => ({ name: match[1] ?? '', offset: match.index }))
  );
  clientCalls.forEach((match, idx) => {
    if (declarations[receivers[idx] ?? -1]?.isClient) sends.push(argumentRegion(code, scan, match));
  });
  return sends;
}

/**
 * The `env` option of each call that starts a child process. A key counts only when the launch is
 * its innermost region, so a send inside the option value still counts.
 */
function childEnvironmentRegions(
  code: string,
  content: string,
  scan: BracketScan,
  ends: Int32Array,
  context: Region[]
): Region[] {
  const launches = [...code.matchAll(PROCESS_LAUNCH_CALL)].map((match) =>
    argumentRegion(code, scan, match)
  );
  if (launches.length === 0) return [];

  const keys = [...content.matchAll(ENV_OPTION)].flatMap((match) => {
    const quoted = match[1] !== undefined;
    const start = match.index;
    const end = start + match[0].length;
    // A bare key must be code in the view, a quoted key literal text. A word in a comment is
    // neither, and it is dropped before the walks below cross the blank comment.
    const inView = quoted ? code[start] === LITERAL_TEXT : code.startsWith('env', start);
    if (!inView) return [];

    const previous = code[previousCodeIndex(code, start)];
    const after = nextCodeIndex(code, end);
    const next = code[after];
    const startsProperty = previous === '{' || previous === ',';
    // A quoted key needs a value. A bare key can be shorthand (`{ env }`).
    const isKey = next === ':' || (!quoted && (next === ',' || next === '}'));
    return startsProperty && isKey ? [{ start, end, colon: next === ':' ? after : -1 }] : [];
  });
  const owners = innermostRanges(
    [...context, ...launches],
    keys.map((key) => key.start)
  );

  return keys.flatMap((key, idx) => {
    if ((owners[idx] ?? -1) < context.length) return [];

    // `{ env }` passes the name itself; `{ env: value }` passes the value.
    return key.colon < 0
      ? [barrier(key.start, key.end)]
      : [barrier(key.colon + 1, ends[key.colon + 1] ?? code.length)];
  });
}

/**
 * Fills the string text that the view blanks, and the regex literals that it keeps, with
 * LITERAL_TEXT. Without it, `const url = '...'` looks like a line that ends with `=`, and a bracket
 * in `/\(/` has no pair, so a value runs on into the next statements. A line break between string
 * text and more string text is inside a template literal, so it is string text too.
 */
function markLiteralText(view: string, content: string, filePath: string): string {
  // Strings are kept and regex literals are masked: the reverse of the view.
  const literals = maskDocumentationTextInCode(content, filePath, () => true, true);
  // Character codes, not one string per character: a bundle can hold tens of millions.
  const codes = new Uint16Array(view.length);
  let afterLiteralText = false;
  let lineBreaks: number[] = [];

  for (let idx = 0; idx < view.length; idx += 1) {
    const code = view.charCodeAt(idx);
    const literalCode = literals.charCodeAt(idx);
    const isBlank = code <= SPACE_CODE;
    const isLiteralText = isBlank ? literalCode > SPACE_CODE : literalCode <= SPACE_CODE;
    codes[idx] = isLiteralText ? LITERAL_TEXT_CODE : code;
    if (code === LINE_BREAK_CODE && afterLiteralText) lineBreaks.push(idx);
    if (isBlank && !isLiteralText) continue;

    if (isLiteralText && afterLiteralText) {
      for (const lineBreak of lineBreaks) codes[lineBreak] = LITERAL_TEXT_CODE;
    }
    afterLiteralText = isLiteralText;
    lineBreaks = [];
  }
  // Each code unit decodes to one, so offsets stay aligned. A lone surrogate becomes U+FFFD.
  return UTF16.decode(codes);
}

/**
 * Matches brackets, finds the blocks and the functions, and marks each line break that a trailing
 * operator continues. A function is a `{` after a `)` that no control keyword owns, or the code
 * after `=>`. Its parameters are the list in the parentheses, or the one name before `=>`.
 */
function scanBrackets(code: string): BracketScan {
  const closing = new Int32Array(code.length).fill(code.length);
  const lineContinues = new Uint8Array(code.length);
  const braces: number[] = [];
  const functions: FunctionShape[] = [];
  const openBrackets: number[] = [];
  let previous = -1;
  let beforePrevious = -1;
  // The opening bracket of the last closing bracket, and the parameters of an `=>` before its body.
  let lastClosedOpen = -1;
  let arrowParameters: Range | undefined;

  for (let idx = 0; idx < code.length; idx += 1) {
    const char = code[idx] ?? '';
    if (char === '\n') {
      lineContinues[idx] = CONTINUES_AFTER.has(code[previous] ?? '') ? 1 : 0;
      continue;
    }
    if (char <= ' ') continue;

    if (arrowParameters !== undefined) {
      functions.push({ parameters: arrowParameters, body: idx, braced: char === '{' });
      arrowParameters = undefined;
    } else if (char === '{' && code[previous] === ')' && !isControlBlock(code, lastClosedOpen)) {
      const parameters = { start: lastClosedOpen + 1, end: previous };
      functions.push({ parameters, body: idx, braced: true });
    }

    if (char === '(' || char === '[' || char === '{') {
      openBrackets.push(idx);
      if (char === '{') braces.push(idx);
    } else if (char === ')' || char === ']' || char === '}') {
      const openBracket = openBrackets.pop();
      if (openBracket !== undefined) closing[openBracket] = idx;
      if (openBracket !== undefined) lastClosedOpen = openBracket;
    } else if (char === '>' && previous === idx - 1 && code[previous] === '=') {
      arrowParameters = parametersBeforeArrow(code, beforePrevious, lastClosedOpen);
    }
    beforePrevious = previous;
    previous = idx;
  }
  return { closing, braces, functions, lineContinues };
}

/** The parameters of an arrow function whose `=>` comes after `end`: `(a, b)` or one name. */
function parametersBeforeArrow(code: string, end: number, lastClosedOpen: number): Range {
  if (code[end] === ')') {
    return { start: lastClosedOpen + 1, end };
  }
  let start = end + 1;
  while (start > 0 && /[\w$]/.test(code[start - 1] ?? '')) start -= 1;
  return { start, end: end + 1 };
}

/** Whether the parentheses at `open` belong to a keyword such as `if`, so a `{` after them is a block. */
function isControlBlock(code: string, open: number): boolean {
  const before = previousCodeIndex(code, open);
  return CONTROL_KEYWORDS.some((keyword) => endsWithWord(code, before, keyword));
}

/**
 * For each offset, the end of the expression that goes on there: the next `;` or `,` at the same
 * bracket depth, the bracket that closes the depth, or a line break that ends the statement. A
 * line break inside `(` or `[` never ends it. One backward pass fills every offset.
 */
function expressionEnds(code: string, lineContinues: Uint8Array): Int32Array {
  const ends = new Int32Array(code.length + 1).fill(code.length);
  const outerEnds: number[] = [];
  const outerInBrackets: boolean[] = [];
  let end = code.length;
  let inBrackets = false;
  let nextCode = '';

  for (let idx = code.length - 1; idx >= 0; idx -= 1) {
    const char = code[idx] ?? '';
    if (char === ')' || char === ']' || char === '}') {
      ends[idx] = end;
      outerEnds.push(end);
      outerInBrackets.push(inBrackets);
      end = idx;
      inBrackets = char !== '}';
    } else if (char === '(' || char === '[' || char === '{') {
      end = outerEnds.pop() ?? code.length;
      inBrackets = outerInBrackets.pop() ?? false;
      ends[idx] = end;
    } else {
      const endsLine =
        char === '\n' && !inBrackets && !lineContinues[idx] && !CONTINUES_BEFORE.has(nextCode);
      if (char === ';' || char === ',' || endsLine) end = idx;
      ends[idx] = end;
    }
    if (char > ' ') nextCode = char;
  }
  return ends;
}

/** The index of the declaration that each use resolves to: the innermost scope that declares it. */
function resolveNames(declarations: Declaration[], uses: NameUse[]): Int32Array {
  const resolved = new Int32Array(uses.length).fill(-1);
  const declarationOrder = sortedIndexes(declarations.map((declaration) => declaration.scope));
  const useOrder = sortedIndexes(uses.map((use) => ({ start: use.offset, end: use.offset })));
  // Per name, the declarations whose scopes are open at the current use, innermost last.
  const openScopes = new Map<string, number[]>();
  let nextDeclaration = 0;

  for (const useIndex of useOrder) {
    const use = uses[useIndex];
    if (use === undefined) continue;

    for (; nextDeclaration < declarationOrder.length; nextDeclaration += 1) {
      const index = declarationOrder[nextDeclaration] ?? -1;
      const declaration = declarations[index];
      if (declaration === undefined || declaration.scope.start > use.offset) break;
      const scopes = openScopes.get(declaration.name) ?? [];
      openScopes.set(declaration.name, scopes);
      closeScopesBefore(scopes, declarations, declaration.scope.start);
      scopes.push(index);
    }

    const scopes = openScopes.get(use.name);
    if (scopes === undefined) continue;
    closeScopesBefore(scopes, declarations, use.offset);
    resolved[useIndex] = scopes.at(-1) ?? -1;
  }
  return resolved;
}

function closeScopesBefore(scopes: number[], declarations: Declaration[], offset: number): void {
  while ((declarations[scopes.at(-1) ?? -1]?.scope.end ?? Number.POSITIVE_INFINITY) <= offset) {
    scopes.pop();
  }
}

/**
 * For each offset in ascending order, the index of the innermost range that contains it, or -1.
 * Ranges nest like brackets; a crossing pair gives an approximate answer, still in linear time.
 */
function innermostRanges(ranges: Range[], sortedOffsets: number[]): Int32Array {
  const result = new Int32Array(sortedOffsets.length).fill(-1);
  const order = sortedIndexes(ranges);
  const open: number[] = [];
  let nextRange = 0;

  sortedOffsets.forEach((offset, offsetIndex) => {
    for (; nextRange < order.length; nextRange += 1) {
      const index = order[nextRange] ?? -1;
      const range = ranges[index];
      if (range === undefined || range.start > offset) break;
      while ((ranges[open.at(-1) ?? -1]?.end ?? Number.POSITIVE_INFINITY) <= range.start)
        open.pop();
      open.push(index);
    }
    while ((ranges[open.at(-1) ?? -1]?.end ?? Number.POSITIVE_INFINITY) <= offset) open.pop();
    result[offsetIndex] = open.at(-1) ?? -1;
  });
  return result;
}

/** The argument range of the call whose match ends at its `(`. */
function argumentRegion(code: string, scan: BracketScan, match: RegExpExecArray): Region {
  const openParen = match.index + match[0].length - 1;
  return {
    start: openParen + 1,
    end: scan.closing[openParen] ?? code.length,
    kind: 'send',
    declaration: -1,
  };
}

/** Code whose reads go nowhere: a function or a child process's environment. */
function barrier(start: number, end: number): Region {
  return { start, end, kind: 'barrier', declaration: -1 };
}

/** Range indexes by start, and the outer range first when two start together. */
function sortedIndexes(ranges: Range[]): number[] {
  return ranges
    .map((_, idx) => idx)
    .sort((left, right) => {
      const a = ranges[left];
      const b = ranges[right];
      if (a === undefined || b === undefined) return 0;
      return a.start - b.start || b.end - a.end;
    });
}

/** A property name after `.` is not a variable, but a spread (`...name`) reads one. */
function isPropertyName(code: string, start: number): boolean {
  return code[start - 1] === '.' && code.slice(start - 3, start) !== '...';
}

function pushTo(map: Map<number, number[]>, key: number, value: number): void {
  const values = map.get(key);
  if (values === undefined) map.set(key, [value]);
  else values.push(value);
}

function previousCodeIndex(code: string, offset: number): number {
  let idx = offset - 1;
  while (idx >= 0 && (code[idx] ?? '') <= ' ') idx -= 1;
  return idx;
}

function nextCodeIndex(code: string, offset: number): number {
  let idx = offset;
  while (idx < code.length && (code[idx] ?? '') <= ' ') idx += 1;
  return idx;
}

function endsWithWord(code: string, end: number, word: string): boolean {
  const start = end - word.length + 1;
  return code.slice(start, end + 1) === word && !/[\w$]/.test(code[start - 1] ?? '');
}

type Range = { start: number; end: number };
/** A send's arguments, a value assigned to a declaration, or code whose reads go nowhere. */
type Region = Range & { kind: 'send' | 'value' | 'barrier'; declaration: number };
type Declaration = { name: string; scope: Range; isClient: boolean };
type NameUse = { name: string; offset: number };
type Assignment = NameUse & { valueStart: number };
/** A declared name, the offset of its statement's keyword, and the start of its initializer. */
type Declarator = NameUse & { valueStart: number | undefined };
type Declarators = { names: Declarator[]; patterns: Array<Range & { offset: number }> };
/** A function: its parameter list or single parameter, and where its body starts. */
type FunctionShape = { parameters: Range; body: number; braced: boolean };
type BracketScan = {
  /** For each opening bracket offset, the offset of its closing bracket, else the code length. */
  closing: Int32Array;
  braces: number[];
  functions: FunctionShape[];
  /** 1 at each line break after an operator that continues the expression. */
  lineContinues: Uint8Array;
};

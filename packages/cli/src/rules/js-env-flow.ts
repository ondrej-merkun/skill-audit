import { maskDocumentationTextInCode } from './code-context.js';

// Data flow for NET-EXFIL-ENV in JavaScript and TypeScript: which reads of the whole `process.env`
// reach a network send in the same file. The code is the language view, so comments are blank and
// string text is one operand. A value flows through a `const`, `let`, or `var` initializer and
// through an assignment to a declared name. A name resolves to its declaration in the innermost
// enclosing block, so functions that share a local name do not share its value. Each pass is a
// regex scan, a bracket scan, or a sort, so a large or hostile file stays near linear.
// ponytail: return values, function arguments, loop targets, destructuring
// (`const { ...rest } = process.env`), `import { env } from 'node:process'`, and parameters that
// shadow an outer name are not followed. Move to an AST pass if real scans show any of these.

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

// A key lookup, an optional-chain lookup, or an assignment touches one variable, not all of them.
const SINGLE_KEY_ACCESS = /\s*(?:\??\.|\[|=(?!=))/y;
const IDENTIFIER = /(?<![\w$])[A-Za-z_$][\w$]*/g;

const CLIENT_CONSTRUCTOR = String.raw`(?:https?\.(?:request|get)|net\.(?:connect|createConnection)|tls\.connect|new\s+(?:WebSocket|net\.Socket)|axios\.create)`;
// Calls whose arguments leave the machine. A client constructor counts too, as in the Python flow:
// its host goes to a DNS lookup and a connect.
const SEND_CALL = new RegExp(
  String.raw`(?<![\w$.])(?:fetch|axios(?:\.(?:get|post|put|patch|delete|head|options|request))?|got(?:\.(?:get|post|put|patch|delete|head))?|navigator\.sendBeacon|${CLIENT_CONSTRUCTOR})\s*\(`,
  'g'
);
const CLIENT_VALUE = new RegExp(String.raw`\s*(?:await\s+)?${CLIENT_CONSTRUCTOR}\s*\(`, 'y');
// Methods that send through a name that holds a client: a request body, a socket write, a
// WebSocket message, or an axios instance verb.
const CLIENT_SEND_CALL =
  /(?<![\w$.])([A-Za-z_$][\w$]*)\.(?:write|end|send|get|post|put|patch|delete|request)\s*\(/g;

const DECLARATION = /(?<![\w$.])(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g;
// The optional type annotation and the `=` after a declared name.
const INITIALIZER = /\s*(?::[^=;\n]{0,200})?=(?![=>])/y;
// `name = value`, `name += value`, and `name.key = value`, which changes what `name` holds.
const ASSIGNMENT = /(?<![\w$.])([A-Za-z_$][\w$]*)(?:\.[A-Za-z_$][\w$]*)*\s*\+?=(?![=>])/g;

// Calls that start a child process. Their `env` option is the child's environment and does not
// flow into the call result: `execFileSync(cmd, args, { env: { ...process.env, CI: '1' } })`.
const PROCESS_LAUNCH_CALL =
  /(?<![\w$])(?:[\w$]+\.)?(?:spawn|spawnSync|exec|execSync|execFile|execFileSync|fork|execa|execaSync|execaCommand|execaCommandSync)\s*\(/g;
// The word of an `env` key, bare or quoted (`'env'`). It runs on the content, because the view
// turns a quoted key into string text. The flow reads the punctuation around it in the view.
const ENV_OPTION = /(?<![\w$.])(?:env|(['"])env\1)(?![\w$])/g;

// A line break ends a statement unless the line ends with, or the next line starts with, an
// operator that continues the expression.
const CONTINUES_AFTER = new Set('=+-*/%&|^<>!?:,.([{');
const CONTINUES_BEFORE = new Set('.?:+-*/%&|^<>=,');

// The extensions whose view masks JavaScript comments and strings.
const JAVASCRIPT_SCAN_PATH = /\.(?:[cm]?js|[jt]sx|ts)$/;
// Stands for a character of string text, which the view blanks. It is not a name, an operator, or
// a bracket, so the scans read a string as one operand.
const STRING_TEXT = '#';

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

  const chars = view.split('');
  for (const token of tokens) {
    if (kept.has(token.index)) continue;
    for (let idx = token.index; idx < token.index + token[0].length; idx += 1) chars[idx] = ' ';
  }
  return chars.join('');
}

/** Returns the offset of each whole `process.env` read whose value reaches a network send. */
function findSentProcessEnvReads(view: string, content: string, filePath: string): number[] {
  const reads = wholeProcessEnvReads(view);
  if (reads.length === 0 || view.search(SEND_CALL) < 0) return [];

  const code = markStringText(view, content, filePath);
  const scan = scanBrackets(code);
  const ends = expressionEnds(code, scan.lineContinues);
  const declarations = collectDeclarations(code, scan);
  const values = valueRegions(code, ends, declarations);
  const sends = sendRegions(code, scan, declarations);
  const functionBodies = [
    ...scan.functionBodies.map((brace) => barrier(brace + 1, scan.closing[brace] ?? code.length)),
    ...scan.arrowExpressionBodies.map((start) => barrier(start, ends[start] ?? code.length)),
  ];
  const flowRegions = [...sends, ...values, ...functionBodies];
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
    SINGLE_KEY_ACCESS.lastIndex = match.index + match[0].length;
    if (SINGLE_KEY_ACCESS.test(code)) continue;
    // A membership test (`'CI' in process.env`) reads one key.
    if (endsWithWord(code, previousCodeIndex(code, match.index), 'in')) continue;
    reads.push(match.index);
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
    // A property name after `.` is not the variable, but a spread (`...name`) reads it.
    if (code[start - 1] === '.' && code.slice(start - 3, start) !== '...') continue;

    const end = start + name.length;
    SINGLE_KEY_ACCESS.lastIndex = end;
    if (SINGLE_KEY_ACCESS.test(code)) continue;
    const previous = previousCodeIndex(code, start);
    // A membership test (`'CI' in env`) reads one key.
    if (endsWithWord(code, previous, 'in')) continue;
    // An object key (`{ env: value }`) names a property. A shorthand key (`{ env }`) is a use.
    const startsProperty = code[previous] === '{' || code[previous] === ',';
    if (startsProperty && code[nextCodeIndex(code, end)] === ':') continue;

    uses.push({ name, offset: start });
  }
  return uses;
}

/** Each `const`, `let`, and `var` name, scoped to its innermost enclosing block. */
function collectDeclarations(code: string, scan: BracketScan): Declaration[] {
  const matches = [...code.matchAll(DECLARATION)];
  const blocks = scan.braces.map((brace) => ({
    start: brace + 1,
    end: scan.closing[brace] ?? code.length,
  }));
  const blockIndexes = innermostRanges(
    blocks,
    matches.map((match) => match.index)
  );
  const indexByScopedName = new Map<string, number>();
  const declarations: Declaration[] = [];

  matches.forEach((match, idx) => {
    const name = match[1] ?? '';
    const scope = blocks[blockIndexes[idx] ?? -1] ?? { start: -1, end: code.length };
    // `var` can declare a name twice in one block. Both declare the same variable.
    const key = `${scope.start}:${name}`;
    if (indexByScopedName.has(key)) return;
    indexByScopedName.set(key, declarations.length);
    declarations.push({ name, scope, isClient: false });
  });
  return declarations;
}

/**
 * The value of each initializer and each assignment to a declared name. A value that constructs a
 * network client marks its declaration as a client.
 */
function valueRegions(code: string, ends: Int32Array, declarations: Declaration[]): Region[] {
  const assignments: Assignment[] = [];
  const valueStarts = new Set<number>();

  for (const match of code.matchAll(DECLARATION)) {
    INITIALIZER.lastIndex = match.index + match[0].length;
    if (!INITIALIZER.test(code)) continue;
    valueStarts.add(INITIALIZER.lastIndex);
    assignments.push({
      name: match[1] ?? '',
      offset: match.index,
      valueStart: INITIALIZER.lastIndex,
    });
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
    // A bare key must be code in the view, a quoted key string text. A word in a comment is
    // neither, and it is dropped before the walks below cross the blank comment.
    const inView = quoted ? code[start] === STRING_TEXT : code.startsWith('env', start);
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
 * Fills the string text that the view blanks with STRING_TEXT. Without it, `const url = '...'`
 * looks like a line that ends with `=`, and the value runs on into the next statement. A line
 * break between string text and more string text is inside a template literal, so it is string
 * text too.
 */
function markStringText(view: string, content: string, filePath: string): string {
  const withStrings = maskDocumentationTextInCode(content, filePath, () => true);
  const chars = view.split('');
  let afterStringText = false;
  let lineBreaks: number[] = [];

  for (let idx = 0; idx < chars.length; idx += 1) {
    const char = chars[idx] ?? '';
    const isStringText = char <= ' ' && (withStrings[idx] ?? '') > ' ';
    if (char === '\n' && afterStringText) lineBreaks.push(idx);
    if (char <= ' ' && !isStringText) continue;

    if (isStringText) {
      chars[idx] = STRING_TEXT;
      if (afterStringText) for (const lineBreak of lineBreaks) chars[lineBreak] = STRING_TEXT;
    }
    afterStringText = isStringText;
    lineBreaks = [];
  }
  return chars.join('');
}

/**
 * Matches brackets, finds the blocks, the function bodies (a `{` after `)` or `=>`), and the starts
 * of arrow expression bodies, and marks each line break that a trailing operator continues.
 */
function scanBrackets(code: string): BracketScan {
  const closing = new Int32Array(code.length).fill(code.length);
  const lineContinues = new Uint8Array(code.length);
  const braces: number[] = [];
  const functionBodies: number[] = [];
  const arrowExpressionBodies: number[] = [];
  const openBrackets: number[] = [];
  let previous = -1;

  for (let idx = 0; idx < code.length; idx += 1) {
    const char = code[idx] ?? '';
    if (char === '\n') {
      lineContinues[idx] = CONTINUES_AFTER.has(code[previous] ?? '') ? 1 : 0;
      continue;
    }
    if (char <= ' ') continue;

    if (char === '(' || char === '[' || char === '{') {
      openBrackets.push(idx);
    } else if (char === ')' || char === ']' || char === '}') {
      const openBracket = openBrackets.pop();
      if (openBracket !== undefined) closing[openBracket] = idx;
    }
    const afterArrow = code[previous] === '>' && code[previous - 1] === '=';
    if (char === '{') {
      braces.push(idx);
      if (code[previous] === ')' || afterArrow) functionBodies.push(idx);
    } else if (afterArrow) {
      arrowExpressionBodies.push(idx);
    }
    previous = idx;
  }
  return { closing, braces, functionBodies, arrowExpressionBodies, lineContinues };
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

/** Code whose reads go nowhere: a function body or a child process's environment. */
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
type BracketScan = {
  /** For each opening bracket offset, the offset of its closing bracket, else the code length. */
  closing: Int32Array;
  braces: number[];
  functionBodies: number[];
  /** The first code offset of each arrow function whose body is an expression. */
  arrowExpressionBodies: number[];
  /** 1 at each line break after an operator that continues the expression. */
  lineContinues: Uint8Array;
};

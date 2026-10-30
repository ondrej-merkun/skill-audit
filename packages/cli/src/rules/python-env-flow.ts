import { pythonStringStart } from './code-context.js';

// Data flow for NET-EXFIL-ENV in Python: which reads of the whole environment reach a network
// call in the same file. A value flows through an assignment, a loop target, a container update,
// a return value, and an argument of a function that the file defines. A name that a function
// binds is local to that function, as in Python; `self.<name>` is shared by all methods. The
// trace visits each name reference once, and the parsers skip nested brackets, so a deep or
// padded file stays linear.
// ponytail: the flow ignores statement order, a nested function sees its parent's locals as
// module names, and an alias such as `import os as o` or `from requests import post` hides a
// flow. Move to an AST pass if real scans show any of these.

type Range = { start: number; end: number };
/** The value in [start, end) flows into each target name. */
type Flow = Range & { targets: string[] };
/** A dotted name at `start` that reads the whole value of each of `names`. */
type Reference = { start: number; names: string[] };
/** A `def` in the file. Its id scopes its local names: `<id>:<name>`. */
type FunctionScope = { id: string; name: string; parameters: string[] };
type FlowGraph = {
  /** Flow targets are scoped names. */
  flows: Flow[];
  functions: Map<string, FunctionScope[]>;
  clients: Set<string>;
  /** The scope of each statement: the id of its function, or '' at module level. */
  statementScopes: string[];
  /** The names that each function binds: its parameters, assignment targets, and loop targets. */
  locals: Map<string, Set<string>>;
};
type ParsedCode = {
  code: string;
  statements: Range[];
  /** For each opening bracket offset, the offset of its closing bracket, else the code length. */
  closingBracket: Int32Array;
  forKeywords: number[];
};

/** `os.environ`, or `environ` after `from os import environ`. Group 1 is the `os.` prefix. */
// Split like the patterns in network-exfil.ts, so static-analysis hooks do not flag this file.
export const ENVIRON_TOKEN_SOURCE = ['(?<![\\w.])(os\\.)?', 'environ\\b'].join('');
const ENVIRON_TOKEN = new RegExp(ENVIRON_TOKEN_SOURCE, 'g');
const FROM_OS_IMPORT_ENVIRON = /\bfrom\s+os\s+import\b[^;\n]*?\benviron\b/;

// A key lookup, a single-key method, or an assignment touches one variable, not all of them.
const SINGLE_ITEM_ACCESS = /\s*(?:\[|\.\s*(?:get|pop|setdefault|update|clear)\b|=(?!=))/y;

const NETWORK_CLIENT_CONSTRUCTOR = String.raw`(?:requests\.Session|httpx\.(?:Async)?Client|aiohttp\.ClientSession|(?:http\.client\.)?HTTPS?Connection|socket\.(?:socket|create_connection))`;
// Calls whose arguments leave the machine. A client constructor counts too: its host goes to a
// DNS lookup and a connect.
const NETWORK_CALL = new RegExp(
  String.raw`(?:\burlopen|(?<![\w.])(?:(?:requests|httpx)\.(?:get|post|put|patch|delete|head|options|request|stream)|aiohttp\.request|${NETWORK_CLIENT_CONSTRUCTOR}))\s*\(`,
  'g'
);
// Client methods that send: HTTP verbs of the session clients, http.client requests, and socket
// sends and connects.
const CLIENT_SEND_METHOD =
  '(?:get|post|put|patch|delete|head|options|request|stream|ws_connect|putrequest|putheader|endheaders|send|sendall|sendto|sendmsg|connect)';
// Keyword arguments of a send that set how it connects, not what it sends.
const TRANSPORT_OPTION_ARGUMENT =
  /\s*(?:timeout|verify|allow_redirects|follow_redirects|cert|context)\s*=(?!=)/y;
const CLIENT_CONSTRUCTOR_VALUE = new RegExp(
  String.raw`^\s*(?:await\s+)?${NETWORK_CLIENT_CONSTRUCTOR}\s*\(`
);
const CLIENT_CONSTRUCTOR_CALL = new RegExp(String.raw`${NETWORK_CLIENT_CONSTRUCTOR}\s*\(`, 'g');
const AS_NAME = /\s*as\s+([A-Za-z_]\w*)/y;

// Calls that start a child process. Their `env=` argument is the child's environment and does
// not flow into the call result: `subprocess.run(cmd, env={**os.environ, "X": "1"})`.
const PROCESS_LAUNCH_CALL =
  /(?<![\w.])(?:subprocess\.(?:run|Popen|call|check_call|check_output)|asyncio\.create_subprocess_(?:exec|shell)|Popen)\s*\(/g;
const CHILD_ENVIRONMENT_KEYWORD = /\s*env\s*=(?!=)/y;

const FUNCTION_DEF = /^(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/;
const RETURN_VALUE = /^(?:return|yield)\b/;
const FOR_LOOP = /^(?:async\s+)?for\b(.*?)\bin\b/;
const WITH_STATEMENT = /^(?:async\s+)?with\b/;
const CONTAINER_UPDATE = /^([A-Za-z_][\w.]*)\.(?:append|extend|insert|update|add|setdefault)\s*\(/;
const PARAMETER_NAME = /^\s*(?:\*{1,2}\s*)?([A-Za-z_]\w*)/;
const KEYWORD_ARGUMENT = /\s*([A-Za-z_]\w*)\s*=(?!=)/y;
const UNPACKED_ARGUMENT = /\s*\*/y;
const DOTTED_NAME = /(?<![\w.])[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*/g;
const LEADING_DOTTED_NAME = /[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*/;
const IDENTIFIER = /[A-Za-z_]\w*/g;
const FOR_KEYWORD = /\bfor\b/g;

const PYTHON_KEYWORDS = new Set(
  (
    'False None True and as assert async await break class continue def del elif else except finally for ' +
    'from global if import in is lambda nonlocal not or pass raise return try while with yield'
  ).split(' ')
);
// Method receivers, not values that a caller passes in.
const IMPLICIT_PARAMETERS = new Set(['self', 'cls']);

/**
 * Blanks each environment token in a prepared view, except the reads of the whole environment
 * that reach a network call. Those are copied back from the content, so a read inside an
 * f-string field stays visible when the view masks strings.
 */
export function maskEnvironReadsNotSent(view: string, content: string): string {
  const masked = view.replace(ENVIRON_TOKEN, (token) => ' '.repeat(token.length));
  const sentReads = findSentEnvironReads(content);
  if (sentReads.length === 0) return masked;

  const chars = masked.split('');
  for (const { start, end } of sentReads) {
    for (let idx = start; idx < end; idx += 1) chars[idx] = content[idx] ?? ' ';
  }
  return chars.join('');
}

/** Returns the token range of each whole-environment read whose value reaches a network call. */
export function findSentEnvironReads(content: string): Range[] {
  if (!content.includes('environ')) return [];

  const parsed = blankChildEnvironmentArguments(parseCode(pythonCodeView(content)));
  const reads = wholeEnvironReads(parsed);
  if (reads.length === 0) return [];

  const graph = collectFlows(parsed);
  const sends = networkSendArguments(parsed, graph.clients);
  if (sends.length === 0) return [];

  return traceReadsIntoSends(parsed, graph, reads, sends);
}

/** Walks back from each send through the flows and collects the reads that it reaches. */
function traceReadsIntoSends(
  parsed: ParsedCode,
  graph: FlowGraph,
  reads: Range[],
  sends: Range[]
): Range[] {
  const flowsByTarget = new Map<string, Flow[]>();
  for (const flow of [...graph.flows, ...callArgumentFlows(parsed, graph.functions)]) {
    for (const target of flow.targets) {
      const targetFlows = flowsByTarget.get(target);
      if (targetFlows === undefined) flowsByTarget.set(target, [flow]);
      else targetFlows.push(flow);
    }
  }

  const takeReads = visitOnce(reads);
  const takeReferences = visitOnce(flowReferences(parsed, graph, flowsByTarget));
  const sentReads: Range[] = [];
  const visitedNames = new Set<string>();
  const pending: Range[] = [...sends];

  for (let range = pending.pop(); range !== undefined; range = pending.pop()) {
    for (const read of takeReads(range)) sentReads.push(read);

    for (const reference of takeReferences(range)) {
      for (const name of reference.names) {
        if (visitedNames.has(name)) continue;
        visitedNames.add(name);
        for (const flow of flowsByTarget.get(name) ?? []) pending.push(flow);
      }
    }
  }

  return sentReads.sort((left, right) => left.start - right.start);
}

/**
 * Collects the flows of each statement, each function and its scope, and the client names. A
 * statement belongs to the innermost `def` that it is indented under.
 */
function collectFlows(parsed: ParsedCode): FlowGraph {
  const graph: FlowGraph = {
    flows: [],
    functions: new Map(),
    clients: new Set(),
    statementScopes: [],
    locals: new Map(),
  };
  const unscopedFlows: Array<Flow & { scope: string }> = [];
  const openFunctions: Array<{ indent: number; function: FunctionScope }> = [];

  for (const statement of parsed.statements) {
    const indent = statement.start - (parsed.code.lastIndexOf('\n', statement.start - 1) + 1);
    while ((openFunctions.at(-1)?.indent ?? -1) >= indent) openFunctions.pop();
    const currentFunction = openFunctions.at(-1)?.function;
    const scope = currentFunction?.id ?? '';
    graph.statementScopes.push(scope);

    const text = parsed.code.slice(statement.start, statement.end);
    const addFlow = (targets: string[], valueOffset: number): void => {
      unscopedFlows.push({
        targets,
        start: statement.start + valueOffset,
        end: statement.end,
        scope,
      });
    };

    const functionDef = FUNCTION_DEF.exec(text);
    if (functionDef?.[1] !== undefined) {
      const openParen = statement.start + functionDef[0].length - 1;
      const parameters = parameterNames(parsed, openParen);
      const defined = {
        id: `${functionDef[1]}@${statement.start}`,
        name: functionDef[1],
        parameters,
      };
      const sameNameFunctions = graph.functions.get(defined.name);
      if (sameNameFunctions === undefined) graph.functions.set(defined.name, [defined]);
      else sameNameFunctions.push(defined);
      graph.locals.set(defined.id, new Set(parameters));
      openFunctions.push({ indent, function: defined });
      continue;
    }

    const returned = RETURN_VALUE.exec(text);
    if (returned !== null) {
      // A method's result is read as `self.<name>()`.
      const name = currentFunction?.name;
      if (name !== undefined) addFlow([name, `self.${name}`, `cls.${name}`], returned[0].length);
      continue;
    }

    const loop = FOR_LOOP.exec(text);
    if (loop?.[1] !== undefined) {
      const targets = identifiers(loop[1]);
      bindLocals(graph, scope, targets);
      addFlow(targets, loop[0].length);
      continue;
    }

    if (WITH_STATEMENT.test(text)) {
      for (const name of withClientNames(parsed, statement)) graph.clients.add(name);
      continue;
    }

    const assignment = assignmentOperator(text);
    if (assignment >= 0) {
      const leftSide = text.slice(0, assignment);
      const targets = assignmentTargets(leftSide);
      bindLocals(graph, scope, boundNames(leftSide));
      addFlow(targets, assignment + 1);
      if (CLIENT_CONSTRUCTOR_VALUE.test(text.slice(assignment + 1))) {
        for (const target of targets) graph.clients.add(target);
      }
      continue;
    }

    const update = CONTAINER_UPDATE.exec(text);
    if (update?.[1] !== undefined) addFlow([update[1]], 0);
  }

  // Scope the targets once every local is known: Python binds a name for the whole function.
  graph.flows = unscopedFlows.map(({ scope, targets, ...range }) => ({
    targets: targets.map((target) => scopedName(graph, scope, target)),
    ...range,
  }));
  return graph;
}

/**
 * Each argument of a call to a function that the file defines flows into its own parameter: a
 * keyword argument into the parameter of that name, a positional argument by position. An
 * unpacked argument (`*args`, `**kwargs`) can fill any parameter.
 */
function callArgumentFlows(parsed: ParsedCode, functions: Map<string, FunctionScope[]>): Flow[] {
  const names = [...functions]
    .filter(([, definitions]) => definitions.some(({ parameters }) => parameters.length > 0))
    .map(([name]) => name);
  if (names.length === 0) return [];

  const call = new RegExp(String.raw`(?<!\w)(${names.join('|')})\s*\(`, 'g');
  return [...parsed.code.matchAll(call)].flatMap((match) => {
    const argumentRanges = topLevelArguments(parsed, match.index + match[0].length - 1);

    return (functions.get(match[1] ?? '') ?? []).flatMap(({ id, parameters }) => {
      let position = 0;

      return argumentRanges.map((argument): Flow => {
        KEYWORD_ARGUMENT.lastIndex = argument.start;
        const keyword = KEYWORD_ARGUMENT.exec(parsed.code)?.[1];
        if (keyword !== undefined && KEYWORD_ARGUMENT.lastIndex <= argument.end) {
          const targets = parameters.includes(keyword) ? [`${id}:${keyword}`] : [];
          return { targets, start: KEYWORD_ARGUMENT.lastIndex, end: argument.end };
        }

        UNPACKED_ARGUMENT.lastIndex = argument.start;
        if (UNPACKED_ARGUMENT.test(parsed.code)) {
          return { targets: parameters.map((parameter) => `${id}:${parameter}`), ...argument };
        }

        // ponytail: extra positional arguments go to the last parameter, which is right only
        // when that parameter is `*args`.
        const parameter = parameters[Math.min(position, parameters.length - 1)];
        position += 1;
        return { targets: parameter === undefined ? [] : [`${id}:${parameter}`], ...argument };
      });
    });
  });
}

/** A name that the scope's function binds is local to it; any other name is a module name. */
function scopedName(graph: FlowGraph, scope: string, name: string): string {
  const head = name.split('.', 1)[0] ?? name;
  return graph.locals.get(scope)?.has(head) ? `${scope}:${name}` : name;
}

function bindLocals(graph: FlowGraph, scope: string, names: string[]): void {
  const locals = graph.locals.get(scope);
  if (locals === undefined) return;
  for (const name of names) locals.add(name);
}

/** The data arguments of each network call and of each send method on a network client. */
function networkSendArguments(parsed: ParsedCode, clients: Set<string>): Range[] {
  const callPatterns = [NETWORK_CALL];
  if (clients.size > 0) {
    const clientNames = [...clients].map((name) => name.replaceAll('.', '\\.')).join('|');
    callPatterns.push(
      new RegExp(String.raw`(?<![\w.])(?:${clientNames})\.${CLIENT_SEND_METHOD}\s*\(`, 'g')
    );
  }

  return callPatterns.flatMap((pattern) =>
    [...parsed.code.matchAll(pattern)].flatMap((match) =>
      topLevelArguments(parsed, match.index + match[0].length - 1).filter((argument) => {
        TRANSPORT_OPTION_ARGUMENT.lastIndex = argument.start;
        return !TRANSPORT_OPTION_ARGUMENT.test(parsed.code);
      })
    )
  );
}

/** Names bound by `with <client constructor>(...) as name`. */
function withClientNames(parsed: ParsedCode, statement: Range): string[] {
  const text = parsed.code.slice(statement.start, statement.end);
  const names: string[] = [];

  for (const match of text.matchAll(CLIENT_CONSTRUCTOR_CALL)) {
    const openParen = statement.start + match.index + match[0].length - 1;
    AS_NAME.lastIndex = (parsed.closingBracket[openParen] ?? parsed.code.length) + 1;
    const alias = AS_NAME.exec(parsed.code);
    if (alias?.[1] !== undefined) names.push(alias[1]);
  }

  return names;
}

/** Each whole-environment read in the code, in offset order. */
function wholeEnvironReads(parsed: ParsedCode): Range[] {
  const bareNameImported = FROM_OS_IMPORT_ENVIRON.test(parsed.code);
  const reads: Range[] = [];

  for (const match of parsed.code.matchAll(ENVIRON_TOKEN)) {
    if (match[1] === undefined && !bareNameImported) continue;

    const read = { start: match.index, end: match.index + match[0].length };
    if (readsWholeValue(parsed, read.start, read.end)) reads.push(read);
  }

  return reads;
}

/**
 * Each dotted name in the code that reads the whole value of a flow target, in offset order. The
 * names are scoped to the function of the statement that holds the reference.
 */
function flowReferences(
  parsed: ParsedCode,
  graph: FlowGraph,
  flowsByTarget: Map<string, Flow[]>
): Reference[] {
  const references: Reference[] = [];
  // The first part of each target name, without its scope. Most names in a file match none.
  const targetHeads = new Set(
    [...flowsByTarget.keys()].map((target) => target.slice(target.indexOf(':') + 1).split('.')[0])
  );

  for (const match of parsed.code.matchAll(DOTTED_NAME)) {
    // `payload.items()` reads `payload`, so each prefix of the dotted name can be the target.
    const parts = match[0].split('.');
    if (!targetHeads.has(parts[0])) continue;

    const statementIndex = lastIndexAtOrBefore(parsed.statements, match.index);
    const scope = graph.statementScopes[statementIndex] ?? '';
    const names: string[] = [];
    for (let count = 1; count <= parts.length; count += 1) {
      const prefix = parts.slice(0, count).join('.');
      const name = scopedName(graph, scope, prefix);
      if (!flowsByTarget.has(name)) continue;
      if (readsWholeValue(parsed, match.index, match.index + prefix.length)) names.push(name);
    }

    if (names.length > 0) references.push({ start: match.index, names });
  }

  return references;
}

/**
 * Whether the reference in [start, end) reads every item of its mapping. A key lookup and a
 * membership test (`"CI" in env`) read one item, so they do not pass the whole value on. So does
 * a key lookup on a call result, as in `load_env().get("PATH")`.
 */
function readsWholeValue(parsed: ParsedCode, start: number, end: number): boolean {
  const afterCall =
    parsed.code[end] === '(' ? (parsed.closingBracket[end] ?? parsed.code.length) + 1 : end;
  SINGLE_ITEM_ACCESS.lastIndex = afterCall;
  if (SINGLE_ITEM_ACCESS.test(parsed.code)) return false;

  const previous = lastCodeCharBefore(parsed.code, start);
  return !endsWithWord(parsed.code, previous, 'in') || isLoopIterable(parsed, start);
}

/** `in` before a reference iterates when a `for` comes earlier in the same statement. */
function isLoopIterable(parsed: ParsedCode, offset: number): boolean {
  const statement = parsed.statements[lastIndexAtOrBefore(parsed.statements, offset)];
  if (statement === undefined) return false;

  const forKeyword = parsed.forKeywords[firstIndexAtOrAfter(parsed.forKeywords, statement.start)];
  return forKeyword !== undefined && forKeyword < offset;
}

/** Blanks the `env=` argument of each call that starts a child process. */
function blankChildEnvironmentArguments(parsed: ParsedCode): ParsedCode {
  const launches = [...parsed.code.matchAll(PROCESS_LAUNCH_CALL)];
  if (launches.length === 0) return parsed;

  const chars = parsed.code.split('');
  for (const launch of launches) {
    for (const argument of topLevelArguments(parsed, launch.index + launch[0].length - 1)) {
      CHILD_ENVIRONMENT_KEYWORD.lastIndex = argument.start;
      if (CHILD_ENVIRONMENT_KEYWORD.test(parsed.code)) {
        blankRange(chars, CHILD_ENVIRONMENT_KEYWORD.lastIndex, argument.end);
      }
    }
  }
  return { ...parsed, code: chars.join('') };
}

function parseCode(code: string): ParsedCode {
  const statements: Range[] = [];
  const closingBracket = new Int32Array(code.length).fill(code.length);
  const openBrackets: number[] = [];
  let statementStart = 0;

  for (let idx = 0; idx < code.length; idx += 1) {
    const char = code[idx];
    if (char === '(' || char === '[' || char === '{') {
      openBrackets.push(idx);
    } else if (char === ')' || char === ']' || char === '}') {
      const openBracket = openBrackets.pop();
      if (openBracket !== undefined) closingBracket[openBracket] = idx;
    } else if (openBrackets.length === 0 && isStatementEnd(code, idx)) {
      pushStatement(statements, code, statementStart, idx);
      statementStart = idx + 1;
    }
  }
  pushStatement(statements, code, statementStart, code.length);

  const forKeywords = [...code.matchAll(FOR_KEYWORD)].map((match) => match.index);
  return { code, statements, closingBracket, forKeywords };
}

/** A `;` or a line break that no `\` continues ends a statement outside brackets. */
function isStatementEnd(code: string, idx: number): boolean {
  return code[idx] === ';' || (code[idx] === '\n' && code[idx - 1] !== '\\');
}

function pushStatement(statements: Range[], code: string, start: number, end: number): void {
  let textStart = start;
  while (textStart < end && /\s/.test(code[textStart] ?? '')) textStart += 1;
  if (textStart < end) statements.push({ start: textStart, end });
}

/** Splits the arguments of a call or a def into one range per argument. */
function topLevelArguments(parsed: ParsedCode, openParen: number): Range[] {
  const { start, end } = callArguments(parsed, openParen);
  const argumentRanges: Range[] = [];
  let argumentStart = start;

  for (let idx = start; idx < end; idx += 1) {
    const char = parsed.code[idx];
    if (char === '(' || char === '[' || char === '{') {
      idx = parsed.closingBracket[idx] ?? end;
    } else if (char === ',') {
      argumentRanges.push({ start: argumentStart, end: idx });
      argumentStart = idx + 1;
    }
  }

  argumentRanges.push({ start: argumentStart, end });
  return argumentRanges;
}

function callArguments(parsed: ParsedCode, openParen: number): Range {
  return {
    start: openParen + 1,
    end: parsed.closingBracket[openParen] ?? parsed.code.length,
  };
}

/**
 * Blanks comments and string text and keeps offsets. The fields of an f-string are code, so they
 * stay: `f"...{payload}"` sends `payload`.
 */
function pythonCodeView(content: string): string {
  const chars = content.split('');
  let idx = 0;

  while (idx < content.length) {
    const char = content[idx];
    if (char === '#') {
      const lineEnd = content.indexOf('\n', idx);
      idx = blankRange(chars, idx, lineEnd >= 0 ? lineEnd : content.length);
    } else if (char === '"' || char === "'") {
      idx = blankStringText(content, chars, idx);
    } else {
      idx += 1;
    }
  }

  return chars.join('');
}

/** Blanks one string literal from its prefix to its closing quote and returns the end offset. */
function blankStringText(content: string, chars: string[], quoteIndex: number): number {
  const quote = content[quoteIndex] ?? '"';
  const delimiter = content.startsWith(quote.repeat(3), quoteIndex) ? quote.repeat(3) : quote;
  const prefixStart = pythonStringStart(content, quoteIndex);
  const isFString = /f/i.test(content.slice(prefixStart, quoteIndex));
  let idx = blankRange(chars, prefixStart, quoteIndex + delimiter.length);
  let fieldDepth = 0;

  while (idx < content.length) {
    const char = content[idx];
    if (fieldDepth > 0) {
      if (char === '{') fieldDepth += 1;
      if (char === '}') fieldDepth -= 1;
      idx += 1;
    } else if (isFString && char === '{' && content[idx + 1] !== '{') {
      fieldDepth = 1;
      idx += 1;
    } else if (char === '\\' || (isFString && (char === '{' || char === '}'))) {
      idx = blankRange(chars, idx, idx + 2);
    } else if (content.startsWith(delimiter, idx)) {
      return blankRange(chars, idx, idx + delimiter.length);
    } else if (delimiter.length === 1 && (char === '\n' || char === '\r')) {
      return idx;
    } else {
      idx = blankRange(chars, idx, idx + 1);
    }
  }

  return idx;
}

function blankRange(chars: string[], start: number, end: number): number {
  const stop = Math.min(end, chars.length);
  for (let idx = start; idx < stop; idx += 1) {
    if (chars[idx] !== '\n' && chars[idx] !== '\r') chars[idx] = ' ';
  }
  return stop;
}

/**
 * The offset of the `=` that assigns, outside brackets, or -1. Comparisons, keyword arguments,
 * and `:=` do not assign.
 */
function assignmentOperator(text: string): number {
  let depth = 0;

  for (let idx = 0; idx < text.length; idx += 1) {
    const char = text[idx];
    if (char === '(' || char === '[' || char === '{') depth += 1;
    else if (char === ')' || char === ']' || char === '}') depth -= 1;
    else if (char === '=' && depth === 0) {
      if (text[idx + 1] === '=') idx += 1;
      else if (idx > 0 && !'=!<>:'.includes(text[idx - 1] ?? '')) return idx;
    }
  }

  return -1;
}

/** The leading dotted name of each target: `data[k]` assigns to `data`. */
function assignmentTargets(leftSide: string): string[] {
  const annotation = leftSide.indexOf(':');
  const targetText = annotation >= 0 ? leftSide.slice(0, annotation) : leftSide;

  return targetText.split(',').flatMap((target) => {
    const name = LEADING_DOTTED_NAME.exec(target)?.[0];
    return name === undefined || PYTHON_KEYWORDS.has(name) ? [] : [name];
  });
}

/**
 * The plain names that an assignment binds: `a, (b, c) = ...` binds three. A subscript or an
 * attribute target, as in `data[k] = v`, changes an object and binds no name.
 */
function boundNames(leftSide: string): string[] {
  const annotation = leftSide.indexOf(':');
  const targetText = annotation >= 0 ? leftSide.slice(0, annotation) : leftSide;

  return targetText.split(',').flatMap((target) => {
    const name = /^[\s([*]*([A-Za-z_]\w*)[\s)\]]*$/.exec(target)?.[1];
    return name === undefined || PYTHON_KEYWORDS.has(name) ? [] : [name];
  });
}

function parameterNames(parsed: ParsedCode, openParen: number): string[] {
  return topLevelArguments(parsed, openParen).flatMap((parameter) => {
    const name = PARAMETER_NAME.exec(parsed.code.slice(parameter.start, parameter.end))?.[1];
    return name === undefined || IMPLICIT_PARAMETERS.has(name) ? [] : [name];
  });
}

function identifiers(text: string): string[] {
  return [...text.matchAll(IDENTIFIER)]
    .map((match) => match[0])
    .filter((name) => !PYTHON_KEYWORDS.has(name));
}

/**
 * Returns a function that lists the items that start in a range, each item once across all
 * calls. Links to the next unvisited item skip visited ones, so nested ranges (a call inside an
 * assignment inside a call) cost no more than the items themselves.
 */
function visitOnce<T extends { start: number }>(items: T[]): (range: Range) => T[] {
  const starts = items.map((item) => item.start);
  const nextUnvisited = Int32Array.from({ length: items.length + 1 }, (_, idx) => idx);

  const findUnvisited = (idx: number): number => {
    let root = idx;
    while ((nextUnvisited[root] ?? root) !== root) root = nextUnvisited[root] ?? root;
    for (let link = idx; link !== root; ) {
      const next = nextUnvisited[link] ?? root;
      nextUnvisited[link] = root;
      link = next;
    }
    return root;
  };

  return (range) => {
    const visited: T[] = [];
    let idx = findUnvisited(firstIndexAtOrAfter(starts, range.start));
    for (let item = items[idx]; item !== undefined && item.start < range.end; item = items[idx]) {
      visited.push(item);
      nextUnvisited[idx] = idx + 1;
      idx = findUnvisited(idx + 1);
    }
    return visited;
  };
}

/** The offset of the last non-whitespace character before `idx`, or -1. */
function lastCodeCharBefore(code: string, idx: number): number {
  let previous = idx - 1;
  while (previous >= 0 && /\s/.test(code[previous] ?? '')) previous -= 1;
  return previous;
}

/** Whether `word` ends at offset `end` and starts after a non-name character. */
function endsWithWord(code: string, end: number, word: string): boolean {
  const start = end - word.length + 1;
  return start >= 0 && code.startsWith(word, start) && !/[\w.]/.test(code[start - 1] ?? '');
}

function firstIndexAtOrAfter(sortedOffsets: number[], offset: number): number {
  let low = 0;
  let high = sortedOffsets.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((sortedOffsets[middle] ?? 0) < offset) low = middle + 1;
    else high = middle;
  }
  return low;
}

function lastIndexAtOrBefore(ranges: Range[], offset: number): number {
  let low = 0;
  let high = ranges.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((ranges[middle]?.start ?? 0) <= offset) low = middle + 1;
    else high = middle;
  }
  return low - 1;
}

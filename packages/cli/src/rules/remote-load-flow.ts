import { maskDocumentationTextInCode } from './code-context.js';

// Data flow for DEPS-REMOTE-IMPORT: loader calls that get their code from the network through a
// name or a file. In JavaScript, a name holds a URL when an assignment, such as a `const`
// declaration, sets it to an http(s) URL literal or to a value that starts with such a name. A
// code file is downloaded when a curl or wget command that a call runs names it, when
// `urlretrieve` writes it, or when a file that calls a network API writes it. A loader that names
// a downloaded file loads remote code.
// ponytail: a use reads the nearest assignment of its name, not its scope, so a parameter that
// shadows a URL name also counts. Only literal paths count, and they match by file name without
// the extension. A download to a computed path, a command built in a variable, a URL in an object
// property or in `new URL(...)`, and a downloaded file that a separate command runs are missed.
// Move to an AST pass if real scans show these.

/** The view puts this character on each remote load, and a DEPS-REMOTE-IMPORT pattern matches it. */
export const REMOTE_LOAD_MARK = '\u0001';

// Every remote load through a name or a file needs one of these. Other files skip the flow.
const REMOTE_SOURCE_HINT =
  /https?:\/\/|curl|wget|urlretrieve|writeFile|appendFile|createWriteStream|\bopen\s*\(/;
const CODE_FILE_EXTENSION = /\.(?:[mc]?js|[mc]?ts|jsx|tsx|py)$/;
const PATH_SEPARATOR = /[\\/]/;
// A curl or wget command at the start of a string (group 1 is the opening quote) or after a
// shell separator, up to the end of its statement, call, or argument list.
const SHELL_DOWNLOAD =
  /(?:(?<!\w)([rRbBuUfF]{0,2}['"`])|&&|\|\|?|;|\$\()[ \t]*(?:sudo[ \t]+)?(?:curl|wget)\b[^\n;)\]]*/g;
const SHELL_TOKEN_SEPARATOR = /[\s'"`,;=>|&]+/;
// Calls that run a command: Node child_process and execa, and Python subprocess and os. The
// window that the pattern reads also holds the character before the name.
const COMMAND_CALL_NAME =
  /(?<![\w$])(?:exec|execSync|execFile|execFileSync|spawn|spawnSync|execa|execaSync|system|popen|run|call|Popen|check_call|check_output|getoutput|getstatusoutput)$/;
const LONGEST_COMMAND_CALL_NAME = 'getstatusoutput';
const STRING_LITERAL = /[rRbBuUfF]{0,2}(['"`])([^'"`\n]+)\1/y;

// `NAME =` in a declaration, a list of declarations, or an assignment, also with a type such as
// `: string`. The value starts after the match.
const JS_ASSIGNMENT = /(?<![\w$.])([A-Za-z_$][\w$]*)\s*(?::\s*[\w$]+\s*)?=(?![=>])\s*/g;
// Keywords that a declaration or an assignment can follow, as in `return u = '<url>'`. Another
// name before a name, as in `<Link u="...">`, makes a JSX attribute.
const KEYWORD_BEFORE_ASSIGNMENT_AT_END =
  /(?<![\w$])(?:const|let|var|return|else|throw|yield|await|case|do)$/;
const LONGEST_KEYWORD_BEFORE_ASSIGNMENT = 'return';
// An http(s) URL literal, or a name, also as the first interpolation of a template literal.
const JS_URL_VALUE = /(['"`])https?:\/\/|(?:`\$\{\s*)?([A-Za-z_$][\w$]*)/y;
const JS_LOADER_CALL = /(?<![\w$.])(?:import|require)\s*\(\s*/g;
const JS_FILE_WRITE =
  /(?<![\w$])(?:writeFileSync|writeFile|appendFileSync|appendFile|createWriteStream)\s*\(\s*/g;
const JS_NETWORK_CALL =
  /(?<![\w$])(?:fetch|got|axios(?:\.\w+)?)\s*\(|\bhttps?\.(?:get|request)\s*\(/g;

// `from NAME import`, or `import` and its list of modules (group 2).
const PY_IMPORT_STATEMENT =
  /(?<![\w.])(?:from[ \t]+([\w.]+)[ \t]+import\b|import[ \t]([\w., \t]+))/g;
const PY_MODULE_CALL = /\b(?:import_module|__import__)\s*\(\s*/g;
// The path is the first argument of run_path and the second of the other two.
const PY_PATH_CALL =
  /\brun_path\s*\(\s*|\b(?:spec_from_file_location|SourceFileLoader)\s*\([^,()\n]*,\s*/g;
const PY_URLRETRIEVE = /\burlretrieve\s*\([^,()\n]*,\s*(?:filename\s*=\s*)?/g;
const PY_FILE_OPEN = /(?<![\w.])open\s*\(\s*/g;
const PY_WRITE_MODE = /\s*,\s*[rRbBuU]{0,2}['"][^'"\n]{0,4}?[wax]/y;
const PY_NETWORK_CALL = /\b(?:urlopen|urlretrieve)\s*\(|\b(?:requests|httpx)\.\w+\s*\(/g;

/**
 * Puts REMOTE_LOAD_MARK on the first character of each loader call that loads code from the
 * network through a name or a downloaded file. `view` is the masked code view of `content`.
 */
export function markRemoteLoads(view: string, content: string, filePath: string): string {
  const unmarked = view.replaceAll(REMOTE_LOAD_MARK, ' ');
  if (!REMOTE_SOURCE_HINT.test(content)) return unmarked;

  // This view masks comments and keeps strings. A character that `view` keeps is code.
  const text = maskDocumentationTextInCode(content, filePath, keepEveryString);
  const isCode: IsCode = (index) => view[index] === content[index];
  const loads = filePath.endsWith('.py')
    ? pythonRemoteLoads(text, isCode)
    : javaScriptRemoteLoads(text, isCode);
  if (loads.length === 0) return unmarked;

  const chars = unmarked.split('');
  for (const index of loads) chars[index] = REMOTE_LOAD_MARK;
  return chars.join('');
}

function javaScriptRemoteLoads(text: string, isCode: IsCode): number[] {
  const assignments = javaScriptAssignments(text, isCode);
  const downloads = shellDownloads(text, isCode);
  if (codeMatches(text, JS_NETWORK_CALL, isCode).length > 0) {
    for (const write of codeMatches(text, JS_FILE_WRITE, isCode)) {
      addCodeFile(downloads, literalAt(text, matchEnd(write))?.value);
    }
  }

  return codeMatches(text, JS_LOADER_CALL, isCode)
    .filter((loader) => {
      const argument = matchEnd(loader);
      const holdsUrl = (name: string) => assignmentHoldsUrl(assignments, name, loader.index);
      return (
        startsWithUrlValue(text, argument, holdsUrl) ||
        downloads.has(fileStem(literalAt(text, argument)?.value))
      );
    })
    .map((loader) => loader.index);
}

// In source order, so a name that an earlier URL name sets holds a URL too.
function javaScriptAssignments(text: string, isCode: IsCode): Assignments {
  const assignments: Assignments = new Map();
  for (const assignment of codeMatches(text, JS_ASSIGNMENT, isCode)) {
    if (!setsName(text, assignment.index)) continue;

    const holdsUrl = startsWithUrlValue(text, matchEnd(assignment), (name) =>
      assignmentHoldsUrl(assignments, name, assignment.index)
    );
    const name = assignment[1] ?? '';
    const list = assignments.get(name) ?? [];
    list.push({ index: assignment.index, holdsUrl });
    assignments.set(name, list);
  }
  return assignments;
}

// True when the `NAME =` at `index` sets a name. A keyword, an operator, a bracket,
// or the start of the file can come before it. A name or a string before it makes a JSX
// attribute, and a dot makes a property.
// ponytail: a plain assignment on a new line after a name or a string, in code without
// semicolons, does not set a name either.
function setsName(text: string, index: number): boolean {
  const before = lastNonBlankBefore(text, index);
  const char = text[before] ?? '';
  if (/[\w$]/.test(char)) {
    const keywordStart = Math.max(0, before - LONGEST_KEYWORD_BEFORE_ASSIGNMENT.length);
    return KEYWORD_BEFORE_ASSIGNMENT_AT_END.test(text.slice(keywordStart, before + 1));
  }
  return !/['"`.]/.test(char);
}

// A use reads the last assignment of the name before it. With none before it, the use reads
// the first one after it, as a function does that runs after the module sets the name.
function assignmentHoldsUrl(assignments: Assignments, name: string, index: number): boolean {
  const list = assignments.get(name) ?? [];
  let low = 0;
  let high = list.length - 1;
  let read = 0;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if ((list[middle]?.index ?? 0) < index) {
      read = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return list[read]?.holdsUrl ?? false;
}

function startsWithUrlValue(
  text: string,
  index: number,
  holdsUrl: (name: string) => boolean
): boolean {
  JS_URL_VALUE.lastIndex = index;
  const value = JS_URL_VALUE.exec(text);
  return value !== null && (value[1] !== undefined || holdsUrl(value[2] ?? ''));
}

function pythonRemoteLoads(text: string, isCode: IsCode): number[] {
  const downloads = shellDownloads(text, isCode);
  for (const retrieve of codeMatches(text, PY_URLRETRIEVE, isCode)) {
    addCodeFile(downloads, literalAt(text, matchEnd(retrieve))?.value);
  }
  if (codeMatches(text, PY_NETWORK_CALL, isCode).length > 0) {
    for (const open of codeMatches(text, PY_FILE_OPEN, isCode)) {
      const path = literalAt(text, matchEnd(open));
      if (path !== undefined && opensForWrite(text, path.end)) addCodeFile(downloads, path.value);
    }
  }
  if (downloads.size === 0) return [];

  const statements = codeMatches(text, PY_IMPORT_STATEMENT, isCode).filter((statement) =>
    importedModules(statement).some((module) => downloads.has(moduleStem(module)))
  );
  const moduleCalls = codeMatches(text, PY_MODULE_CALL, isCode).filter((call) =>
    downloads.has(moduleStem(literalAt(text, matchEnd(call))?.value))
  );
  const pathCalls = codeMatches(text, PY_PATH_CALL, isCode).filter((call) =>
    downloads.has(fileStem(literalAt(text, matchEnd(call))?.value))
  );
  return [...statements, ...moduleCalls, ...pathCalls].map((load) => load.index);
}

// True when the mode after the path of `open(` writes, appends, or creates the file.
function opensForWrite(text: string, pathEnd: number): boolean {
  PY_WRITE_MODE.lastIndex = pathEnd;
  return PY_WRITE_MODE.test(text);
}

// `from a.b import c` imports `a.b`. `import a, b as c` imports `a` and `b`.
function importedModules(statement: RegExpExecArray): string[] {
  if (statement[1] !== undefined) return [statement[1]];
  return (statement[2] ?? '').split(',').map((part) => part.trim().split(/\s/)[0] ?? '');
}

// A curl or wget command that a call runs names the files that it writes, also as the last part
// of its URL, as in `wget <url>` or `curl -O <url>`. A message that only names the command, as in
// "run `wget <url>` first" or a printed command, does not run it.
function shellDownloads(text: string, isCode: IsCode): Set<string> {
  const commands = [...text.matchAll(SHELL_DOWNLOAD)].filter((command) =>
    command[1] === undefined ? !isCode(command.index) : opensString(text, command.index, isCode)
  );
  const runCommands = insideCommandCalls(
    text,
    commands.map((command) => command.index),
    isCode
  );

  const stems = new Set<string>();
  for (const command of commands) {
    if (!runCommands.has(command.index)) continue;
    for (const token of command[0].split(SHELL_TOKEN_SEPARATOR)) addCodeFile(stems, token);
  }
  return stems;
}

// True when the quote at `index` opens a string: code or the start of the file comes before it.
function opensString(text: string, index: number, isCode: IsCode): boolean {
  const before = lastNonBlankBefore(text, index);
  return before < 0 || isCode(before);
}

// Returns the indexes in `commands`, in source order, that an open call that runs a command,
// such as `execSync(` or `subprocess.run([`, encloses. One forward pass keeps the open brackets
// of the code, so no distance between the call and its command hides it.
// ponytail: the code view keeps regex literals, so a bracket in one, as in `/execSync(\()/`,
// counts. Skip regex spans here if the masker ever reports them.
function insideCommandCalls(text: string, commands: number[], isCode: IsCode): Set<number> {
  const enclosed = new Set<number>();
  // For each open bracket, whether it opens a call that runs a command.
  const openBrackets: boolean[] = [];
  let openCommandCalls = 0;
  let next = 0;

  for (let at = 0; at < text.length && next < commands.length; at += 1) {
    if (commands[next] === at) {
      if (openCommandCalls > 0) enclosed.add(at);
      next += 1;
    }

    const char = text[at] ?? '';
    if (!'()[]{}'.includes(char) || !isCode(at)) continue;
    if (char === '(' || char === '[' || char === '{') {
      const runsCommand = char === '(' && callRunsCommand(text, at);
      openBrackets.push(runsCommand);
      if (runsCommand) openCommandCalls += 1;
    } else if (openBrackets.pop() === true) {
      openCommandCalls -= 1;
    }
  }

  return enclosed;
}

// True when the name before the `(` at `index`, also with blanks between, runs a command.
function callRunsCommand(text: string, index: number): boolean {
  const nameEnd = lastNonBlankBefore(text, index) + 1;
  const nameStart = Math.max(0, nameEnd - LONGEST_COMMAND_CALL_NAME.length - 1);
  return COMMAND_CALL_NAME.test(text.slice(nameStart, nameEnd));
}

// Returns the index of the last character before `index` that is not blank, or -1.
function lastNonBlankBefore(text: string, index: number): number {
  let before = index - 1;
  while (before >= 0 && /\s/.test(text[before] ?? '')) before -= 1;
  return before;
}

function addCodeFile(stems: Set<string>, path: string | undefined): void {
  if (path !== undefined && CODE_FILE_EXTENSION.test(path)) stems.add(fileStem(path));
}

// `./lib/format.js` and `lib/format` both load `format`.
function fileStem(path: string | undefined): string {
  return (path?.split(PATH_SEPARATOR).at(-1) ?? '').replace(CODE_FILE_EXTENSION, '');
}

// The module `pkg.helper` is the file `helper.py`.
function moduleStem(name: string | undefined): string {
  return name?.split('.').at(-1) ?? '';
}

function literalAt(text: string, index: number): { value: string; end: number } | undefined {
  STRING_LITERAL.lastIndex = index;
  const literal = STRING_LITERAL.exec(text);
  return literal === null ? undefined : { value: literal[2] ?? '', end: STRING_LITERAL.lastIndex };
}

function codeMatches(text: string, pattern: RegExp, isCode: IsCode): RegExpExecArray[] {
  return [...text.matchAll(pattern)].filter((match) => isCode(match.index));
}

function matchEnd(match: RegExpExecArray): number {
  return match.index + match[0].length;
}

function keepEveryString(): boolean {
  return true;
}

type IsCode = (index: number) => boolean;
/** The assignments of each JavaScript name in source order, and whether each sets a URL. */
type Assignments = Map<string, Array<{ index: number; holdsUrl: boolean }>>;

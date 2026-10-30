import { pythonStringStart } from './code-context.js';

// Data flow for NET-EXFIL-ENV in Python: which reads of the whole environment reach a network
// call in the same file, and which strings reach a command that a shell runs. A value flows
// through an assignment, a loop target, a container update, a return value, and an argument of a
// function that the file defines. A name that a function binds is local to that function, and a
// nested function also reads the locals of the functions around it, as in Python; `self.<name>`
// is shared by all methods. A name that the file imports stands for its full name: after
// `import requests as r`, `r.post` is `requests.post`. The trace visits each name reference once,
// and the parsers skip nested brackets, so a deep or padded file stays linear.
// ponytail: the flow ignores statement order, functions that share a name share their call
// arguments, an import counts in the whole file, and the last import of a name wins. Move to an
// AST pass if real scans show any of these.

type Range = { start: number; end: number };
/** The full dotted name that each imported name stands for: `o` is `os`, `post` is `requests.post`. */
type ImportedNames = Map<string, string>;
/** A call of a dotted name: the name as written, and the full name that it stands for. */
type NamedCall = { start: number; openParen: number; text: string; name: string };
/** A client sends with its send methods. A proxy sends each method call to its server. */
type ClientKind = 'client' | 'proxy';
/** The value in [start, end) flows into each target name. */
type Flow = Range & { targets: string[] };
/** A dotted name at `start` that reads the whole value of each of `names`. */
type Reference = { start: number; names: string[] };
/** A flow target name split by its dots, so a dotted reference finds its targets in one walk. */
type TargetTrie = { name: string | undefined; children: Map<string, TargetTrie> };
type Parameter = {
  name: string;
  kind: 'positional' | 'variadic' | 'keywords';
  /** A parameter before `/` takes no keyword argument. */
  positionalOnly: boolean;
  defaultValue: Range | undefined;
};
/**
 * What the `def`s of one name take: the named parameters, which consume the keyword arguments of
 * those names, and the first position that `*args` takes. Only the other arguments reach
 * `*args` and `**kwargs`.
 */
type CallSignature = { namedParameters: Set<string>; variadicFrom: number };
type FlowGraph = {
  /** Flow targets are scoped names. */
  flows: Flow[];
  /** The call shape of each function name that the file defines with at least one parameter. */
  callSignatures: Map<string, CallSignature>;
  /**
   * The call slots that feed each parameter. A call does not know which `def` of a name it
   * reaches, so its arguments flow into slots (`f()#0`, `f()=name`), and each parameter of each
   * `def f` reads the slots that can fill it.
   */
  parameterSlots: Map<string, string[]>;
  /** Scoped names that hold a network client, and the kind of each client. */
  clients: Map<string, ClientKind>;
  /** The scope of each statement: `<name>@<offset>` of its `def`, or '' at module level. */
  statementScopes: string[];
  /** The names that each function binds: its parameters and its assignment, loop, and `as` targets. */
  locals: Map<string, Set<string>>;
  /** The scope of each function, by its index in file order. */
  functionScopes: string[];
  functionIndexes: Map<string, number>;
  /** The index of the function around each function, or -1 at module level. */
  enclosingFunctions: number[];
  /** For each name, the indexes of the functions that bind it. */
  bindingFunctions: Map<string, Set<number>>;
};
type Statement = Range & { indent: number };
type ParsedCode = {
  code: string;
  statements: Statement[];
  /** For each opening bracket offset, the offset of its closing bracket, else the code length. */
  closingBracket: Int32Array;
  forKeywords: number[];
};

/** The view marks the start of each read of the whole environment that reaches a network call. */
export const SENT_ENVIRON_READ_MARK = '\uFFFF';
// Split like the patterns in network-exfil.ts, so static-analysis hooks do not flag this file.
const ENVIRON = ['os.', 'environ'].join('');

// A key lookup, a single-key method, or an assignment touches one variable, not all of them.
const SINGLE_ITEM_ACCESS = /\s*(?:\[|\.\s*(?:get|pop|setdefault|update|clear)\b|=(?!=))/y;

const HTTP_VERB = '(?:get|post|put|patch|delete|head|options|request|stream)';
// The full names of calls that return a connected client. A client constructor is also a
// network call: its host goes to a DNS lookup and a connect.
const CLIENT_CONSTRUCTOR = [
  String.raw`requests\.Session|httpx\.(?:Async)?Client|aiohttp\.ClientSession`,
  String.raw`(?:http\.client\.)?HTTPS?Connection|socket\.(?:socket|create_connection)`,
  String.raw`smtplib\.(?:SMTP|SMTP_SSL|LMTP)|ftplib\.FTP(?:_TLS)?|asyncio\.open_connection`,
  String.raw`websocket\.(?:create_connection|WebSocket)`,
  String.raw`websockets\.(?:(?:sync|asyncio)\.)?(?:client\.)?connect`,
].join('|');
const RPC_PROXY_CONSTRUCTOR = String.raw`xmlrpc\.client\.ServerProxy`;
const IS_CLIENT_CONSTRUCTOR = new RegExp(`^(?:${CLIENT_CONSTRUCTOR})$`);
const IS_RPC_PROXY_CONSTRUCTOR = new RegExp(`^${RPC_PROXY_CONSTRUCTOR}$`);
// The full names of calls whose arguments leave the machine.
const IS_NETWORK_CALL = new RegExp(
  String.raw`^(?:(?:requests|httpx)\.${HTTP_VERB}|aiohttp\.request|${CLIENT_CONSTRUCTOR}|${RPC_PROXY_CONSTRUCTOR})$|(?:^|\.)urlopen$`
);
// `super().urlopen(...)` has no dotted name, because the receiver is a call result. The match
// starts at the bracket: a lookbehind would scan each run of blanked text again at each offset.
const CHAINED_URLOPEN_CALL = /[)\]]\s*\.\s*urlopen\s*\(/g;
// Client methods that send: HTTP verbs of the session clients, http.client requests, socket and
// stream sends and connects, mail sends, and FTP uploads.
const CLIENT_SEND_METHOD = new RegExp(
  `^(?:${HTTP_VERB}|ws_connect|putrequest|putheader|endheaders|send|sendall|sendto|sendmsg|connect|sendmail|send_message|write|writelines|storbinary|storlines|sendcmd)$`
);
// Keyword arguments of a send that set how it connects, not what it sends.
const TRANSPORT_OPTION_ARGUMENT =
  /\s*(?:timeout|verify|allow_redirects|follow_redirects|cert|context)\s*=(?!=)/y;
const CALLED_VALUE = /^\s*(?:await\s+)?([A-Za-z_][\w.]*)\s*\(/;
const AS_NAME = /\s*as\s+([A-Za-z_]\w*)/y;
// A plain name after `as`. An attribute or a subscript target, as in `as self.log`, binds no name.
const AS_TARGET = /\bas\s+([A-Za-z_]\w*)(?!\s*[\w.[])/g;

// The full names of calls that start a child process. Their `env=` argument is the child's
// environment and does not flow into the call result: `subprocess.run(cmd, env={**os.environ})`.
const IS_PROCESS_LAUNCH =
  /^(?:subprocess\.(?:run|Popen|call|check_call|check_output)|asyncio\.create_subprocess_(?:exec|shell)|Popen)$/;
const CHILD_ENVIRONMENT_KEYWORD = /\s*env\s*=(?!=)/y;
// The full names of calls that run their command in a shell. A process launch does too with
// `shell=True`, or with an argument list that starts a shell with a command: `["sh", "-c", cmd]`.
const IS_SHELL_RUN =
  /^(?:os\.(?:system|popen)|subprocess\.(?:getoutput|getstatusoutput)|asyncio\.create_subprocess_shell)$/;
const SHELL_TRUE_ARGUMENT = /\s*shell\s*=\s*True\b/y;
const SHELL_PROGRAM = /^(?:\/(?:usr\/)?bin\/)?(?:ba|da|k|z)?sh$/;
const SHELL_COMMAND_OPTION = /^-[a-z]*c$/;
const STRING_LITERAL_TEXT = /^[rRuU]?(["'])([^"'\\]*)\1$/;
const MAX_ARGV_ITEM_LENGTH = 64;
// A part of each shell call, so a file without one skips the shell trace.
const SHELL_RUN_HINT = /system|popen|shell|getoutput|getstatusoutput|["']-[a-z]*c["']/;

const IMPORT_STATEMENT = /^import\s/;
const FROM_IMPORT_STATEMENT = /^from\s+([A-Za-z_][\w.]*)\s+import\s/;
const IMPORTED_NAME = /^([A-Za-z_][\w.]*)(?:\s+as\s+([A-Za-z_]\w*))?$/;
const FUNCTION_DEF = /^(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/;
const RETURN_VALUE = /^(?:return|yield)\b/;
const FOR_LOOP = /^(?:async\s+)?for\b(.*?)\bin\b/;
const WITH_STATEMENT = /^(?:async\s+)?with\b/;
// Methods that put a value into a container or a mail message.
const CONTAINER_UPDATE =
  /^([A-Za-z_][\w.]*)\.(?:append|extend|insert|update|add|setdefault|set_content|set_payload|attach|add_attachment)\s*\(/;
const PARAMETER = /^\s*(?:(\*{1,2})\s*)?([A-Za-z_]\w*)/;
const KEYWORD_ARGUMENT = /\s*([A-Za-z_]\w*)\s*=(?!=)/y;
const UNPACKED_ARGUMENT = /\s*(\*{1,2})/y;
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
// Before Python 3.12, each nested f-string needs a new quote style, so four levels is the most.
// The limit keeps a crafted file from exhausting the stack.
const MAX_NESTED_STRING_DEPTH = 8;
// Method receivers, not values that a caller passes in.
const IMPLICIT_PARAMETERS = new Set(['self', 'cls']);
// CPython stops at 100 levels of indentation, so a real nested function is never deeper. The
// limit keeps a crafted chain of `def`s from making each name lookup walk the whole chain.
const MAX_ENCLOSING_FUNCTIONS = 100;

/**
 * The NET-EXFIL-ENV view of a file: the prepared view with a mark at the start of each read of
 * the whole environment that reaches a network call. Marks in the content are blanked first, so
 * only the flow adds them. In a Python file, the caller passes `shellView`: a read gets its mark
 * also where the view masks it, as in an f-string field, and each string that reaches a shell
 * command is shown as `shellView` prepares it, so the shell patterns see it. In a file of another
 * language, a read gets its mark only where the language view kept it: Python in a shell heredoc
 * counts, a read in a JavaScript comment does not.
 */
export function markEnvironFlow(
  view: string,
  content: string,
  shellView?: (command: string) => string
): string {
  const unmarked = view.replaceAll(SENT_ENVIRON_READ_MARK, ' ');
  const { sentReads, shellCommands } = findEnvironFlow(content, shellView !== undefined);
  if (sentReads.length === 0 && shellCommands.length === 0) return unmarked;

  const chars = unmarked.split('');
  for (const { start, end } of shellCommands) {
    const shellText = shellView?.(content.slice(start, end)) ?? '';
    for (let idx = start; idx < end; idx += 1) chars[idx] = shellText[idx - start] ?? ' ';
  }
  for (const { start, end } of sentReads) {
    if (shellView === undefined && view.slice(start, end) !== content.slice(start, end)) continue;
    chars[start] = SENT_ENVIRON_READ_MARK;
  }
  return chars.join('');
}

/**
 * The range of each whole-environment read whose value reaches a network call, and the text of
 * each string literal that reaches the command of a shell call (only with `traceShellCommands`).
 */
function findEnvironFlow(
  content: string,
  traceShellCommands: boolean
): { sentReads: Range[]; shellCommands: Range[] } {
  const mayRead = content.includes('environ');
  const mayRunShell = traceShellCommands && SHELL_RUN_HINT.test(content);
  if (!mayRead && !mayRunShell) return { sentReads: [], shellCommands: [] };

  const { code, strings } = pythonCodeView(content);
  const unblanked = parseCode(code);
  const imported = importedNames(unblanked);
  const parsed = blankChildEnvironmentArguments(unblanked, namedCalls(code, imported));
  const calls = namedCalls(parsed.code, imported);
  const reads = mayRead ? wholeEnvironReads(parsed, imported) : [];
  const commands = mayRunShell ? shellCommandArguments(parsed, content, calls) : [];
  if (reads.length === 0 && commands.length === 0) return { sentReads: [], shellCommands: [] };

  const graph = collectFlows(parsed, imported);
  const trace = flowTracer(parsed, graph);
  const sends = reads.length > 0 ? networkSendArguments(parsed, graph, calls) : [];
  return {
    sentReads: sends.length > 0 ? trace(reads, sends) : [],
    shellCommands: commands.length > 0 ? trace(strings, commands) : [],
  };
}

/**
 * Returns a function that walks back from each sink range through the flows and collects the
 * sources that it reaches. Each walk visits each source and each name reference once.
 */
function flowTracer(
  parsed: ParsedCode,
  graph: FlowGraph
): (sources: Range[], sinks: Range[]) => Range[] {
  const flowsByTarget = new Map<string, Flow[]>();
  for (const flow of [...graph.flows, ...callArgumentFlows(parsed, graph.callSignatures)]) {
    for (const target of flow.targets) {
      const targetFlows = flowsByTarget.get(target);
      if (targetFlows === undefined) flowsByTarget.set(target, [flow]);
      else targetFlows.push(flow);
    }
  }
  const references = flowReferences(parsed, graph, flowsByTarget);

  return (sources, sinks) => {
    const takeSources = visitOnce(sources);
    const takeReferences = visitOnce(references);
    const reached: Range[] = [];
    const visitedNames = new Set<string>();
    const pending: Range[] = [...sinks];

    for (let range = pending.pop(); range !== undefined; range = pending.pop()) {
      for (const source of takeSources(range)) reached.push(source);

      for (const reference of takeReferences(range)) {
        for (const name of reference.names) {
          for (const target of [name, ...(graph.parameterSlots.get(name) ?? [])]) {
            if (visitedNames.has(target)) continue;
            visitedNames.add(target);
            for (const flow of flowsByTarget.get(target) ?? []) pending.push(flow);
          }
        }
      }
    }

    return reached.sort((left, right) => left.start - right.start);
  };
}

/**
 * Collects the flows of each statement, the functions and their parameters, and the client
 * names. A statement belongs to the innermost `def` that it is indented under.
 */
function collectFlows(parsed: ParsedCode, imported: ImportedNames): FlowGraph {
  const graph: FlowGraph = {
    flows: [],
    callSignatures: new Map(),
    parameterSlots: new Map(),
    clients: new Map(),
    statementScopes: [],
    locals: new Map(),
    functionScopes: [],
    functionIndexes: new Map(),
    enclosingFunctions: [],
    bindingFunctions: new Map(),
  };
  const unscopedFlows: Array<Flow & { scope: string }> = [];
  const unscopedClients: Array<{ scope: string; name: string; kind: ClientKind }> = [];
  const openFunctions: Array<{ indent: number; id: string; name: string }> = [];

  for (const statement of parsed.statements) {
    while ((openFunctions.at(-1)?.indent ?? -1) >= statement.indent) openFunctions.pop();
    const currentFunction = openFunctions.at(-1);
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
      const name = functionDef[1];
      const id = `${name}@${statement.start}`;
      const openParen = statement.start + functionDef[0].length - 1;
      const parameters = parameterList(parsed, openParen);
      addFunction(graph, name, id, parameters);
      graph.functionIndexes.set(id, graph.functionScopes.push(id) - 1);
      graph.enclosingFunctions.push(graph.functionIndexes.get(scope) ?? -1);
      // A default value is computed in the enclosing scope and flows into its parameter.
      for (const { name: parameter, defaultValue } of parameters) {
        if (defaultValue !== undefined)
          graph.flows.push({ targets: [`${id}:${parameter}`], ...defaultValue });
      }
      openFunctions.push({ indent: statement.indent, id, name });
      continue;
    }

    // `as` only binds a name: in `with ... as f`, `except ... as e`, and `import ... as m`. A
    // closure must not read the parent's name past it.
    bindLocals(
      graph,
      scope,
      [...text.matchAll(AS_TARGET)].map((match) => match[1] ?? '')
    );

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
      bindLocals(graph, scope, boundNames(loop[1]));
      addFlow(targets, loop[0].length);
      continue;
    }

    if (WITH_STATEMENT.test(text)) {
      for (const client of withClients(parsed, statement, imported)) {
        unscopedClients.push({ scope, ...client });
      }
      continue;
    }

    const assignment = assignmentOperator(text);
    if (assignment >= 0) {
      const leftSide = text.slice(0, assignment);
      const targets = assignmentTargets(leftSide);
      bindLocals(graph, scope, boundNames(leftSide));
      addFlow(targets, assignment + 1);
      const calledName = CALLED_VALUE.exec(text.slice(assignment + 1))?.[1];
      const kind = calledName === undefined ? undefined : clientKind(calledName, imported);
      if (kind !== undefined) {
        for (const name of targets) unscopedClients.push({ scope, name, kind });
      }
      continue;
    }

    const update = CONTAINER_UPDATE.exec(text);
    if (update?.[1] !== undefined) addFlow([update[1]], 0);
  }

  // Scope the names once every local is known: Python binds a name for the whole function.
  for (const [scope, names] of graph.locals) {
    const index = graph.functionIndexes.get(scope) ?? -1;
    for (const name of names) {
      const binders = graph.bindingFunctions.get(name);
      if (binders === undefined) graph.bindingFunctions.set(name, new Set([index]));
      else binders.add(index);
    }
  }
  for (const { scope, targets, ...range } of unscopedFlows) {
    graph.flows.push({
      targets: targets.map((target) => scopedName(graph, scope, target)),
      ...range,
    });
  }
  for (const { scope, name, kind } of unscopedClients) {
    graph.clients.set(scopedName(graph, scope, name), kind);
  }
  return graph;
}

/** The kind of client that a call of `calledName` returns, if it returns one. */
function clientKind(calledName: string, imported: ImportedNames): ClientKind | undefined {
  const name = fullName(calledName, imported);
  if (IS_CLIENT_CONSTRUCTOR.test(name)) return 'client';
  if (IS_RPC_PROXY_CONSTRUCTOR.test(name)) return 'proxy';
  return undefined;
}

/** Records a `def`: its parameters are its first locals, and each reads its call slots. */
function addFunction(graph: FlowGraph, name: string, id: string, parameters: Parameter[]): void {
  graph.locals.set(id, new Set(parameters.map((parameter) => parameter.name)));
  if (parameters.length === 0) return;

  const signature = graph.callSignatures.get(name) ?? {
    namedParameters: new Set(),
    variadicFrom: Number.POSITIVE_INFINITY,
  };
  graph.callSignatures.set(name, signature);

  let position = 0;
  for (const parameter of parameters) {
    const slots = [`${name}()?`];
    if (parameter.kind === 'variadic') {
      slots.push(`${name}()#*`);
      signature.variadicFrom = Math.min(signature.variadicFrom, position);
    }
    if (parameter.kind === 'keywords') slots.push(`${name}()=*`);
    if (parameter.kind === 'positional') {
      slots.push(`${name}()#${position}`);
      if (!parameter.positionalOnly) {
        slots.push(`${name}()=${parameter.name}`);
        signature.namedParameters.add(parameter.name);
      }
      position += 1;
    }
    graph.parameterSlots.set(`${id}:${parameter.name}`, slots);
  }
}

/**
 * The arguments of each call to a function that the file defines flow into call slots: a keyword
 * argument into `f()=<name>`, a positional argument into `f()#<position>`, and an unpacked
 * argument (`*args`, `**kwargs`) into `f()?`, which every parameter reads. So does a positional
 * argument after `*args`, whose position is unknown. An argument that no named parameter takes
 * also flows into `f()#*` or `f()=*`, for `*args` or `**kwargs`. Each argument has a fixed number
 * of slots, however many functions share the name.
 */
function callArgumentFlows(parsed: ParsedCode, callSignatures: Map<string, CallSignature>): Flow[] {
  if (callSignatures.size === 0) return [];

  // A `def` header declares parameters. It is not a call.
  const call = new RegExp(
    String.raw`(?<!\bdef\s+)(?<!\w)(${[...callSignatures.keys()].join('|')})\s*\(`,
    'g'
  );
  return [...parsed.code.matchAll(call)].flatMap((match) => {
    const name = match[1] ?? '';
    const signature = callSignatures.get(name);
    let position = 0;
    let positionKnown = true;

    return topLevelArguments(parsed, match.index + match[0].length - 1).map((argument): Flow => {
      KEYWORD_ARGUMENT.lastIndex = argument.start;
      const keyword = KEYWORD_ARGUMENT.exec(parsed.code)?.[1];
      if (keyword !== undefined && KEYWORD_ARGUMENT.lastIndex <= argument.end) {
        const targets = [`${name}()=${keyword}`];
        if (!signature?.namedParameters.has(keyword)) targets.push(`${name}()=*`);
        return { targets, start: KEYWORD_ARGUMENT.lastIndex, end: argument.end };
      }

      UNPACKED_ARGUMENT.lastIndex = argument.start;
      const stars = UNPACKED_ARGUMENT.exec(parsed.code)?.[1];
      // After `*items`, the position of the next positional arguments is unknown.
      if (stars === '*') positionKnown = false;
      if (stars !== undefined || !positionKnown) return { targets: [`${name}()?`], ...argument };

      const targets = [`${name}()#${position}`];
      if (position >= (signature?.variadicFrom ?? Number.POSITIVE_INFINITY)) {
        targets.push(`${name}()#*`);
      }
      position += 1;
      return { targets, ...argument };
    });
  });
}

/**
 * A name belongs to the innermost function around the scope that binds it, as a closure reads
 * the locals of its parents. A name that no such function binds is a module name.
 */
function scopedName(graph: FlowGraph, scope: string, name: string): string {
  const binders = graph.bindingFunctions.get(headOf(name));
  if (binders === undefined) return name;

  let current = graph.functionIndexes.get(scope) ?? -1;
  for (let depth = 0; current >= 0 && depth < MAX_ENCLOSING_FUNCTIONS; depth += 1) {
    if (binders.has(current)) return `${graph.functionScopes[current]}:${name}`;
    current = graph.enclosingFunctions[current] ?? -1;
  }
  return name;
}

function bindLocals(graph: FlowGraph, scope: string, names: string[]): void {
  const locals = graph.locals.get(scope);
  if (locals === undefined) return;
  for (const name of names) locals.add(name);
}

/**
 * The data arguments of each network call and of each send method on a network client. A client
 * name counts only in the scope that binds it to a client. Each method call on a proxy sends.
 */
function networkSendArguments(parsed: ParsedCode, graph: FlowGraph, calls: NamedCall[]): Range[] {
  const unscopedClients = new Set(
    [...graph.clients.keys()].map((client) => client.slice(client.indexOf(':') + 1))
  );
  const sendCalls = calls.filter((call) => {
    if (IS_NETWORK_CALL.test(call.name)) return true;

    const methodDot = call.text.lastIndexOf('.');
    const receiver = call.text.slice(0, methodDot);
    if (methodDot < 0 || !unscopedClients.has(receiver)) return false;

    const scope = graph.statementScopes[lastIndexAtOrBefore(parsed.statements, call.start)] ?? '';
    const kind = graph.clients.get(scopedName(graph, scope, receiver));
    return (
      kind === 'proxy' ||
      (kind === 'client' && CLIENT_SEND_METHOD.test(call.text.slice(methodDot + 1)))
    );
  });

  return sendCalls.flatMap((call) =>
    topLevelArguments(parsed, call.openParen).filter((argument) => {
      TRANSPORT_OPTION_ARGUMENT.lastIndex = argument.start;
      return !TRANSPORT_OPTION_ARGUMENT.test(parsed.code);
    })
  );
}

/** The command argument of each call that runs its command in a shell. */
function shellCommandArguments(parsed: ParsedCode, content: string, calls: NamedCall[]): Range[] {
  return calls.flatMap((call) => {
    const runsShell = IS_SHELL_RUN.test(call.name);
    if (!runsShell && !IS_PROCESS_LAUNCH.test(call.name)) return [];

    const callArguments = topLevelArguments(parsed, call.openParen);
    const commands = callArguments.flatMap((argument, index) => {
      const command = commandValue(parsed, argument, index);
      return command === undefined ? [] : [command];
    });
    const shellTrue = callArguments.some((argument) => {
      SHELL_TRUE_ARGUMENT.lastIndex = argument.start;
      return SHELL_TRUE_ARGUMENT.test(parsed.code);
    });
    if (runsShell || shellTrue) return commands;

    return commands.flatMap((command) => {
      const shellCommand = shellArgvCommand(parsed, content, command);
      return shellCommand === undefined ? [] : [shellCommand];
    });
  });
}

/** The command of a process call: the first positional argument, or the value of `args=`. */
function commandValue(parsed: ParsedCode, argument: Range, index: number): Range | undefined {
  KEYWORD_ARGUMENT.lastIndex = argument.start;
  const keyword = KEYWORD_ARGUMENT.exec(parsed.code)?.[1];
  if (keyword === undefined || KEYWORD_ARGUMENT.lastIndex > argument.end) {
    return index === 0 ? argument : undefined;
  }
  return keyword === 'args' ? { start: KEYWORD_ARGUMENT.lastIndex, end: argument.end } : undefined;
}

/**
 * The command string of a list or tuple that starts a shell with `-c`: `cmd` in
 * `["sh", "-c", cmd, name, arg]`. The items after it are the shell's parameters, which are data.
 */
function shellArgvCommand(parsed: ParsedCode, content: string, value: Range): Range | undefined {
  const openBracket = nextCodeChar(parsed.code, value.start);
  if (openBracket >= value.end) return undefined;
  if (parsed.code[openBracket] !== '[' && parsed.code[openBracket] !== '(') return undefined;

  // A program name or an option is a short string. A longer item, such as a nested call, is not
  // copied, so nested lists stay linear.
  const items = topLevelArguments(parsed, openBracket);
  const texts = items.map((item) =>
    item.end - item.start > MAX_ARGV_ITEM_LENGTH
      ? ''
      : (STRING_LITERAL_TEXT.exec(content.slice(item.start, item.end).trim())?.[2] ?? '')
  );
  if (!SHELL_PROGRAM.test(texts[0] ?? '')) return undefined;

  const option = texts.findIndex((text, index) => index > 0 && SHELL_COMMAND_OPTION.test(text));
  return option < 0 ? undefined : items[option + 1];
}

/** The names that `with <client constructor>(...) as name` binds, each with its client kind. */
function withClients(
  parsed: ParsedCode,
  statement: Range,
  imported: ImportedNames
): Array<{ name: string; kind: ClientKind }> {
  const text = parsed.code.slice(statement.start, statement.end);
  const clients: Array<{ name: string; kind: ClientKind }> = [];

  for (const call of namedCalls(text, imported)) {
    const kind = clientKind(call.text, imported);
    if (kind === undefined) continue;

    const openParen = statement.start + call.openParen;
    AS_NAME.lastIndex = (parsed.closingBracket[openParen] ?? parsed.code.length) + 1;
    const alias = AS_NAME.exec(parsed.code);
    if (alias?.[1] !== undefined) clients.push({ name: alias[1], kind });
  }

  return clients;
}

/**
 * Each whole-environment read in the code, in offset order: the part of a dotted name that stands
 * for `os.environ`, as in `os.environ`, `o.environ` after `import os as o`, and `e` after
 * `from os import environ as e`.
 */
function wholeEnvironReads(parsed: ParsedCode, imported: ImportedNames): Range[] {
  const reads: Range[] = [];

  for (const match of parsed.code.matchAll(DOTTED_NAME)) {
    const head = headOf(match[0]);
    const headName = imported.get(head) ?? head;
    const end = match.index + head.length + ENVIRON.length - headName.length;
    if (end < match.index + head.length || end > match.index + match[0].length) continue;

    // The head, or the head and the parts after it up to a dot, stand for `os.environ`.
    const name = headName + parsed.code.slice(match.index + head.length, end);
    if (name !== ENVIRON || /\w/.test(parsed.code[end] ?? '')) continue;
    if (readsWholeValue(parsed, match.index, end)) reads.push({ start: match.index, end });
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
  // A parameter gets its value through its call slots, so it is a target without its own flows.
  const { roots, unscopedHeads } = buildTargetTrie([
    ...flowsByTarget.keys(),
    ...graph.parameterSlots.keys(),
  ]);

  for (const match of parsed.code.matchAll(DOTTED_NAME)) {
    // `payload.items()` reads `payload`, so each prefix of the dotted name can be the target.
    const parts = match[0].split('.');
    const head = parts[0] ?? '';
    if (!unscopedHeads.has(head)) continue;

    const statementIndex = lastIndexAtOrBefore(parsed.statements, match.index);
    const scope = graph.statementScopes[statementIndex] ?? '';
    const names: string[] = [];
    let node = roots.get(scopedName(graph, scope, head));
    let prefixEnd = match.index + head.length;

    for (let part = 1; node !== undefined; part += 1) {
      if (node.name !== undefined && readsWholeValue(parsed, match.index, prefixEnd)) {
        names.push(node.name);
      }
      const nextPart = parts[part];
      if (nextPart === undefined) break;
      node = node.children.get(nextPart);
      prefixEnd += nextPart.length + 1;
    }

    if (names.length > 0) references.push({ start: match.index, names });
  }

  return references;
}

/**
 * Splits each scoped target name (`<scope>:a.b`) by its dots. The roots are keyed by the scoped
 * first part (`<scope>:a`). `unscopedHeads` holds the first parts without a scope, a quick filter
 * for the names in the code.
 */
function buildTargetTrie(targets: Iterable<string>): {
  roots: Map<string, TargetTrie>;
  unscopedHeads: Set<string>;
} {
  const roots = new Map<string, TargetTrie>();
  const unscopedHeads = new Set<string>();

  for (const target of targets) {
    const scopeEnd = target.indexOf(':') + 1;
    const [head = '', ...rest] = target.slice(scopeEnd).split('.');
    unscopedHeads.add(head);

    const rootKey = target.slice(0, scopeEnd) + head;
    let node = roots.get(rootKey) ?? { name: undefined, children: new Map() };
    roots.set(rootKey, node);
    for (const part of rest) {
      const child = node.children.get(part) ?? { name: undefined, children: new Map() };
      node.children.set(part, child);
      node = child;
    }
    node.name = target;
  }

  return { roots, unscopedHeads };
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

/**
 * Blanks the `env=` argument of each call that starts a child process, except the network calls
 * inside it: `env={"REPLY": requests.post(url, json=dict(os.environ)).text}` still sends.
 */
function blankChildEnvironmentArguments(parsed: ParsedCode, calls: NamedCall[]): ParsedCode {
  const launches = calls.filter((call) => IS_PROCESS_LAUNCH.test(call.name));
  if (launches.length === 0) return parsed;

  const networkCalls = calls
    .filter((call) => IS_NETWORK_CALL.test(call.name))
    .map((call) => ({
      start: call.start,
      end: (parsed.closingBracket[call.openParen] ?? parsed.code.length) + 1,
    }));
  const networkCallStarts = networkCalls.map((call) => call.start);
  const chars = parsed.code.split('');

  for (const launch of launches) {
    // A launch inside an `env=` value that is already blank is gone with that value.
    if (chars[launch.start] !== parsed.code[launch.start]) continue;

    for (const argument of topLevelArguments(parsed, launch.openParen)) {
      CHILD_ENVIRONMENT_KEYWORD.lastIndex = argument.start;
      if (!CHILD_ENVIRONMENT_KEYWORD.test(parsed.code)) continue;

      // Blank around the outermost network calls in the value. Each call is skipped whole.
      let blankFrom = CHILD_ENVIRONMENT_KEYWORD.lastIndex;
      let callIndex = firstIndexAtOrAfter(networkCallStarts, blankFrom);
      for (let call = networkCalls[callIndex]; call !== undefined && call.start < argument.end; ) {
        blankRange(chars, blankFrom, call.start);
        blankFrom = call.end;
        callIndex = firstIndexAtOrAfter(networkCallStarts, blankFrom);
        call = networkCalls[callIndex];
      }
      blankRange(chars, blankFrom, argument.end);
    }
  }
  return { ...parsed, code: chars.join('') };
}

function parseCode(code: string): ParsedCode {
  const statements: Statement[] = [];
  const closingBracket = new Int32Array(code.length).fill(code.length);
  const openBrackets: number[] = [];
  let statementStart = 0;
  let startsLine = true;

  for (let idx = 0; idx < code.length; idx += 1) {
    const char = code[idx];
    if (char === '(' || char === '[' || char === '{') {
      openBrackets.push(idx);
    } else if (char === ')' || char === ']' || char === '}') {
      const openBracket = openBrackets.pop();
      if (openBracket !== undefined) closingBracket[openBracket] = idx;
    } else if (openBrackets.length === 0 && isStatementEnd(code, idx)) {
      pushStatement(statements, code, { start: statementStart, end: idx }, startsLine);
      statementStart = idx + 1;
      startsLine = char === '\n';
    }
  }
  pushStatement(statements, code, { start: statementStart, end: code.length }, startsLine);

  const forKeywords = [...code.matchAll(FOR_KEYWORD)].map((match) => match.index);
  return { code, statements, closingBracket, forKeywords };
}

/**
 * The full dotted name of each name that an import statement binds: `import os as o` binds `o`
 * to `os`, and `from requests import post as p` binds `p` to `requests.post`.
 */
function importedNames(parsed: ParsedCode): ImportedNames {
  const imported: ImportedNames = new Map();

  for (const statement of parsed.statements) {
    const text = parsed.code.slice(statement.start, statement.end);
    const fromModule = FROM_IMPORT_STATEMENT.exec(text);
    if (fromModule === null && !IMPORT_STATEMENT.test(text)) continue;

    const nameList = text.slice(fromModule?.[0].length ?? 'import'.length).trim();
    for (const item of nameList.replace(/^\(|\)$/g, '').split(',')) {
      const [, name, alias] = IMPORTED_NAME.exec(item.trim()) ?? [];
      if (name === undefined) continue;
      if (fromModule?.[1] !== undefined) imported.set(alias ?? name, `${fromModule[1]}.${name}`);
      else if (alias !== undefined) imported.set(alias, name);
      // `import urllib.request` binds `urllib` to itself, and a later import of the name wins.
      else imported.set(headOf(name), headOf(name));
    }
  }

  return imported;
}

/** The full dotted name that `name` stands for, through the names that the file imports. */
function fullName(name: string, imported: ImportedNames): string {
  const head = headOf(name);
  const headName = imported.get(head);
  return headName === undefined ? name : headName + name.slice(head.length);
}

/** Each call of a dotted name in the code, in offset order. `def` and `class` headers are not calls. */
function namedCalls(code: string, imported: ImportedNames): NamedCall[] {
  const calls: NamedCall[] = [];

  for (const match of code.matchAll(DOTTED_NAME)) {
    const openParen = nextCodeChar(code, match.index + match[0].length);
    if (code[openParen] !== '(') continue;
    const previous = lastCodeCharBefore(code, match.index);
    if (endsWithWord(code, previous, 'def') || endsWithWord(code, previous, 'class')) continue;
    calls.push({
      start: match.index,
      openParen,
      text: match[0],
      name: fullName(match[0], imported),
    });
  }

  for (const match of code.matchAll(CHAINED_URLOPEN_CALL)) {
    const openParen = match.index + match[0].length - 1;
    const start = match.index + match[0].lastIndexOf('urlopen');
    calls.push({ start, openParen, text: 'urlopen', name: 'urlopen' });
  }

  return calls.sort((left, right) => left.start - right.start);
}

/** A `;` or a line break that no `\` continues ends a statement outside brackets. */
function isStatementEnd(code: string, idx: number): boolean {
  return code[idx] === ';' || (code[idx] === '\n' && code[idx - 1] !== '\\');
}

/**
 * Adds the statement without its leading whitespace. Its indent is its column. After a `;` on
 * the same line, it is one deeper than the statement before it: it shares that statement's block,
 * or it is the inline body of `def f(x): pass; send(x)`.
 */
function pushStatement(
  statements: Statement[],
  code: string,
  { start, end }: Range,
  startsLine: boolean
): void {
  let lineStart = startsLine ? start : -1;
  let textStart = start;
  for (; textStart < end && /\s/.test(code[textStart] ?? ''); textStart += 1) {
    if (code[textStart] === '\n') lineStart = textStart + 1;
  }
  if (textStart >= end) return;

  const indent = lineStart >= 0 ? textStart - lineStart : (statements.at(-1)?.indent ?? 0) + 1;
  statements.push({ start: textStart, end, indent });
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
 * stay: `f"...{payload}"` sends `payload`. `strings` holds the text between the quotes of each
 * string literal, in offset order.
 */
function pythonCodeView(content: string): { code: string; strings: Range[] } {
  const chars = content.split('');
  const strings: Range[] = [];
  let idx = 0;

  while (idx < content.length) {
    const char = content[idx];
    if (char === '#') {
      const lineEnd = content.indexOf('\n', idx);
      idx = blankRange(chars, idx, lineEnd >= 0 ? lineEnd : content.length);
    } else if (char === '"' || char === "'") {
      const delimiter = content.startsWith(char.repeat(3), idx) ? char.repeat(3) : char;
      const start = idx + delimiter.length;
      idx = blankStringText(content, chars, idx);
      const closed =
        idx - delimiter.length >= start && content.startsWith(delimiter, idx - delimiter.length);
      strings.push({ start, end: closed ? idx - delimiter.length : idx });
    } else {
      idx += 1;
    }
  }

  return { code: chars.join(''), strings };
}

/**
 * Blanks one string literal from its prefix to its closing quote and returns the end offset. A
 * string inside a field is parsed the same way, so a nested f-string keeps its fields, up to a
 * depth that real code does not reach.
 */
function blankStringText(
  content: string,
  chars: string[],
  quoteIndex: number,
  nesting = 0
): number {
  const quote = content[quoteIndex] ?? '"';
  const delimiter = content.startsWith(quote.repeat(3), quoteIndex) ? quote.repeat(3) : quote;
  const prefixStart = pythonStringStart(content, quoteIndex);
  const isFString = /f/i.test(content.slice(prefixStart, quoteIndex));
  let idx = blankRange(chars, prefixStart, quoteIndex + delimiter.length);
  let fieldDepth = 0;

  while (idx < content.length) {
    const char = content[idx];
    if (fieldDepth > 0 && (char === '"' || char === "'")) {
      // A string inside a field is text too, and its braces do not open or close the field.
      idx =
        nesting < MAX_NESTED_STRING_DEPTH
          ? blankStringText(content, chars, idx, nesting + 1)
          : blankRange(chars, idx, nestedStringEnd(content, idx));
    } else if (fieldDepth > 0) {
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

/** The end offset of a one-line string literal, for strings nested past the depth limit. */
function nestedStringEnd(content: string, quoteIndex: number): number {
  const quote = content[quoteIndex];
  for (let idx = quoteIndex + 1; idx < content.length; idx += 1) {
    const char = content[idx];
    if (char === '\\') idx += 1;
    else if (char === quote) return idx + 1;
    else if (char === '\n' || char === '\r') return idx;
  }
  return content.length;
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

/** The parameters of a `def`, without `self` and `cls`, each with its default value. */
function parameterList(parsed: ParsedCode, openParen: number): Parameter[] {
  const texts = topLevelArguments(parsed, openParen).map((argument) => ({
    argument,
    text: parsed.code.slice(argument.start, argument.end),
  }));
  const positionalOnlyEnd = texts.findIndex(({ text }) => text.trim() === '/');

  return texts.flatMap(({ argument, text }, index): Parameter[] => {
    const [, stars, name] = PARAMETER.exec(text) ?? [];
    if (name === undefined || IMPLICIT_PARAMETERS.has(name)) return [];

    const kind = stars === '*' ? 'variadic' : stars === '**' ? 'keywords' : 'positional';
    const positionalOnly = index < positionalOnlyEnd;
    const equals = assignmentOperator(text);
    const defaultValue =
      equals >= 0 ? { start: argument.start + equals + 1, end: argument.end } : undefined;
    return [{ name, kind, positionalOnly, defaultValue }];
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

/** The offset of the first non-whitespace character at or after `idx`. */
function nextCodeChar(code: string, idx: number): number {
  let next = idx;
  while (next < code.length && /\s/.test(code[next] ?? '')) next += 1;
  return next;
}

/** The part of a dotted name before its first dot. */
function headOf(name: string): string {
  const dot = name.indexOf('.');
  return dot < 0 ? name : name.slice(0, dot);
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

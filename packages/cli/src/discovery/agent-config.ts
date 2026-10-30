import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { basename, isAbsolute, join, posix, relative, resolve, sep } from 'node:path';
import { isRegularFile } from '../fs-walk.js';
import { agentConfigCommandValues, jsonStringEnd } from '../rules/agent-config.js';
import {
  hookScriptScanNames,
  isShellInterpreter,
  keepsInterpreter,
  optionValueInterpreters,
} from '../rules/script-scan-name.js';
import type { Skill } from '../types.js';
import { computeTreeSha256 } from './tree-hash.js';

// Each MCP server is scanned as a one-server .mcp.json document. Findings stay on that
// server, and rules never read or quote the rest of a shared file such as ~/.claude.json.
const MCP_SERVER_SCAN_FILENAME = '.mcp.json';

// A hook command names a script as one shell word, such as "${CLAUDE_PLUGIN_ROOT}"/run.sh or
// "$CLAUDE_PROJECT_DIR/set up.sh". Quoted parts keep their spaces; the quotes are removed after
// the split. A control operator or a line break is a token of its own: it ends one command.
const SHELL_TOKEN = /(?:"[^"]*"|'[^']*'|[^\s;|&()<>`"'])+|[;|&()`\n]/g;
const COMMAND_SEPARATORS = new Set([';', '|', '&', '(', ')', '`', '\n']);
const SHELL_QUOTES = /["']/g;

const MCP_SERVERS_KEY = 'mcpServers';

// The punctuation that opens, closes, or names a JSON value. With string literals, no other
// character in valid JSON changes the nesting, so a structure scan can skip the rest.
const JSON_STRUCTURE_CHARS = new Set(['{', '}', '[', ']', ':']);
const NOT_LINE_BREAK = /[^\r\n]/g;

// `bash -c <command>` and `sh -ec <command>` run the next word as a command of its own.
const SHELL_COMMAND_OPTION = /^-[A-Za-z]*c/;
// As a command, `. <file>` and `source <file>` make the hook's shell read the file.
const SOURCE_COMMANDS = new Set(['.', 'source']);
const SOURCING_SHELL = 'sh';

type AgentConfigFiles = {
  agentId: string;
  dir: string;
  // Skill name prefix, e.g. `~/.claude` for a home file or `.claude` for a project file.
  // Distinct names keep `skill-audit explain <name>` unambiguous.
  displayDir: string;
  fileNames: string[];
  scope: Skill['scope'];
  metadata?: Skill['metadata'];
  // Scripts below this root that the hooks in these files run are scan targets too.
  scriptRoot?: HookScriptRoot;
};

/** A directory that holds the scripts hook commands run, and how the commands name it. */
export type HookScriptRoot = {
  dir: string;
  // Skill name prefix for the scripts, like `displayDir` for the config files.
  displayDir: string;
  // Placeholder that the agent expands to `dir`, such as CLAUDE_PLUGIN_ROOT.
  placeholder: string;
  // Hooks run in `dir`, so bare relative paths resolve there too.
  isWorkingDir: boolean;
};

// The interpreter is the word that runs `word`, or undefined when `word` starts a command. A
// data option value, such as `.env` in `node --env-file .env`, pairs with its option word,
// which runs no file.
type CommandWord = { word: string; interpreter: string | undefined };

/** Emits each agent hook or settings file that exists, and the scripts its hooks run. */
export async function discoverAgentConfigFiles(files: AgentConfigFiles): Promise<Skill[]> {
  const skills: Skill[] = [];
  const configPaths: string[] = [];

  for (const fileName of files.fileNames) {
    const path = join(files.dir, fileName);
    if (!(await isRegularFile(path))) continue;

    configPaths.push(path);
    const name = posix.join(files.displayDir, fileName);
    skills.push(await agentConfigSkill(files, path, name, files.metadata));
  }

  if (files.scriptRoot !== undefined) {
    skills.push(...(await discoverHookScripts(files, configPaths, files.scriptRoot)));
  }

  return skills;
}

/** Limits rule matching for an MCP server entry to that server's own definition. */
export function mcpServerScanMetadata(
  name: string,
  definition: unknown
): NonNullable<Skill['metadata']> {
  return {
    ruleScanFilename: MCP_SERVER_SCAN_FILENAME,
    ruleScanContent: JSON.stringify({ mcpServers: { [name]: definition } }, null, 2),
  };
}

/** Rule scan metadata for a settings file whose MCP servers are reported on their own entries. */
export type McpServerSplitScanMetadata = {
  // One entry per server name.
  servers: Map<string, NonNullable<Skill['metadata']>>;
  // The rest of the settings file.
  settings: NonNullable<Skill['metadata']>;
};

/**
 * Splits the rule scan of a settings file into one text per MCP server and one text for the
 * rest of the file, so a risky server is reported once, on its own entry. Returns undefined,
 * and the caller scans the whole file, when JSON.parse cannot read the file or drops a server
 * definition (a second `mcpServers` key or a duplicate server name), because that definition
 * has no entry of its own.
 *
 * ponytail: hook findings and server findings of one file land on different entries, so they no
 * longer combine into a compound such as FS-CREDSTORE + NET-*. Claude Code keeps its hooks and
 * servers in different files and has the same limit.
 */
export function splitMcpServerScanMetadata(
  content: string
): McpServerSplitScanMetadata | undefined {
  let settings: unknown;
  try {
    settings = JSON.parse(content);
  } catch {
    return undefined;
  }

  const parsedServers = isRecord(settings) ? settings[MCP_SERVERS_KEY] : undefined;
  if (!isRecord(parsedServers)) return undefined;

  const serverObjects = rootMemberObjects(content, MCP_SERVERS_KEY);
  const servers = serverObjects.length === 1 ? serverObjects[0] : undefined;
  if (servers === undefined || servers.members.length !== Object.keys(parsedServers).length) {
    return undefined;
  }

  return {
    servers: serverTextScanMetadata(content, servers),
    settings: { ruleScanContent: withEmptiedObject(content, servers) },
  };
}

async function discoverHookScripts(
  files: AgentConfigFiles,
  configPaths: string[],
  root: HookScriptRoot
): Promise<Skill[]> {
  const skills: Skill[] = [];
  const scripts = await hookScripts(configPaths, root);

  for (const path of [...scripts.keys()].sort()) {
    const name = posix.join(root.displayDir, relative(root.dir, path).split(sep).join('/'));
    // The config file's metadata does not apply to its scripts. A script gets the scan name
    // of each language that the hooks run it with, as one installation per name. The scan
    // name is set also when it is the file's own name: the hooks decide the language, so the
    // engine adds no shebang rules. hookScriptScanNames adds the shebang name itself when an
    // unknown word such as `exec` runs the script.
    const scanNames = [...(scripts.get(path) ?? [])];
    const [ruleScanFilename = basename(path)] = scanNames;
    const skill = await agentConfigSkill(files, path, name, { ruleScanFilename });
    const installations = scanNames.map((scanName) => ({
      format: skill.format,
      scope: skill.scope,
      scanName,
    }));
    skills.push(installations.length > 1 ? { ...skill, installations } : skill);
  }

  return skills;
}

/**
 * Finds the files below the root that hook commands in the config files name. Each maps to
 * its scan names: `check.sh` and `check.py` for `bash scripts/check; python3 scripts/check`,
 * and its own name for a hook that keeps it.
 */
async function hookScripts(
  configPaths: string[],
  root: HookScriptRoot
): Promise<Map<string, Set<string>>> {
  const placeholder = new RegExp(`^\\$\\{?${root.placeholder}\\}?(?=[\\\\/])`);
  const realRoot = await realPathOrUndefined(root.dir);
  const scripts = new Map<string, Set<string>>();
  if (realRoot === undefined) return scripts;

  // ponytail: each command value is split alone, so `"command": "bash"` does not pair with a
  // script in `args`. That script is named as if the command ran it directly.
  for (const command of await commandValues(configPaths)) {
    for (const { word, interpreter } of commandWords(command)) {
      const rootRelative = word.replace(placeholder, '.');
      if (rootRelative === word && !root.isWorkingDir) continue;

      const path = resolve(root.dir, rootRelative);
      if (!isBelow(root.dir, path) || configPaths.includes(path)) continue;

      // A symlink can point outside the root, so the real path must stay below it too.
      const realPath = await realPathOrUndefined(path);
      if (realPath !== undefined && isBelow(realRoot, realPath) && (await isRegularFile(path))) {
        const scanNames = scripts.get(path) ?? new Set<string>();
        for (const scanName of hookScriptScanNames(path, interpreter)) scanNames.add(scanName);
        scripts.set(path, scanNames);
      }
    }
  }

  return scripts;
}

/**
 * Splits a command into unquoted words. Each word comes with its interpreter: the last word
 * before it in the same command that is not an option, an option value, or a subcommand, so
 * `bash -o pipefail scripts/setup` pairs the script with `bash`. An option value that the
 * interpreter loads as code pairs with it too, as `./setup` in `node --require ./setup`.
 */
function commandWords(command: string): CommandWord[] {
  const words: CommandWord[] = [];
  let interpreter: string | undefined;
  // The interpreters of the next words that hold option values, as `ignore` in
  // `python3 -W ignore scripts/check`. The script still follows them.
  let valueInterpreters: string[] = [];

  for (const token of command.match(SHELL_TOKEN) ?? []) {
    if (COMMAND_SEPARATORS.has(token)) {
      interpreter = undefined;
      valueInterpreters = [];
      continue;
    }

    const word = token.replace(SHELL_QUOTES, '');
    const valueInterpreter = valueInterpreters.shift();
    if (valueInterpreter !== undefined) {
      words.push({ word, interpreter: valueInterpreter });
      continue;
    }

    words.push({ word, interpreter });
    valueInterpreters = optionValueInterpreters(interpreter, word);
    interpreter = nextInterpreter(word, interpreter);
  }

  return words;
}

/** Returns the interpreter of the word after `word`. */
function nextInterpreter(word: string, interpreter: string | undefined): string | undefined {
  if (isShellInterpreter(interpreter) && SHELL_COMMAND_OPTION.test(word)) return undefined;
  if (interpreter === undefined && SOURCE_COMMANDS.has(word)) return SOURCING_SHELL;

  return keepsInterpreter(interpreter, word) ? interpreter : word;
}

async function commandValues(configPaths: string[]): Promise<string[]> {
  const commands: string[] = [];

  for (const path of configPaths) {
    try {
      commands.push(...agentConfigCommandValues(await readFile(path, 'utf8')));
    } catch {
      // An unreadable file has no commands. The rule engine skips it the same way.
    }
  }

  return commands;
}

async function agentConfigSkill(
  files: AgentConfigFiles,
  path: string,
  name: string,
  metadata?: Skill['metadata']
): Promise<Skill> {
  return {
    id: createHash('sha256').update(`${files.agentId}:${path}`).digest('hex').slice(0, 16),
    agentId: files.agentId,
    name,
    path,
    manifestPath: path,
    format: 'agent-config',
    scope: files.scope,
    treeSha256: await computeTreeSha256(path),
    ...(metadata === undefined ? {} : { metadata }),
  };
}

/**
 * Gives each server its definition as the file writes it, in a one-server document. The
 * raw-text rules read lines and windows of lines, so a re-serialized definition can move a
 * payload out of their reach, e.g. past the window that follows a long "args" array.
 */
function serverTextScanMetadata(
  content: string,
  servers: JsonObjectSpan
): Map<string, NonNullable<Skill['metadata']>> {
  const metadata = new Map<string, NonNullable<Skill['metadata']>>();

  for (const [index, member] of servers.members.entries()) {
    // Up to the next member name, the text is this member, a comma, and whitespace.
    const nextStart = servers.members[index + 1]?.start ?? servers.end - 1;
    const text = content.slice(member.start, nextStart).trimEnd();
    const memberText = text.endsWith(',') ? text.slice(0, -1).trimEnd() : text;

    metadata.set(member.name, {
      ruleScanFilename: MCP_SERVER_SCAN_FILENAME,
      ruleScanContent: `{ "${MCP_SERVERS_KEY}": { ${memberText} } }`,
    });
  }

  return metadata;
}

// The kept braces keep the JSON valid for the settings views, and the kept line breaks keep
// every other finding on its real line.
function withEmptiedObject(content: string, object: JsonObjectSpan): string {
  const emptied = content.slice(object.start + 1, object.end - 1).replace(NOT_LINE_BREAK, ' ');
  return content.slice(0, object.start + 1) + emptied + content.slice(object.end - 1);
}

type JsonMember = { name: string; start: number };
type JsonObjectSpan = { start: number; end: number; members: JsonMember[] };

/**
 * Finds each root member named `key` in valid JSON text, in file order. An object value gets
 * its offsets and the name and offset of each of its members, duplicate names included. Any
 * other value is undefined.
 */
function rootMemberObjects(content: string, key: string): Array<JsonObjectSpan | undefined> {
  const objects: Array<JsonObjectSpan | undefined> = [];
  let depth = 0;
  let previousToken = '';
  let previousIndex = 0;
  let afterKeyColon = false;
  let openObject: Omit<JsonObjectSpan, 'end'> | undefined;

  for (const { token, index } of jsonStructureTokens(content)) {
    const isMemberValueStart = afterKeyColon;
    afterKeyColon = false;

    if (token === ':') {
      // In valid JSON the token before a colon is the member name.
      if (depth === 1 && JSON.parse(previousToken) === key) {
        objects.push(undefined);
        afterKeyColon = true;
      } else if (depth === 2 && openObject !== undefined) {
        openObject.members.push({ name: JSON.parse(previousToken), start: previousIndex });
      }
    } else if (token === '{' || token === '[') {
      if (isMemberValueStart && token === '{') openObject = { start: index, members: [] };
      depth += 1;
    } else if (token === '}' || token === ']') {
      depth -= 1;
      if (depth === 1 && openObject !== undefined) {
        objects[objects.length - 1] = { ...openObject, end: index + 1 };
        openObject = undefined;
      }
    }

    previousToken = token;
    previousIndex = index;
  }

  return objects;
}

/**
 * Yields the string literals and structural punctuation of a JSON text with their offsets.
 * A character loop: a regular expression with a quantified group keeps one V8 backtrack entry
 * per character or per escape sequence, and overflows on a multi-megabyte string value, which
 * a padded settings file can hold.
 */
function* jsonStructureTokens(content: string): Generator<{ token: string; index: number }> {
  let index = 0;
  while (index < content.length) {
    const char = content[index] ?? '';
    if (char === '"') {
      const end = jsonStringEnd(content, index);
      yield { token: content.slice(index, end), index };
      index = end;
      continue;
    }

    if (JSON_STRUCTURE_CHARS.has(char)) yield { token: char, index };
    index += 1;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isBelow(dir: string, path: string): boolean {
  const rel = relative(dir, path);
  return rel !== '' && rel.split(sep)[0] !== '..' && !isAbsolute(rel);
}

async function realPathOrUndefined(path: string): Promise<string | undefined> {
  try {
    return await realpath(path);
  } catch {
    return undefined;
  }
}

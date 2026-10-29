import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { isAbsolute, join, posix, relative, resolve, sep } from 'node:path';
import { isRegularFile } from '../fs-walk.js';
import { agentConfigCommandValues } from '../rules/agent-config.js';
import type { Skill } from '../types.js';
import { computeTreeSha256 } from './tree-hash.js';

// Each MCP server is scanned as a one-server .mcp.json document. Findings stay on that
// server, and rules never read or quote the rest of a shared file such as ~/.claude.json.
const MCP_SERVER_SCAN_FILENAME = '.mcp.json';

// A hook command names a script as one shell word, such as "${CLAUDE_PLUGIN_ROOT}"/run.sh or
// "$CLAUDE_PROJECT_DIR/set up.sh". Quoted parts keep their spaces; the quotes are removed after
// the split.
const SHELL_WORD = /(?:"[^"]*"|'[^']*'|[^\s;|&()<>`"'])+/g;
const SHELL_QUOTES = /["']/g;

const MCP_SERVERS_KEY = 'mcpServers';

// String literals and the punctuation that opens, closes, or names a JSON value. No other
// character in valid JSON changes the nesting, so a structure scan can skip the rest.
const JSON_STRUCTURE_TOKEN = /"(?:[^"\\]|\\.)*"|[{}[\]:]/g;
const NOT_LINE_BREAK = /[^\r\n]/g;

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

  for (const path of await hookScriptPaths(configPaths, root)) {
    const name = posix.join(root.displayDir, relative(root.dir, path).split(sep).join('/'));
    // No metadata: a scan filename override belongs to the config file, not to its scripts.
    skills.push(await agentConfigSkill(files, path, name));
  }

  return skills;
}

/** Finds the files below the root that hook commands in the config files name. */
async function hookScriptPaths(configPaths: string[], root: HookScriptRoot): Promise<string[]> {
  const placeholder = new RegExp(`^\\$\\{?${root.placeholder}\\}?(?=[\\\\/])`);
  const realRoot = await realPathOrUndefined(root.dir);
  if (realRoot === undefined) return [];
  const scripts = new Set<string>();

  for (const command of await commandValues(configPaths)) {
    for (const quotedWord of command.match(SHELL_WORD) ?? []) {
      const word = quotedWord.replace(SHELL_QUOTES, '');
      const rootRelative = word.replace(placeholder, '.');
      if (rootRelative === word && !root.isWorkingDir) continue;

      const path = resolve(root.dir, rootRelative);
      if (!isBelow(root.dir, path) || configPaths.includes(path)) continue;

      // A symlink can point outside the root, so the real path must stay below it too.
      const realPath = await realPathOrUndefined(path);
      if (realPath !== undefined && isBelow(realRoot, realPath) && (await isRegularFile(path))) {
        scripts.add(path);
      }
    }
  }

  return [...scripts].sort();
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

  for (const match of content.matchAll(JSON_STRUCTURE_TOKEN)) {
    const token = match[0];
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
      if (isMemberValueStart && token === '{') openObject = { start: match.index, members: [] };
      depth += 1;
    } else if (token === '}' || token === ']') {
      depth -= 1;
      if (depth === 1 && openObject !== undefined) {
        objects[objects.length - 1] = { ...openObject, end: match.index + 1 };
        openObject = undefined;
      }
    }

    previousToken = token;
    previousIndex = match.index;
  }

  return objects;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBelow(dir: string, path: string): boolean {
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

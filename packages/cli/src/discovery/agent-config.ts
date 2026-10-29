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

/**
 * Leaves the MCP servers out of the rule scan of a settings file, for an agent that reports
 * each server on its own entry, so a risky server is reported once. Returns undefined, and the
 * whole file is scanned, when JSON.parse cannot read the file or drops a server definition
 * (a second `mcpServers` key or a duplicate server name), because that definition has no entry
 * of its own.
 */
export function settingsScanMetadataWithoutMcpServers(
  content: string
): NonNullable<Skill['metadata']> | undefined {
  let settings: unknown;
  try {
    settings = JSON.parse(content);
  } catch {
    return undefined;
  }

  const parsedServers = isRecord(settings) ? settings[MCP_SERVERS_KEY] : undefined;
  if (!isRecord(parsedServers)) return undefined;

  const members = rootMemberObjects(content, MCP_SERVERS_KEY);
  const servers = members.length === 1 ? members[0] : undefined;
  if (servers === undefined || servers.memberCount !== Object.keys(parsedServers).length) {
    return undefined;
  }

  // An empty object keeps the JSON valid for the settings views, and the kept line breaks keep
  // every other finding on its real line.
  const emptied = content.slice(servers.start + 1, servers.end - 1).replace(NOT_LINE_BREAK, ' ');
  return {
    ruleScanContent: content.slice(0, servers.start + 1) + emptied + content.slice(servers.end - 1),
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

type JsonObjectSpan = { start: number; end: number; memberCount: number };

/**
 * Finds each root member named `key` in valid JSON text, in file order. An object value gets
 * its offsets and its member count, duplicate names included. Any other value is undefined.
 */
function rootMemberObjects(content: string, key: string): Array<JsonObjectSpan | undefined> {
  const members: Array<JsonObjectSpan | undefined> = [];
  let depth = 0;
  let previousToken = '';
  let afterKeyColon = false;
  let openObject: Omit<JsonObjectSpan, 'end'> | undefined;

  for (const match of content.matchAll(JSON_STRUCTURE_TOKEN)) {
    const token = match[0];
    const isMemberValueStart = afterKeyColon;
    afterKeyColon = false;

    if (token === ':') {
      // In valid JSON the token before a colon is the member name.
      if (depth === 1 && JSON.parse(previousToken) === key) {
        members.push(undefined);
        afterKeyColon = true;
      } else if (depth === 2 && openObject !== undefined) {
        openObject.memberCount += 1;
      }
    } else if (token === '{' || token === '[') {
      if (isMemberValueStart && token === '{') openObject = { start: match.index, memberCount: 0 };
      depth += 1;
    } else if (token === '}' || token === ']') {
      depth -= 1;
      if (depth === 1 && openObject !== undefined) {
        members[members.length - 1] = { ...openObject, end: match.index + 1 };
        openObject = undefined;
      }
    }

    previousToken = token;
  }

  return members;
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

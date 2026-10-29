import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { isAbsolute, join, posix, relative, resolve, sep } from 'node:path';
import { agentConfigCommandValues } from '../rules/agent-config.js';
import type { Skill } from '../types.js';
import { computeTreeSha256 } from './tree-hash.js';

// Each MCP server is scanned as a one-server .mcp.json document. Findings stay on that
// server, and rules never read or quote the rest of a shared file such as ~/.claude.json.
const MCP_SERVER_SCAN_FILENAME = '.mcp.json';

// A hook command names a script as one shell word, such as "${CLAUDE_PLUGIN_ROOT}"/run.sh.
// Quotes only group parts of that word, so they are removed before the split.
const SHELL_QUOTES = /["']/g;
const SHELL_WORD = /[^\s;|&()<>`]+/g;

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
    if (!(await isFile(path))) continue;

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
  const scripts = new Set<string>();

  for (const command of await commandValues(configPaths)) {
    for (const word of command.replace(SHELL_QUOTES, '').match(SHELL_WORD) ?? []) {
      const rootRelative = word.replace(placeholder, '.');
      if (rootRelative === word && !root.isWorkingDir) continue;

      const path = resolve(root.dir, rootRelative);
      if (isBelow(root.dir, path) && !configPaths.includes(path) && (await isFile(path))) {
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

function isBelow(dir: string, path: string): boolean {
  const rel = relative(dir, path);
  return rel !== '' && rel.split(sep)[0] !== '..' && !isAbsolute(rel);
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

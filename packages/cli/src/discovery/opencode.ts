import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AgentDiscovery, Skill } from '../types.js';
import {
  compatibleProjectSkills,
  fileSkills,
  homeDir,
  isRecord,
  markdownSkills,
  mcpServerSkills,
  pathExists,
  pluginCodeSkills,
  projectDir,
  readJson5Config,
  xdgConfigDir,
} from './agent-files.js';
import { ancestorDirsToGitRoot } from './project-dirs.js';
import { discoverSharedAgentSkills, discoverSkillDirs } from './shared-agent-skills.js';

const AGENT_ID = 'opencode';
// The server config and the TUI config. Both can list plugins.
const CONFIG_FILE_NAMES = ['opencode.json', 'opencode.jsonc', 'tui.json', 'tui.jsonc'];
const PROJECT_DIR_NAME = '.opencode';
// Subdirectories of each OpenCode directory. The singular names are the legacy ones.
const AGENT_DIRS = ['agents', 'agent', 'modes', 'mode'];
const COMMAND_DIRS = ['commands', 'command'];
const SKILL_DIRS = ['skills', 'skill'];
// Plugins, and the custom tools of OpenCode 1.
const CODE_DIRS = ['plugins', 'plugin', 'tools', 'tool'];
// OpenCode 2 nests the servers under this key of `mcp`; OpenCode 1 puts them in `mcp` itself.
const NESTED_SERVERS_KEY = 'servers';
// A `plugin` list entry is an npm package name or a local module path.
const LOCAL_PLUGIN_REF = /^(?:\.{1,2}\/|\/|~\/|file:\/\/)/;
const HOME_PREFIX = '~/';
const FILE_URL_PREFIX = 'file://';

const opencodeDiscovery: AgentDiscovery = {
  id: AGENT_ID,
  displayName: 'OpenCode',

  async isInstalled(): Promise<boolean> {
    return (await pathExists(globalConfigDir())) || (await pathExists(dataDir()));
  },

  async discoverSkills(): Promise<Skill[]> {
    const skills = await discoverUserTargets();
    const projectDirs = await ancestorDirsToGitRoot(projectDir());

    // OpenCode reads project config from the working directory up to the git root.
    for (const dir of projectDirs) {
      skills.push(...(await discoverConfigFiles(dir, 'project')));
      skills.push(...(await discoverOpencodeDir(join(dir, PROJECT_DIR_NAME), 'project')));
    }
    skills.push(...(await compatibleProjectSkills(AGENT_ID, projectDirs)));
    skills.push(...(await discoverSharedAgentSkills(AGENT_ID)));

    return firstOfEachId(skills);
  },
};

export default opencodeDiscovery;

async function discoverUserTargets(): Promise<Skill[]> {
  const configDir = globalConfigDir();
  const skills = [
    ...(await fileSkills(AGENT_ID, [join(configDir, 'AGENTS.md')], 'agents-md', 'user')),
    ...(await discoverOpencodeDir(configDir, 'user')),
    ...(await discoverSkillDirs(AGENT_ID, join(homeDir(), '.claude', 'skills'), 'user')),
  ];

  // OPENCODE_CONFIG adds a config file, and OPENCODE_CONFIG_DIR adds a directory with the
  // layout of `.opencode`.
  const customConfig = process.env.OPENCODE_CONFIG;
  if (customConfig !== undefined) skills.push(...(await discoverConfigFile(customConfig, 'user')));
  const customDir = process.env.OPENCODE_CONFIG_DIR;
  if (customDir !== undefined) skills.push(...(await discoverOpencodeDir(customDir, 'user')));

  return skills;
}

/** The config, agents, commands, skills, plugins, and tools of one OpenCode directory. */
async function discoverOpencodeDir(dir: string, scope: Skill['scope']): Promise<Skill[]> {
  const skills = await discoverConfigFiles(dir, scope);

  for (const name of AGENT_DIRS) {
    skills.push(...(await markdownSkills(AGENT_ID, join(dir, name), 'agents-md', scope)));
  }
  // Command bodies can run shell commands, such as !`git status`.
  for (const name of COMMAND_DIRS) {
    skills.push(...(await markdownSkills(AGENT_ID, join(dir, name), 'prompt-md', scope)));
  }
  // A skill is a SKILL.md directory or, in OpenCode 2, a markdown file at the top.
  for (const name of SKILL_DIRS) {
    skills.push(...(await discoverSkillDirs(AGENT_ID, join(dir, name), scope)));
    skills.push(...(await markdownSkills(AGENT_ID, join(dir, name), 'SKILL.md', scope, false)));
  }
  for (const name of CODE_DIRS) {
    skills.push(...(await pluginCodeSkills(AGENT_ID, join(dir, name), scope)));
  }

  return skills;
}

async function discoverConfigFiles(dir: string, scope: Skill['scope']): Promise<Skill[]> {
  const skills: Skill[] = [];
  for (const name of CONFIG_FILE_NAMES) {
    skills.push(...(await discoverConfigFile(join(dir, name), scope)));
  }
  return skills;
}

/** The MCP servers of a config file, and the local plugin files that its `plugin` list names. */
async function discoverConfigFile(configPath: string, scope: Skill['scope']): Promise<Skill[]> {
  const config = await readJson5Config(configPath);
  const pluginPaths = localPluginRefs(config).flatMap((ref) => resolvePluginRef(ref, configPath));

  return [
    ...mcpServerSkills(AGENT_ID, configPath, mcpServers(config), scope),
    ...(await fileSkills(AGENT_ID, pluginPaths, 'agent-config', scope)),
  ];
}

/**
 * Collects the servers of both config shapes: OpenCode 1 `mcp.<name>` and OpenCode 2
 * `mcp.servers.<name>`. A `servers` entry that is itself a server definition is an
 * OpenCode 1 server with that name.
 */
function mcpServers(config: unknown): Record<string, unknown> {
  const mcp = isRecord(config) ? config.mcp : undefined;
  if (!isRecord(mcp)) return {};

  const servers = Object.entries(mcp).flatMap(([name, value]): Array<[string, unknown]> => {
    if (!isRecord(value)) return [];
    return name === NESTED_SERVERS_KEY && !isServerDefinition(value)
      ? Object.entries(value)
      : [[name, value]];
  });
  // fromEntries defines own properties, so a server named `__proto__` stays a server. An
  // assignment to a plain object would set the prototype and drop the server from the scan.
  return Object.fromEntries(servers);
}

// A server definition holds a `type` or `url` string or a `command`. A server map holds server
// objects, also under those names, such as a server called `command`.
function isServerDefinition(value: Record<string, unknown>): boolean {
  return (
    typeof value.type === 'string' ||
    typeof value.url === 'string' ||
    typeof value.command === 'string' ||
    Array.isArray(value.command)
  );
}

// Overrides and the project walk can reach the same file twice, for example when
// OPENCODE_CONFIG names the global config file. A target id is a hash of the agent, path, and
// server name, so a repeated id is the same target. MCP server targets have no tree hash, and
// discoverAll() does not merge them, so the plugin drops the repeats.
function firstOfEachId(skills: Skill[]): Skill[] {
  const seenIds = new Set<string>();

  return skills.filter((skill) => {
    if (seenIds.has(skill.id)) return false;
    seenIds.add(skill.id);
    return true;
  });
}

// npm plugins load from OpenCode's cache and are not scanned yet.
// ponytail: a local entry that names a package directory, not a file, is not scanned either.
function localPluginRefs(config: unknown): string[] {
  const plugins = isRecord(config) ? config.plugin : undefined;
  if (!Array.isArray(plugins)) return [];

  return plugins.filter(
    (entry): entry is string => typeof entry === 'string' && LOCAL_PLUGIN_REF.test(entry)
  );
}

// A relative entry resolves against the directory of the config file that lists it. A file URL
// that names no local path, such as one with a remote host, resolves to nothing.
function resolvePluginRef(ref: string, configPath: string): string[] {
  if (ref.startsWith(HOME_PREFIX)) return [join(homeDir(), ref.slice(HOME_PREFIX.length))];
  if (!ref.startsWith(FILE_URL_PREFIX)) return [resolve(dirname(configPath), ref)];

  try {
    return [fileURLToPath(ref)];
  } catch {
    return [];
  }
}

function globalConfigDir(): string {
  return join(xdgConfigDir(), 'opencode');
}

// OpenCode keeps sessions and auth here, so it exists once OpenCode has run.
function dataDir(): string {
  return join(process.env.XDG_DATA_HOME ?? join(homeDir(), '.local', 'share'), 'opencode');
}

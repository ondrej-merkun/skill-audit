import { join } from 'node:path';
import { readDirFollowingLinks } from '../fs-walk.js';
import type { AgentDiscovery, Skill } from '../types.js';
import {
  fileSkills,
  homeDir,
  isRecord,
  mcpServerSkills,
  pathExists,
  pluginCodeSkills,
  readJson5Config,
} from './agent-files.js';
import { discoverSkillDirs } from './shared-agent-skills.js';

const AGENT_ID = 'openclaw';
const DEFAULT_STATE_DIR_NAME = '.openclaw';
// The workspace files that OpenClaw injects into the prompt or runs at Gateway startup.
// Older releases also inject TOOLS.md and HEARTBEAT.md. Daily `memory/*.md` logs are read on
// demand only.
const BOOTSTRAP_FILE_NAMES = [
  'AGENTS.md',
  'SOUL.md',
  'USER.md',
  'IDENTITY.md',
  'BOOT.md',
  'BOOTSTRAP.md',
  'MEMORY.md',
  'TOOLS.md',
  'HEARTBEAT.md',
];
// Config keys that hold MCP server maps. `mcp.servers` is the documented one and
// `nodeHost.mcp.servers` serves a node host. A config that OpenClaw 2026.6 wrote keeps its
// servers in a root `mcpServers` map, which the current docs do not name.
const MCP_SERVER_KEY_PATHS = [['mcp', 'servers'], ['nodeHost', 'mcp', 'servers'], ['mcpServers']];

// OpenClaw is a gateway: its project is the agent workspace, not the scan's working directory,
// so every target has user scope. `openclaw --profile <name>` sets the same variables.
// Not scanned: workspace hooks and workspace extensions, which load only after the user
// enables them, and extra skill, hook, and plugin directories that the config names.
const openclawDiscovery: AgentDiscovery = {
  id: AGENT_ID,
  displayName: 'OpenClaw',

  async isInstalled(): Promise<boolean> {
    return pathExists(stateDir());
  },

  async discoverSkills(): Promise<Skill[]> {
    const state = stateDir();
    const workspace = workspaceDir();
    const workspaceFiles = BOOTSTRAP_FILE_NAMES.map((name) => join(workspace, name));

    return [
      ...(await discoverConfigServers()),
      ...(await discoverSkillDirs(AGENT_ID, join(state, 'skills'), 'user')),
      ...(await discoverWorkshopSkills(state)),
      ...(await discoverPersonalSkills()),
      ...(await pluginCodeSkills(AGENT_ID, join(state, 'hooks'), 'user', false)),
      ...(await pluginCodeSkills(AGENT_ID, join(state, 'extensions'), 'user', false)),
      ...(await fileSkills(AGENT_ID, workspaceFiles, 'agents-md', 'user')),
      ...(await discoverSkillDirs(AGENT_ID, join(workspace, 'skills'), 'user')),
      ...(await discoverSkillDirs(AGENT_ID, join(workspace, '.agents', 'skills'), 'user')),
    ];
  },
};

export default openclawDiscovery;

async function discoverConfigServers(): Promise<Skill[]> {
  const path = configPath();
  const config = await readJson5Config(path);
  const skills: Skill[] = [];

  for (const keyPath of MCP_SERVER_KEY_PATHS) {
    const servers = keyPath.reduce<unknown>(
      (value, key) => (isRecord(value) ? value[key] : undefined),
      config
    );
    // The key path keeps the ids of same-named servers in two maps apart.
    if (isRecord(servers)) {
      skills.push(...mcpServerSkills(AGENT_ID, path, servers, 'user', keyPath.join('.')));
    }
  }

  return skills;
}

// Each agent keeps the skills that Skill Workshop generates for it.
async function discoverWorkshopSkills(state: string): Promise<Skill[]> {
  const agentsDir = join(state, 'agents');
  const skills: Skill[] = [];

  for (const entry of await readDirFollowingLinks(agentsDir)) {
    if (entry.kind !== 'dir') continue;
    const workshopDir = join(agentsDir, entry.name, 'agent', 'workshop-skills');
    skills.push(...(await discoverSkillDirs(AGENT_ID, workshopDir, 'user')));
  }

  return skills;
}

// OpenClaw reads ~/.agents/skills only with the default state directory.
async function discoverPersonalSkills(): Promise<Skill[]> {
  if (stateDir() !== defaultStateDir()) return [];
  return discoverSkillDirs(AGENT_ID, join(homeDir(), '.agents', 'skills'), 'user');
}

function stateDir(): string {
  return process.env.OPENCLAW_STATE_DIR ?? defaultStateDir();
}

function defaultStateDir(): string {
  return join(homeDir(), DEFAULT_STATE_DIR_NAME);
}

function configPath(): string {
  return process.env.OPENCLAW_CONFIG_PATH ?? join(stateDir(), 'openclaw.json');
}

function workspaceDir(): string {
  return process.env.OPENCLAW_WORKSPACE_DIR ?? join(stateDir(), 'workspace');
}

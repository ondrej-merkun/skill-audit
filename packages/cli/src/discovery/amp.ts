import { join } from 'node:path';
import { isRegularFile } from '../fs-walk.js';
import type { AgentDiscovery, Skill } from '../types.js';
import {
  compatibleProjectSkills,
  fileSkills,
  homeDir,
  isRecord,
  mcpServerSkills,
  pathExists,
  pluginCodeSkills,
  projectDir,
  readJson5Config,
  xdgConfigDir,
} from './agent-files.js';
import { ancestorDirsToGitRoot, gitRootFromAncestors } from './project-dirs.js';
import { discoverSharedAgentSkills, discoverSkillDirs } from './shared-agent-skills.js';

const AGENT_ID = 'amp';
const SETTINGS_FILE_NAMES = ['settings.json', 'settings.jsonc'];
const PROJECT_DIR_NAME = '.amp';
// Amp settings use dotted top-level keys; this one holds the MCP servers.
const MCP_SERVERS_KEY = 'amp.mcpServers';

const ampDiscovery: AgentDiscovery = {
  id: AGENT_ID,
  displayName: 'Amp',

  async isInstalled(): Promise<boolean> {
    return pathExists(configDir());
  },

  async discoverSkills(): Promise<Skill[]> {
    return [
      ...(await discoverUserTargets()),
      ...(await discoverProjectTargets()),
      ...(await discoverSharedAgentSkills(AGENT_ID)),
    ];
  },
};

export default ampDiscovery;

async function discoverUserTargets(): Promise<Skill[]> {
  const ampDir = configDir();
  const instructionFiles = [join(ampDir, 'AGENTS.md'), join(xdgConfigDir(), 'AGENTS.md')];

  return [
    ...(await discoverSettingsServers(ampDir, 'user')),
    ...(await fileSkills(AGENT_ID, instructionFiles, 'agents-md', 'user')),
    ...(await discoverSkillDirs(AGENT_ID, join(ampDir, 'skills'), 'user')),
    ...(await discoverSkillDirs(AGENT_ID, join(xdgConfigDir(), 'agents', 'skills'), 'user')),
    ...(await discoverSkillDirs(AGENT_ID, join(homeDir(), '.claude', 'skills'), 'user')),
    ...(await pluginCodeSkills(AGENT_ID, join(ampDir, 'plugins'), 'user')),
  ];
}

async function discoverProjectTargets(): Promise<Skill[]> {
  const cwd = projectDir();
  const projectDirs = await ancestorDirsToGitRoot(cwd);
  const projectRoot = (await gitRootFromAncestors(projectDirs)) ?? cwd;
  const skills: Skill[] = [];

  // Amp reads the nearest workspace settings, searched upward from the working directory.
  for (const dir of projectDirs) {
    const settingsDir = join(dir, PROJECT_DIR_NAME);
    if (await hasSettingsFile(settingsDir)) {
      skills.push(...(await discoverSettingsServers(settingsDir, 'project')));
      break;
    }
  }

  const pluginsDir = join(projectRoot, PROJECT_DIR_NAME, 'plugins');
  skills.push(...(await pluginCodeSkills(AGENT_ID, pluginsDir, 'project')));
  skills.push(...(await compatibleProjectSkills(AGENT_ID, projectDirs)));

  return skills;
}

async function discoverSettingsServers(dir: string, scope: Skill['scope']): Promise<Skill[]> {
  const skills: Skill[] = [];

  for (const name of SETTINGS_FILE_NAMES) {
    const settingsPath = join(dir, name);
    const settings = await readJson5Config(settingsPath);
    const servers = isRecord(settings) ? settings[MCP_SERVERS_KEY] : undefined;
    if (isRecord(servers)) skills.push(...mcpServerSkills(AGENT_ID, settingsPath, servers, scope));
  }

  return skills;
}

async function hasSettingsFile(dir: string): Promise<boolean> {
  for (const name of SETTINGS_FILE_NAMES) {
    if (await isRegularFile(join(dir, name))) return true;
  }
  return false;
}

// Amp documents the XDG_CONFIG_HOME base for plugins. ponytail: the settings, skills, and
// instruction files use the same base; the docs name only `~/.config` for them.
function configDir(): string {
  return join(xdgConfigDir(), 'amp');
}

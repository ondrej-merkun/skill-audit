import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import os from 'node:os';
import { basename, join } from 'node:path';
import type { AgentDiscovery, DiscoverSkillsOptions, Skill } from '../types.js';
import { computeTreeSha256 } from './tree-hash.js';

const AGENT_ID = 'cline';
const CLINE_EXTENSION_ID = 'saoudrizwan.claude-dev';
const MCP_SETTINGS_FILE = 'cline_mcp_settings.json';

function getHomeDir(): string {
  return process.env.HOME ?? process.env.USERPROFILE ?? os.homedir();
}

function getCwd(): string {
  return process.env.SKILLAUDIT_CWD ?? process.cwd();
}

function getClineDir(): string {
  return process.env.CLINE_DIR ?? join(getHomeDir(), '.cline');
}

function makeId(input: string): string {
  return createHash('sha256').update(`${AGENT_ID}:${input}`).digest('hex').slice(0, 16);
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function isFile(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
}

function stripKnownExtension(fileName: string, extensions: string[]): string {
  const extension = extensions.find((candidate) => fileName.endsWith(candidate));
  return extension === undefined ? fileName : fileName.slice(0, -extension.length);
}

function userDocumentsClineDir(name: 'Rules' | 'Workflows'): string {
  return join(getHomeDir(), 'Documents', 'Cline', name);
}

function userRulesDirs(): string[] {
  return [userDocumentsClineDir('Rules'), join(getHomeDir(), 'Cline', 'Rules')];
}

function userWorkflowsDirs(): string[] {
  return [userDocumentsClineDir('Workflows')];
}

function appDataDir(): string {
  return process.env.APPDATA ?? join(getHomeDir(), 'AppData', 'Roaming');
}

function xdgConfigDir(): string {
  return process.env.XDG_CONFIG_HOME ?? join(getHomeDir(), '.config');
}

function vsCodeExtensionStorageDirs(): string[] {
  if (process.platform === 'win32') {
    return ['Code', 'Code - Insiders'].map((name) =>
      join(appDataDir(), name, 'User', 'globalStorage', CLINE_EXTENSION_ID)
    );
  }

  if (process.platform === 'darwin') {
    const applicationSupport = join(getHomeDir(), 'Library', 'Application Support');
    return ['Code', 'Code - Insiders'].map((name) =>
      join(applicationSupport, name, 'User', 'globalStorage', CLINE_EXTENSION_ID)
    );
  }

  return ['Code', 'Code - Insiders', 'VSCodium'].map((name) =>
    join(xdgConfigDir(), name, 'User', 'globalStorage', CLINE_EXTENSION_ID)
  );
}

function jetBrainsBaseDir(): string {
  if (process.platform === 'win32') return join(appDataDir(), 'JetBrains');
  if (process.platform === 'darwin') {
    return join(getHomeDir(), 'Library', 'Application Support', 'JetBrains');
  }
  return join(xdgConfigDir(), 'JetBrains');
}

async function jetBrainsExtensionStorageDirs(): Promise<string[]> {
  let entries: Array<{ isDirectory(): boolean; name: string }>;
  const base = jetBrainsBaseDir();
  try {
    entries = await readdir(base, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(base, entry.name, 'globalStorage', CLINE_EXTENSION_ID));
}

async function clineExtensionStorageDirs(): Promise<string[]> {
  return [...vsCodeExtensionStorageDirs(), ...(await jetBrainsExtensionStorageDirs())];
}

type McpServersShape = Record<string, unknown>;

async function discoverMcpSettings(settingsPath: string): Promise<Skill[]> {
  let raw: string;
  try {
    raw = await readFile(settingsPath, 'utf8');
  } catch {
    return [];
  }

  let parsed: { mcpServers?: McpServersShape };
  try {
    parsed = JSON.parse(raw) as { mcpServers?: McpServersShape };
  } catch {
    return [];
  }

  return Object.keys(parsed.mcpServers ?? {})
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({
      id: makeId(`${settingsPath}:${name}`),
      agentId: AGENT_ID,
      name,
      path: settingsPath,
      manifestPath: settingsPath,
      format: 'mcp-json' as const,
      scope: 'user' as const,
      treeSha256: '',
    }));
}

async function readSortedDir(
  dir: string
): Promise<Array<{ isDirectory(): boolean; isFile(): boolean; name: string }>> {
  try {
    return (await readdir(dir, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  } catch {
    return [];
  }
}

async function discoverRuleFiles(dir: string, scope: Skill['scope']): Promise<Skill[]> {
  const entries = (await readSortedDir(dir)).filter(
    (entry) => entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.txt'))
  );

  return Promise.all(
    entries.map(async (entry) => {
      const filePath = join(dir, entry.name);
      return {
        id: makeId(filePath),
        agentId: AGENT_ID,
        name: stripKnownExtension(entry.name, ['.md', '.txt']),
        path: filePath,
        manifestPath: filePath,
        format: 'rules-md' as const,
        scope,
        treeSha256: await computeTreeSha256(filePath),
      };
    })
  );
}

async function discoverLegacyRulesFile(filePath: string): Promise<Skill[]> {
  if (!(await isFile(filePath))) return [];
  return [
    {
      id: makeId(filePath),
      agentId: AGENT_ID,
      name: '.clinerules',
      path: filePath,
      manifestPath: filePath,
      format: 'rules-md',
      scope: 'project',
      treeSha256: await computeTreeSha256(filePath),
    },
  ];
}

async function discoverSkillsDir(dir: string, scope: Skill['scope']): Promise<Skill[]> {
  const entries = (await readSortedDir(dir)).filter((entry) => entry.isDirectory());
  const skills: Skill[] = [];

  for (const entry of entries) {
    const skillDir = join(dir, entry.name);
    const manifestPath = join(skillDir, 'SKILL.md');
    if (!(await isFile(manifestPath))) continue;
    skills.push({
      id: makeId(skillDir),
      agentId: AGENT_ID,
      name: entry.name,
      path: skillDir,
      manifestPath,
      format: 'SKILL.md',
      scope,
      treeSha256: await computeTreeSha256(skillDir),
    });
  }

  return skills;
}

async function discoverWorkflowFiles(dir: string, scope: Skill['scope']): Promise<Skill[]> {
  const entries = (await readSortedDir(dir)).filter(
    (entry) => entry.isFile() && entry.name.endsWith('.md')
  );

  return Promise.all(
    entries.map(async (entry) => {
      const filePath = join(dir, entry.name);
      return {
        id: makeId(filePath),
        agentId: AGENT_ID,
        name: basename(filePath, '.md'),
        path: filePath,
        manifestPath: filePath,
        format: 'prompt-md' as const,
        scope,
        treeSha256: await computeTreeSha256(filePath),
      };
    })
  );
}

async function installationCandidates(): Promise<string[]> {
  const home = getHomeDir();
  const cwd = getCwd();
  const clineDir = getClineDir();
  return [
    clineDir,
    join(cwd, '.cline'),
    join(cwd, '.clinerules'),
    ...userRulesDirs(),
    ...userWorkflowsDirs(),
    ...vsCodeExtensionStorageDirs(),
    ...(await jetBrainsExtensionStorageDirs()),
    join(home, 'Documents', 'Cline'),
  ];
}

const clineDiscovery: AgentDiscovery = {
  id: AGENT_ID,
  displayName: 'Cline',

  async isInstalled(): Promise<boolean> {
    for (const candidate of await installationCandidates()) {
      if (await pathExists(candidate)) return true;
    }
    return false;
  },

  async discoverSkills(_options: DiscoverSkillsOptions = {}): Promise<Skill[]> {
    const cwd = getCwd();
    const clineDir = getClineDir();
    const projectRulesPath = join(cwd, '.clinerules');
    const skills: Skill[] = [];

    for (const rulesDir of userRulesDirs()) {
      skills.push(...(await discoverRuleFiles(rulesDir, 'user')));
    }

    skills.push(...(await discoverSkillsDir(join(clineDir, 'skills'), 'user')));

    for (const workflowsDir of userWorkflowsDirs()) {
      skills.push(...(await discoverWorkflowFiles(workflowsDir, 'user')));
    }

    skills.push(
      ...(await discoverMcpSettings(join(clineDir, 'data', 'settings', MCP_SETTINGS_FILE)))
    );

    for (const storageDir of await clineExtensionStorageDirs()) {
      skills.push(...(await discoverMcpSettings(join(storageDir, 'settings', MCP_SETTINGS_FILE))));
    }

    skills.push(...(await discoverLegacyRulesFile(projectRulesPath)));
    skills.push(...(await discoverRuleFiles(projectRulesPath, 'project')));
    skills.push(...(await discoverSkillsDir(join(cwd, '.cline', 'skills'), 'project')));
    skills.push(...(await discoverSkillsDir(join(projectRulesPath, 'skills'), 'project')));
    skills.push(...(await discoverWorkflowFiles(join(projectRulesPath, 'workflows'), 'project')));

    return skills;
  },
};

export default clineDiscovery;

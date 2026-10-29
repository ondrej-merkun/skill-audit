import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import { basename, join } from 'node:path';
import { isRegularFile, readDirFollowingLinks } from '../fs-walk.js';
import type { AgentDiscovery, DiscoverSkillsOptions, Skill } from '../types.js';
import { discoverAgentConfigFiles } from './agent-config.js';
import { discoverSharedAgentSkills } from './shared-agent-skills.js';
import { computeTreeSha256 } from './tree-hash.js';

const AGENT_ID = 'cursor';

function getHomeDir(): string {
  return process.env.HOME ?? process.env.USERPROFILE ?? os.homedir();
}

// SKILL_AUDIT_CWD lets tests inject a fake working directory without process.chdir(),
// which is not supported in vitest worker threads.
function getCwd(): string {
  return process.env.SKILL_AUDIT_CWD ?? process.cwd();
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

type McpServersShape = Record<string, unknown>;

async function discoverMcpJson(mcpJsonPath: string, scope: Skill['scope']): Promise<Skill[]> {
  if (!(await isRegularFile(mcpJsonPath))) return [];

  let raw: string;
  try {
    raw = await readFile(mcpJsonPath, 'utf8');
  } catch {
    return [];
  }

  let parsed: { mcpServers?: McpServersShape };
  try {
    parsed = JSON.parse(raw) as { mcpServers?: McpServersShape };
  } catch {
    return [];
  }

  return Object.keys(parsed.mcpServers ?? {}).map((name) => ({
    id: makeId(`${mcpJsonPath}:${name}`),
    agentId: AGENT_ID,
    name,
    path: mcpJsonPath,
    manifestPath: mcpJsonPath,
    format: 'mcp-server' as const,
    scope,
    treeSha256: '',
  }));
}

async function discoverRulesDir(dir: string, scope: Skill['scope']): Promise<Skill[]> {
  const mdcFiles = (await readDirFollowingLinks(dir)).filter(
    (e) => e.kind === 'file' && e.name.endsWith('.mdc')
  );
  return Promise.all(
    mdcFiles.map(async (e) => {
      const filePath = join(dir, e.name);
      return {
        id: makeId(filePath),
        agentId: AGENT_ID,
        name: basename(filePath, '.mdc'),
        path: filePath,
        manifestPath: filePath,
        format: 'rules-md' as const,
        scope,
        treeSha256: await computeTreeSha256(filePath),
      };
    })
  );
}

async function discoverLegacyCursorRules(filePath: string): Promise<Skill[]> {
  if (!(await isRegularFile(filePath))) return [];
  return [
    {
      id: makeId(filePath),
      agentId: AGENT_ID,
      name: '.cursorrules',
      path: filePath,
      manifestPath: filePath,
      format: 'rules-md' as const,
      scope: 'project' as const,
      treeSha256: await computeTreeSha256(filePath),
    },
  ];
}

async function discoverHooksFile(
  dir: string,
  displayDir: string,
  scope: Skill['scope']
): Promise<Skill[]> {
  return discoverAgentConfigFiles({
    agentId: AGENT_ID,
    dir,
    displayDir,
    fileNames: ['hooks.json'],
    scope,
  });
}

const cursorDiscovery: AgentDiscovery = {
  id: AGENT_ID,
  displayName: 'Cursor',

  async isInstalled(): Promise<boolean> {
    return pathExists(join(getHomeDir(), '.cursor'));
  },

  async discoverSkills(_options: DiscoverSkillsOptions = {}): Promise<Skill[]> {
    const home = getHomeDir();
    const cwd = getCwd();
    const skills: Skill[] = [];

    // User-scoped: ~/.cursor/mcp.json
    skills.push(...(await discoverMcpJson(join(home, '.cursor', 'mcp.json'), 'user')));

    // User-scoped: ~/.cursor/rules/*.mdc
    skills.push(...(await discoverRulesDir(join(home, '.cursor', 'rules'), 'user')));

    // Project-scoped: .cursor/mcp.json
    skills.push(...(await discoverMcpJson(join(cwd, '.cursor', 'mcp.json'), 'project')));

    // Project-scoped: .cursor/rules/*.mdc
    skills.push(...(await discoverRulesDir(join(cwd, '.cursor', 'rules'), 'project')));

    // Legacy: .cursorrules in project root
    skills.push(...(await discoverLegacyCursorRules(join(cwd, '.cursorrules'))));

    // Shared: ~/.agents/skills/*/SKILL.md and .agents/skills/*/SKILL.md
    skills.push(...(await discoverSharedAgentSkills(AGENT_ID)));

    // Hooks: ~/.cursor/hooks.json and .cursor/hooks.json
    skills.push(...(await discoverHooksFile(join(home, '.cursor'), '~/.cursor', 'user')));
    skills.push(...(await discoverHooksFile(join(cwd, '.cursor'), '.cursor', 'project')));

    return skills;
  },
};

export default cursorDiscovery;

import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import os from 'node:os';
import { basename, join, relative } from 'node:path';
import type { AgentDiscovery, Skill } from '../types.js';

const AGENT_ID = 'cursor';

function getHomeDir(): string {
  return process.env.HOME ?? process.env.USERPROFILE ?? os.homedir();
}

// SKILLAUDIT_CWD lets tests inject a fake working directory without process.chdir(),
// which is not supported in vitest worker threads.
function getCwd(): string {
  return process.env.SKILLAUDIT_CWD ?? process.cwd();
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

async function computeTreeSha256(p: string): Promise<string> {
  let s: Awaited<ReturnType<typeof stat>>;
  try {
    s = await stat(p);
  } catch {
    return '';
  }

  if (s.isFile()) {
    const content = await readFile(p);
    return createHash('sha256').update(content).digest('hex');
  }

  const entries: Array<{ rel: string; sha: string }> = [];

  async function walk(dir: string): Promise<void> {
    const items = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const item of items) {
      const full = join(dir, item.name);
      if (item.isDirectory()) {
        await walk(full);
      } else if (item.isFile()) {
        const content = await readFile(full);
        entries.push({
          rel: relative(p, full),
          sha: createHash('sha256').update(content).digest('hex'),
        });
      }
    }
  }

  await walk(p);
  entries.sort((a, b) => a.rel.localeCompare(b.rel));
  const combined = entries.map((e) => `${e.rel}:${e.sha}`).join('\n');
  return createHash('sha256').update(combined).digest('hex');
}

type McpServersShape = Record<string, unknown>;

async function discoverMcpJson(mcpJsonPath: string, scope: Skill['scope']): Promise<Skill[]> {
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
  let entries: Awaited<ReturnType<typeof readdir>>;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const mdcFiles = entries.filter((e) => e.isFile() && e.name.endsWith('.mdc'));
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
  if (!(await pathExists(filePath))) return [];
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

const cursorDiscovery: AgentDiscovery = {
  id: AGENT_ID,
  displayName: 'Cursor',

  async isInstalled(): Promise<boolean> {
    return pathExists(join(getHomeDir(), '.cursor'));
  },

  async discoverSkills(): Promise<Skill[]> {
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

    return skills;
  },
};

export default cursorDiscovery;

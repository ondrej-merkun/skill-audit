import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import os from 'node:os';
import { basename, join, relative } from 'node:path';
import type { AgentDiscovery, Skill } from '../types.js';

const AGENT_ID = 'claude-code';

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

async function listSubdirs(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => join(dir, e.name));
  } catch {
    return [];
  }
}

async function listFiles(dir: string, ext: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isFile() && e.name.endsWith(ext)).map((e) => join(dir, e.name));
  } catch {
    return [];
  }
}

// Minimal treeSha256 — the shared helper in task 2.6 will replace direct calls.
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

  // Directory: collect all files recursively, stable-sort by relative path.
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

async function skillFromDir(
  dirPath: string,
  format: Skill['format'],
  scope: Skill['scope'],
  manifestFile: string | null
): Promise<Skill> {
  return {
    id: makeId(dirPath),
    agentId: AGENT_ID,
    name: basename(dirPath),
    path: dirPath,
    manifestPath: manifestFile ? join(dirPath, manifestFile) : null,
    format,
    scope,
    treeSha256: await computeTreeSha256(dirPath),
  };
}

async function skillFromFile(
  filePath: string,
  format: Skill['format'],
  scope: Skill['scope']
): Promise<Skill> {
  return {
    id: makeId(filePath),
    agentId: AGENT_ID,
    name: basename(filePath).replace(/\.[^.]+$/, ''),
    path: filePath,
    manifestPath: filePath,
    format,
    scope,
    treeSha256: await computeTreeSha256(filePath),
  };
}

async function discoverSkillDirs(dir: string, scope: Skill['scope']): Promise<Skill[]> {
  const subdirs = await listSubdirs(dir);
  return Promise.all(subdirs.map((d) => skillFromDir(d, 'SKILL.md', scope, 'SKILL.md')));
}

async function discoverPluginDirs(dir: string, scope: Skill['scope']): Promise<Skill[]> {
  const subdirs = await listSubdirs(dir);
  return Promise.all(subdirs.map((d) => skillFromDir(d, 'plugin.json', scope, 'plugin.json')));
}

async function discoverCommandFiles(dir: string, scope: Skill['scope']): Promise<Skill[]> {
  const files = await listFiles(dir, '.md');
  return Promise.all(files.map((f) => skillFromFile(f, 'SKILL.md', scope)));
}

async function discoverAgentDirs(dir: string, scope: Skill['scope']): Promise<Skill[]> {
  const subdirs = await listSubdirs(dir);
  return Promise.all(subdirs.map((d) => skillFromDir(d, 'agents-md', scope, null)));
}

type McpServersShape = Record<string, unknown>;
type ClaudeJson = {
  mcpServers?: McpServersShape;
  projects?: Record<string, { mcpServers?: McpServersShape }>;
};

async function discoverMcpFromClaudeJson(jsonPath: string): Promise<Skill[]> {
  let raw: string;
  try {
    raw = await readFile(jsonPath, 'utf8');
  } catch {
    return [];
  }

  let parsed: ClaudeJson;
  try {
    parsed = JSON.parse(raw) as ClaudeJson;
  } catch {
    return [];
  }

  const skills: Skill[] = [];

  for (const name of Object.keys(parsed.mcpServers ?? {})) {
    skills.push({
      id: makeId(`${jsonPath}:${name}`),
      agentId: AGENT_ID,
      name,
      path: jsonPath,
      manifestPath: jsonPath,
      format: 'mcp-server',
      scope: 'user',
      treeSha256: '',
    });
  }

  // Project-specific MCP servers are "managed" — global file, project-scoped config.
  for (const [projectPath, projectCfg] of Object.entries(parsed.projects ?? {})) {
    for (const name of Object.keys(projectCfg.mcpServers ?? {})) {
      skills.push({
        id: makeId(`${jsonPath}:${projectPath}:${name}`),
        agentId: AGENT_ID,
        name,
        path: jsonPath,
        manifestPath: jsonPath,
        format: 'mcp-server',
        scope: 'managed',
        treeSha256: '',
      });
    }
  }

  return skills;
}

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

const claudeCodeDiscovery: AgentDiscovery = {
  id: AGENT_ID,
  displayName: 'Claude Code',

  async isInstalled(): Promise<boolean> {
    return pathExists(join(getHomeDir(), '.claude'));
  },

  async discoverSkills(): Promise<Skill[]> {
    const home = getHomeDir();
    const cwd = getCwd();
    const skills: Skill[] = [];

    // User-scoped locations under ~/.claude/
    const userBase = join(home, '.claude');
    skills.push(...(await discoverSkillDirs(join(userBase, 'skills'), 'user')));
    skills.push(...(await discoverPluginDirs(join(userBase, 'plugins'), 'user')));
    skills.push(...(await discoverCommandFiles(join(userBase, 'commands'), 'user')));
    skills.push(...(await discoverAgentDirs(join(userBase, 'agents'), 'user')));

    // User-scoped MCP servers from ~/.claude.json
    skills.push(...(await discoverMcpFromClaudeJson(join(home, '.claude.json'))));

    // Project-scoped: .claude/ subtree in cwd
    const projectClaudeDir = join(cwd, '.claude');
    if (await pathExists(projectClaudeDir)) {
      skills.push(...(await discoverSkillDirs(join(projectClaudeDir, 'skills'), 'project')));
      skills.push(...(await discoverPluginDirs(join(projectClaudeDir, 'plugins'), 'project')));
      skills.push(...(await discoverCommandFiles(join(projectClaudeDir, 'commands'), 'project')));
      skills.push(...(await discoverAgentDirs(join(projectClaudeDir, 'agents'), 'project')));
    }

    // Project-scoped: .mcp.json
    skills.push(...(await discoverMcpJson(join(cwd, '.mcp.json'), 'project')));

    // Project-scoped: .claude-plugin/plugin.json
    const claudePluginDir = join(cwd, '.claude-plugin');
    const claudePluginManifest = join(claudePluginDir, 'plugin.json');
    if (await pathExists(claudePluginManifest)) {
      skills.push({
        id: makeId(claudePluginDir),
        agentId: AGENT_ID,
        name: basename(cwd),
        path: claudePluginDir,
        manifestPath: claudePluginManifest,
        format: 'plugin.json',
        scope: 'project',
        treeSha256: await computeTreeSha256(claudePluginDir),
      });
    }

    return skills;
  },
};

export default claudeCodeDiscovery;

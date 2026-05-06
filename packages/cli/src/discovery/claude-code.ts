import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import os from 'node:os';
import { basename, dirname, join, relative } from 'node:path';
import type { AgentDiscovery, DiscoverSkillsOptions, Skill } from '../types.js';
import { shouldSkipMarketplacePath, withInstallState } from './marketplace.js';
import { fallbackSkillNameFromDirectory } from './names.js';
import { computeTreeSha256 } from './tree-hash.js';

const AGENT_ID = 'claude-code';

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

async function skillFromDir(
  dirPath: string,
  format: Skill['format'],
  scope: Skill['scope'],
  manifestFile: string | null,
  metadata?: Skill['metadata']
): Promise<Skill> {
  return {
    id: makeId(dirPath),
    agentId: AGENT_ID,
    name: fallbackSkillNameFromDirectory(dirPath),
    path: dirPath,
    manifestPath: manifestFile ? join(dirPath, manifestFile) : null,
    format,
    scope,
    treeSha256: await computeTreeSha256(dirPath),
    ...(metadata === undefined ? {} : { metadata }),
  };
}

async function skillFromFile(
  filePath: string,
  format: Skill['format'],
  scope: Skill['scope'],
  metadata?: Skill['metadata']
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
    ...(metadata === undefined ? {} : { metadata }),
  };
}

async function walkFiles(root: string, options: DiscoverSkillsOptions = {}): Promise<string[]> {
  const files: string[] = [];

  async function walk(dir: string): Promise<void> {
    let entries: Array<{ isDirectory(): boolean; isFile(): boolean; name: string }>;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (shouldSkipMarketplacePath(fullPath, options.includeMarketplaces)) continue;
        await walk(fullPath);
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }

  await walk(root);
  files.sort((a, b) => a.localeCompare(b));
  return files;
}

function pathSegments(root: string, filePath: string): string[] {
  return relative(root, filePath)
    .split(/[\\/]+/)
    .filter(Boolean);
}

async function discoverSkillDirs(
  dir: string,
  scope: Skill['scope'],
  options: DiscoverSkillsOptions = {}
): Promise<Skill[]> {
  const files = await walkFiles(dir, options);
  const manifests = files.filter((file) => basename(file) === 'SKILL.md');
  return Promise.all(
    manifests.map(async (manifest) =>
      withInstallState(await skillFromDir(dirname(manifest), 'SKILL.md', scope, 'SKILL.md'))
    )
  );
}

async function discoverPluginTree(
  dir: string,
  scope: Skill['scope'],
  options: DiscoverSkillsOptions = {},
  metadata?: Skill['metadata']
): Promise<Skill[]> {
  const files = await walkFiles(dir, options);
  const skills: Skill[] = [];

  for (const file of files) {
    const name = basename(file);
    const segments = pathSegments(dir, file);

    if (name === 'SKILL.md') {
      skills.push(
        withInstallState(await skillFromDir(dirname(file), 'SKILL.md', scope, 'SKILL.md', metadata))
      );
    } else if (name.endsWith('.md') && segments.includes('commands')) {
      skills.push(withInstallState(await skillFromFile(file, 'SKILL.md', scope, metadata)));
    } else if (name.endsWith('.md') && segments.includes('agents')) {
      skills.push(withInstallState(await skillFromFile(file, 'agents-md', scope, metadata)));
    }
  }

  return skills;
}

async function readPluginManifestName(pluginDir: string): Promise<string | null> {
  let raw: string;
  try {
    raw = await readFile(join(pluginDir, 'plugin.json'), 'utf-8');
  } catch {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as { name?: unknown };
    return typeof parsed.name === 'string' && parsed.name.trim().length > 0
      ? parsed.name.trim()
      : null;
  } catch {
    return null;
  }
}

function sourcePluginMetadata(pluginName: string | null): Skill['metadata'] | undefined {
  return pluginName === null ? undefined : { sourcePluginName: pluginName };
}

async function discoverCommandFiles(
  dir: string,
  scope: Skill['scope'],
  options: DiscoverSkillsOptions = {}
): Promise<Skill[]> {
  const files = (await walkFiles(dir, options)).filter((file) => file.endsWith('.md'));
  return Promise.all(files.map((f) => skillFromFile(f, 'SKILL.md', scope)));
}

async function discoverAgentEntries(
  dir: string,
  scope: Skill['scope'],
  options: DiscoverSkillsOptions = {}
): Promise<Skill[]> {
  const files = (await walkFiles(dir, options)).filter((file) => file.endsWith('.md'));
  return Promise.all(
    files.map((file) => {
      if (basename(file) === 'AGENTS.md') {
        return skillFromDir(dirname(file), 'agents-md', scope, 'AGENTS.md');
      }
      return skillFromFile(file, 'agents-md', scope);
    })
  );
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

  async discoverSkills(options: DiscoverSkillsOptions = {}): Promise<Skill[]> {
    const home = getHomeDir();
    const cwd = getCwd();
    const skills: Skill[] = [];

    // User-scoped locations under ~/.claude/
    const userBase = join(home, '.claude');
    skills.push(...(await discoverSkillDirs(join(userBase, 'skills'), 'user', options)));
    skills.push(...(await discoverPluginTree(join(userBase, 'plugins'), 'user', options)));
    skills.push(...(await discoverCommandFiles(join(userBase, 'commands'), 'user', options)));
    skills.push(...(await discoverAgentEntries(join(userBase, 'agents'), 'user', options)));

    // User-scoped MCP servers from ~/.claude.json
    skills.push(...(await discoverMcpFromClaudeJson(join(home, '.claude.json'))));

    // Project-scoped: .claude/ subtree in cwd
    const projectClaudeDir = join(cwd, '.claude');
    if (await pathExists(projectClaudeDir)) {
      skills.push(
        ...(await discoverSkillDirs(join(projectClaudeDir, 'skills'), 'project', options))
      );
      skills.push(
        ...(await discoverPluginTree(join(projectClaudeDir, 'plugins'), 'project', options))
      );
      skills.push(
        ...(await discoverCommandFiles(join(projectClaudeDir, 'commands'), 'project', options))
      );
      skills.push(
        ...(await discoverAgentEntries(join(projectClaudeDir, 'agents'), 'project', options))
      );
    }

    // Project-scoped: .mcp.json
    skills.push(...(await discoverMcpJson(join(cwd, '.mcp.json'), 'project')));

    // Project-scoped: .claude-plugin/plugin.json
    const claudePluginDir = join(cwd, '.claude-plugin');
    skills.push(
      ...(await discoverPluginTree(
        claudePluginDir,
        'project',
        options,
        sourcePluginMetadata(await readPluginManifestName(claudePluginDir))
      ))
    );

    return skills;
  },
};

export default claudeCodeDiscovery;

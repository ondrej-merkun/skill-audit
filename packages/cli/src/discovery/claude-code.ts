import { createHash } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import os from 'node:os';
import { basename, dirname, join, relative } from 'node:path';
import { enterDirOnce, isRegularFile, readDirFollowingLinks } from '../fs-walk.js';
import type { AgentDiscovery, DiscoverSkillsOptions, Skill } from '../types.js';
import {
  discoverAgentConfigFiles,
  type HookScriptRoot,
  mcpServerScanMetadata,
} from './agent-config.js';
import { ancestorDirs } from './agents-md-sweep.js';
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

// Claude Code moves the synced plugins that it removes to `~/.claude/plugins/.trash` and never
// loads them again. Only that exact dir is skipped: a plugin manifest can load skills or hooks
// from a nested `plugins/.trash` dir, so a path-segment match would hide a loaded payload.
const PLUGIN_TRASH_DIR_NAME = '.trash';

// Instruction files that Claude Code loads from the working directory and every dir above it.
// The cross-agent sweep owns the root CLAUDE.md and AGENTS.md.
const PROJECT_MEMORY_FILES = [
  join('.claude', 'CLAUDE.md'),
  join('.claude', 'AGENTS.md'),
  'CLAUDE.local.md',
];

function claudePluginsDir(): string {
  return join(getHomeDir(), '.claude', 'plugins');
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
  const visitedRealDirs = new Set<string>();
  const realPluginsDir = await realpath(claudePluginsDir()).catch(() => undefined);

  async function walk(dir: string): Promise<void> {
    if (!(await enterDirOnce(visitedRealDirs, dir))) return;

    for (const entry of await readDirFollowingLinks(dir)) {
      const fullPath = join(dir, entry.name);
      if (entry.kind === 'dir') {
        if (shouldSkipMarketplacePath(fullPath, options.includeMarketplaces)) continue;
        if (await isPluginTrashDir(dir, entry.name, realPluginsDir)) continue;
        await walk(fullPath);
      } else {
        files.push(fullPath);
      }
    }
  }

  await walk(root);
  files.sort((a, b) => a.localeCompare(b));
  return files;
}

// Compares real paths: a run from home through another name for it, such as a symlink, makes
// the project walk reach `~/.claude/plugins` as `<cwd>/.claude/plugins`. Only `.trash` entries
// are resolved, so the walk does not pay one realpath call per dir.
async function isPluginTrashDir(
  parentDir: string,
  entryName: string,
  realPluginsDir: string | undefined
): Promise<boolean> {
  if (entryName !== PLUGIN_TRASH_DIR_NAME || realPluginsDir === undefined) return false;

  return (await realpath(parentDir).catch(() => undefined)) === realPluginsDir;
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
  const manifestRoots = new Set(
    files.filter(isPluginManifest).map((file) => dirname(dirname(file)))
  );
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
    } else if (
      name === 'hooks.json' &&
      basename(dirname(file)) === 'hooks' &&
      isPluginRootComponent(dirname(dirname(file)), manifestRoots)
    ) {
      skills.push(...(await discoverPluginHooks(file, scope, metadata)).map(withInstallState));
    } else if (name === '.mcp.json' && isPluginRootComponent(dirname(file), manifestRoots)) {
      skills.push(...(await discoverMcpJson(file, scope)).map(withInstallState));
    }
  }

  return skills;
}

/** Emits a plugin's hooks/hooks.json and the plugin scripts that its hooks run. */
async function discoverPluginHooks(
  hooksFile: string,
  scope: Skill['scope'],
  metadata?: Skill['metadata']
): Promise<Skill[]> {
  // Name hook files after their plugin: every plugin uses hooks/hooks.json.
  const pluginRoot = dirname(dirname(hooksFile));
  const pluginName = fallbackSkillNameFromDirectory(pluginRoot);

  return discoverAgentConfigFiles({
    agentId: AGENT_ID,
    dir: dirname(hooksFile),
    displayDir: `${pluginName}/hooks`,
    fileNames: [basename(hooksFile)],
    scope,
    ...(metadata === undefined ? {} : { metadata }),
    scriptRoot: {
      dir: pluginRoot,
      displayDir: pluginName,
      placeholder: 'CLAUDE_PLUGIN_ROOT',
      isWorkingDir: false,
    },
  });
}

function isPluginManifest(file: string): boolean {
  return basename(file) === 'plugin.json' && basename(dirname(file)) === '.claude-plugin';
}

/**
 * Claude Code loads hooks/hooks.json and .mcp.json only at a plugin root. A copy deeper in a
 * plugin that has a manifest, such as a template for another agent, never runs. A plugin
 * without a manifest has no known root, so its files count.
 */
function isPluginRootComponent(componentDir: string, manifestRoots: Set<string>): boolean {
  for (let dir = componentDir; ; dir = dirname(dir)) {
    if (manifestRoots.has(dir)) return dir === componentDir;
    if (dirname(dir) === dir) return true;
  }
}

async function readPluginManifestName(pluginDir: string): Promise<string | null> {
  const manifestPath = join(pluginDir, 'plugin.json');
  if (!(await isRegularFile(manifestPath))) return null;

  let raw: string;
  try {
    raw = await readFile(manifestPath, 'utf-8');
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

/** Emits each `.md` file below dir, at any depth: commands and rules. */
async function discoverMarkdownFiles(
  dir: string,
  format: Skill['format'],
  scope: Skill['scope'],
  options: DiscoverSkillsOptions = {}
): Promise<Skill[]> {
  const files = (await walkFiles(dir, options)).filter((file) => file.endsWith('.md'));
  return Promise.all(files.map((f) => skillFromFile(f, format, scope)));
}

/** Emits a memory file such as CLAUDE.md under its file name, as the cross-agent sweep does. */
async function discoverMemoryFile(filePath: string, scope: Skill['scope']): Promise<Skill[]> {
  if (!(await isRegularFile(filePath))) return [];

  return [{ ...(await skillFromFile(filePath, 'agents-md', scope)), name: basename(filePath) }];
}

/**
 * Claude Code loads memory files and `.claude/rules/` from the working directory and every dir
 * above it, also above the repository root. In home, these paths are the user memory files that
 * the user scope also emits; dedupe collapses the two rows.
 */
async function discoverProjectMemory(
  cwd: string,
  options: DiscoverSkillsOptions = {}
): Promise<Skill[]> {
  const skills: Skill[] = [];

  for (const dir of ancestorDirs(cwd)) {
    for (const file of PROJECT_MEMORY_FILES) {
      skills.push(...(await discoverMemoryFile(join(dir, file), 'project')));
    }
    skills.push(
      ...(await discoverMarkdownFiles(
        join(dir, '.claude', 'rules'),
        'agents-md',
        'project',
        options
      ))
    );
  }

  return skills;
}

/**
 * Claude Code also loads project skills, commands, and agents from each parent of the working
 * directory up to the git root. A linked worktree marks its root with a `.git` file. The walk
 * stops below home, because `~/.claude/` holds the user files.
 */
async function parentProjectClaudeDirs(cwd: string, home: string): Promise<string[]> {
  const dirs: string[] = [];
  let dir = cwd;

  while (dir !== home && !(await pathExists(join(dir, '.git')))) {
    const parent = dirname(dir);
    if (parent === dir || parent === home) break;

    dirs.push(join(parent, '.claude'));
    dir = parent;
  }

  return dirs;
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
  if (!(await isRegularFile(jsonPath))) return [];

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

  for (const [name, definition] of Object.entries(parsed.mcpServers ?? {})) {
    skills.push({
      id: makeId(`${jsonPath}:${name}`),
      agentId: AGENT_ID,
      name,
      path: jsonPath,
      manifestPath: jsonPath,
      format: 'mcp-server',
      scope: 'user',
      treeSha256: '',
      metadata: mcpServerScanMetadata(name, definition),
    });
  }

  // Project-specific MCP servers are "managed" — global file, project-scoped config.
  for (const [projectPath, projectCfg] of Object.entries(parsed.projects ?? {})) {
    for (const [name, definition] of Object.entries(projectCfg.mcpServers ?? {})) {
      skills.push({
        id: makeId(`${jsonPath}:${projectPath}:${name}`),
        agentId: AGENT_ID,
        name,
        path: jsonPath,
        manifestPath: jsonPath,
        format: 'mcp-server',
        scope: 'managed',
        treeSha256: '',
        metadata: mcpServerScanMetadata(name, definition),
      });
    }
  }

  return skills;
}

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

  return Object.entries(parsed.mcpServers ?? {}).map(([name, definition]) => ({
    id: makeId(`${mcpJsonPath}:${name}`),
    agentId: AGENT_ID,
    name,
    path: mcpJsonPath,
    manifestPath: mcpJsonPath,
    format: 'mcp-server' as const,
    scope,
    treeSha256: '',
    metadata: mcpServerScanMetadata(name, definition),
  }));
}

/** Claude Code runs hooks and helper commands from these settings files. */
async function discoverSettingsFiles(
  dir: string,
  displayDir: string,
  fileNames: string[],
  scope: Skill['scope'],
  scriptRoot?: HookScriptRoot
): Promise<Skill[]> {
  return discoverAgentConfigFiles({
    agentId: AGENT_ID,
    dir,
    displayDir,
    fileNames,
    scope,
    ...(scriptRoot === undefined ? {} : { scriptRoot }),
  });
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
    skills.push(
      ...(await discoverMarkdownFiles(join(userBase, 'commands'), 'SKILL.md', 'user', options))
    );
    skills.push(...(await discoverAgentEntries(join(userBase, 'agents'), 'user', options)));
    skills.push(...(await discoverSettingsFiles(userBase, '~/.claude', ['settings.json'], 'user')));
    skills.push(...(await discoverMemoryFile(join(userBase, 'CLAUDE.md'), 'user')));
    skills.push(
      ...(await discoverMarkdownFiles(join(userBase, 'rules'), 'agents-md', 'user', options))
    );

    // User-scoped MCP servers from ~/.claude.json
    skills.push(...(await discoverMcpFromClaudeJson(join(home, '.claude.json'))));

    // Project-scoped: .claude/ subtree in cwd
    const projectClaudeDir = join(cwd, '.claude');
    if (await pathExists(projectClaudeDir)) {
      skills.push(
        ...(await discoverSettingsFiles(
          projectClaudeDir,
          '.claude',
          ['settings.json', 'settings.local.json'],
          'project',
          { dir: cwd, displayDir: '', placeholder: 'CLAUDE_PROJECT_DIR', isWorkingDir: true }
        ))
      );
      skills.push(
        ...(await discoverSkillDirs(join(projectClaudeDir, 'skills'), 'project', options))
      );
      skills.push(
        ...(await discoverPluginTree(join(projectClaudeDir, 'plugins'), 'project', options))
      );
      skills.push(
        ...(await discoverMarkdownFiles(
          join(projectClaudeDir, 'commands'),
          'SKILL.md',
          'project',
          options
        ))
      );
      skills.push(
        ...(await discoverAgentEntries(join(projectClaudeDir, 'agents'), 'project', options))
      );
    }

    // Project-scoped: skills, commands, and agents in parent .claude/ dirs. Settings, plugins,
    // and .mcp.json load from the working directory only.
    for (const claudeDir of await parentProjectClaudeDirs(cwd, home)) {
      skills.push(...(await discoverSkillDirs(join(claudeDir, 'skills'), 'project', options)));
      skills.push(
        ...(await discoverMarkdownFiles(
          join(claudeDir, 'commands'),
          'SKILL.md',
          'project',
          options
        ))
      );
      skills.push(...(await discoverAgentEntries(join(claudeDir, 'agents'), 'project', options)));
    }

    // Project-scoped: memory files and rules in the working directory and every parent
    skills.push(...(await discoverProjectMemory(cwd, options)));

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

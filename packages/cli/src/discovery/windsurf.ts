import { createHash } from 'node:crypto';
import { lstat, readdir, stat } from 'node:fs/promises';
import os from 'node:os';
import { basename, dirname, join } from 'node:path';
import type { AgentDiscovery, DiscoverSkillsOptions, Skill } from '../types.js';
import { shouldSkipMarketplacePath, withInstallState } from './marketplace.js';
import { computeTreeSha256 } from './tree-hash.js';

const AGENT_ID = 'windsurf';
const SKIPPED_DESCENDANT_DIRS = new Set([
  '.git',
  '.hg',
  '.svn',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
]);
const NESTED_RULE_PROBE_MAX_DEPTH = 4;

function getHomeDir(): string {
  return process.env.HOME ?? process.env.USERPROFILE ?? os.homedir();
}

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

async function isDirectory(p: string): Promise<boolean> {
  try {
    return (await lstat(p)).isDirectory();
  } catch {
    return false;
  }
}

async function isRegularFile(p: string): Promise<boolean> {
  try {
    return (await lstat(p)).isFile();
  } catch {
    return false;
  }
}

async function skillFromRuleFile(
  filePath: string,
  name: string,
  scope: Skill['scope']
): Promise<Skill> {
  return withInstallState({
    id: makeId(filePath),
    agentId: AGENT_ID,
    name,
    path: filePath,
    manifestPath: filePath,
    format: 'rules-md',
    scope,
    treeSha256: await computeTreeSha256(filePath),
  });
}

async function discoverRuleFile(
  filePath: string,
  name: string,
  scope: Skill['scope']
): Promise<Skill[]> {
  if (!(await isRegularFile(filePath))) return [];
  return [await skillFromRuleFile(filePath, name, scope)];
}

async function discoverRulesDir(
  dir: string,
  scope: Skill['scope'],
  options: DiscoverSkillsOptions = {}
): Promise<Skill[]> {
  if (shouldSkipMarketplacePath(dir, options.includeMarketplaces)) return [];

  let entries: Array<{ isFile(): boolean; name: string }>;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const ruleFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .sort((a, b) => a.name.localeCompare(b.name));

  return Promise.all(
    ruleFiles.map((entry) =>
      skillFromRuleFile(join(dir, entry.name), basename(entry.name, '.md'), scope)
    )
  );
}

async function ancestorDirsToGitRoot(dir: string): Promise<string[]> {
  const dirs: string[] = [];
  let current = dir;

  while (true) {
    dirs.push(current);
    if (await isWorkspaceGitRoot(current)) break;

    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return dirs;
}

async function isWorkspaceGitRoot(dir: string): Promise<boolean> {
  const gitPath = join(dir, '.git');
  if (await isRegularFile(gitPath)) return true;
  return isRegularFile(join(gitPath, 'HEAD'));
}

async function gitRootFromAncestors(ancestorDirs: string[]): Promise<string | undefined> {
  for (const dir of ancestorDirs) {
    if (await isWorkspaceGitRoot(dir)) return dir;
  }

  return undefined;
}

async function descendantWindsurfRulesDirs(
  root: string,
  options: DiscoverSkillsOptions = {}
): Promise<string[]> {
  const rulesDirs: string[] = [];

  async function walk(dir: string): Promise<void> {
    let entries: Array<{ isDirectory(): boolean; name: string }>;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (SKIPPED_DESCENDANT_DIRS.has(entry.name)) continue;

      const fullPath = join(dir, entry.name);
      if (shouldSkipMarketplacePath(fullPath, options.includeMarketplaces)) continue;

      if (entry.name === '.windsurf') {
        const rulesDir = join(fullPath, 'rules');
        if (await isDirectory(rulesDir)) rulesDirs.push(rulesDir);
        continue;
      }

      await walk(fullPath);
    }
  }

  await walk(root);
  return rulesDirs;
}

async function workspaceRulesDirs(
  cwd: string,
  options: DiscoverSkillsOptions = {}
): Promise<string[]> {
  const dirs = new Set<string>();
  const ancestorDirs = await ancestorDirsToGitRoot(cwd);

  for (const dir of ancestorDirs) {
    const rulesDir = join(dir, '.windsurf', 'rules');
    if (await isDirectory(rulesDir)) dirs.add(rulesDir);
  }

  const workspaceRoot = (await gitRootFromAncestors(ancestorDirs)) ?? cwd;
  for (const rulesDir of await descendantWindsurfRulesDirs(workspaceRoot, options)) {
    dirs.add(rulesDir);
  }

  return [...dirs].sort((a, b) => a.localeCompare(b));
}

async function hasNestedWorkspaceRules(root: string): Promise<boolean> {
  for (const rulesDir of await nestedWorkspaceRuleProbeDirs(root)) {
    if (await isDirectory(rulesDir)) return true;
  }

  return false;
}

async function nestedWorkspaceRuleProbeDirs(root: string, depth = 0): Promise<string[]> {
  if (depth >= NESTED_RULE_PROBE_MAX_DEPTH) return [];

  const dirs = new Set<string>();

  let rootEntries: Array<{ isDirectory(): boolean; name: string }>;
  try {
    rootEntries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }

  for (const entry of rootEntries) {
    if (!entry.isDirectory()) continue;
    if (SKIPPED_DESCENDANT_DIRS.has(entry.name)) continue;

    const child = join(root, entry.name);
    dirs.add(join(child, '.windsurf', 'rules'));

    for (const rulesDir of await nestedWorkspaceRuleProbeDirs(child, depth + 1)) {
      dirs.add(rulesDir);
    }
  }

  return [...dirs];
}

async function hasWorkspaceRules(cwd: string): Promise<boolean> {
  if (await pathExists(join(cwd, '.windsurfrules'))) return true;

  const ancestorDirs = await ancestorDirsToGitRoot(cwd);
  for (const dir of ancestorDirs) {
    if (await isDirectory(join(dir, '.windsurf', 'rules'))) return true;
  }

  const workspaceRoot = (await gitRootFromAncestors(ancestorDirs)) ?? cwd;
  if (await hasNestedWorkspaceRules(workspaceRoot)) return true;

  return false;
}

const windsurfDiscovery: AgentDiscovery = {
  id: AGENT_ID,
  displayName: 'Windsurf',

  async isInstalled(): Promise<boolean> {
    const home = getHomeDir();
    const cwd = getCwd();
    return (await pathExists(join(home, '.codeium', 'windsurf'))) || (await hasWorkspaceRules(cwd));
  },

  async discoverSkills(options: DiscoverSkillsOptions = {}): Promise<Skill[]> {
    const home = getHomeDir();
    const cwd = getCwd();
    const skills: Skill[] = [];

    skills.push(
      ...(await discoverRuleFile(
        join(home, '.codeium', 'windsurf', 'memories', 'global_rules.md'),
        'global_rules',
        'user'
      ))
    );

    for (const rulesDir of await workspaceRulesDirs(cwd, options)) {
      skills.push(...(await discoverRulesDir(rulesDir, 'project', options)));
    }

    skills.push(
      ...(await discoverRuleFile(join(cwd, '.windsurfrules'), '.windsurfrules', 'project'))
    );

    return skills;
  },
};

export default windsurfDiscovery;

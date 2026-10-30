import { createHash } from 'node:crypto';
import { stat } from 'node:fs/promises';
import os from 'node:os';
import { basename, join } from 'node:path';
import { enterDirOnce, isRegularFile, readDirFollowingLinks } from '../fs-walk.js';
import type { AgentDiscovery, DiscoverSkillsOptions, Skill } from '../types.js';
import { discoverAgentConfigFiles } from './agent-config.js';
import { shouldSkipMarketplacePath, withInstallState } from './marketplace.js';
import { ancestorDirsToGitRoot, gitRootFromAncestors } from './project-dirs.js';
import { discoverSharedAgentSkills } from './shared-agent-skills.js';
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

// Directories that hold hooks.json: IDE and JetBrains plugin user hooks, then workspace
// hooks and their legacy fallback. User dirs are under home, project dirs under cwd.
const HOOK_DIRS: Array<{ dir: string; scope: Skill['scope'] }> = [
  { dir: '.codeium/windsurf', scope: 'user' },
  { dir: '.codeium', scope: 'user' },
  { dir: '.devin', scope: 'project' },
  { dir: '.windsurf', scope: 'project' },
];

function getHomeDir(): string {
  return process.env.HOME ?? process.env.USERPROFILE ?? os.homedir();
}

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

async function isDirectory(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isDirectory();
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

  const ruleFiles = (await readDirFollowingLinks(dir))
    .filter((entry) => entry.kind === 'file' && entry.name.endsWith('.md'))
    .sort((a, b) => a.name.localeCompare(b.name));

  return Promise.all(
    ruleFiles.map((entry) =>
      skillFromRuleFile(join(dir, entry.name), basename(entry.name, '.md'), scope)
    )
  );
}

async function descendantWindsurfRulesDirs(
  root: string,
  options: DiscoverSkillsOptions = {}
): Promise<string[]> {
  const rulesDirs: string[] = [];
  const visitedRealDirs = new Set<string>();

  async function walk(dir: string): Promise<void> {
    if (!(await enterDirOnce(visitedRealDirs, dir))) return;

    for (const entry of await readDirFollowingLinks(dir)) {
      if (entry.kind !== 'dir') continue;
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

  for (const entry of await readDirFollowingLinks(root)) {
    if (entry.kind !== 'dir') continue;
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

    skills.push(...(await discoverSharedAgentSkills(AGENT_ID)));

    for (const hooks of HOOK_DIRS) {
      const isUserDir = hooks.scope === 'user';
      skills.push(
        ...(await discoverAgentConfigFiles({
          agentId: AGENT_ID,
          dir: join(isUserDir ? home : cwd, hooks.dir),
          displayDir: isUserDir ? `~/${hooks.dir}` : hooks.dir,
          fileNames: ['hooks.json'],
          scope: hooks.scope,
        }))
      );
    }

    return skills;
  },
};

export default windsurfDiscovery;

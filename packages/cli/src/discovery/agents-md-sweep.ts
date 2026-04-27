import { createHash } from 'node:crypto';
import { stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { AgentDiscovery, DiscoverSkillsOptions, Skill } from '../types.js';
import { shouldSkipMarketplacePath, withInstallState } from './marketplace.js';
import { computeTreeSha256 } from './tree-hash.js';

const AGENT_ID = 'cross-agent';

const TARGET_FILENAMES = new Set([
  'AGENTS.md',
  'AGENTS.override.md',
  'CLAUDE.md',
  'GEMINI.md',
  '.cursorrules',
  '.windsurfrules',
  'CONVENTIONS.md',
]);

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

// Returns the chain of directories from dir up to the filesystem root, inclusive.
function ancestorDirs(dir: string): string[] {
  const dirs: string[] = [];
  let current = dir;
  while (true) {
    dirs.push(current);
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return dirs;
}

const agentsMdSweepDiscovery: AgentDiscovery = {
  id: AGENT_ID,
  displayName: 'Cross-agent sweep',

  async isInstalled(): Promise<boolean> {
    return true;
  },

  async discoverSkills(options: DiscoverSkillsOptions = {}): Promise<Skill[]> {
    const cwd = getCwd();
    const skills: Skill[] = [];
    const seen = new Set<string>();

    for (const dir of ancestorDirs(cwd)) {
      for (const filename of TARGET_FILENAMES) {
        const filePath = join(dir, filename);
        if (seen.has(filePath)) continue;
        if (shouldSkipMarketplacePath(filePath, options.includeMarketplaces)) continue;
        if (!(await pathExists(filePath))) continue;
        seen.add(filePath);

        skills.push(
          withInstallState({
            id: makeId(filePath),
            agentId: AGENT_ID,
            name: filename,
            path: filePath,
            manifestPath: filePath,
            format: 'agents-md',
            scope: 'project',
            treeSha256: await computeTreeSha256(filePath),
          })
        );
      }
    }

    return skills;
  },
};

export default agentsMdSweepDiscovery;

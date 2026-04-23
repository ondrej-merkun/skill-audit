import { createHash } from 'node:crypto';
import { readdir, stat } from 'node:fs/promises';
import os from 'node:os';
import { basename, join } from 'node:path';
import type { AgentDiscovery, Skill } from '../types.js';
import { computeTreeSha256 } from './tree-hash.js';

const AGENT_ID = 'copilot';

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

async function discoverSkillsDir(dir: string, scope: Skill['scope']): Promise<Skill[]> {
  let entries: { isDirectory(): boolean; name: string }[];
  try {
    entries = (await readdir(dir, { withFileTypes: true })) as {
      isDirectory(): boolean;
      name: string;
    }[];
  } catch {
    return [];
  }

  const skillDirs = entries.filter((e) => e.isDirectory());
  const results: Skill[] = [];

  for (const entry of skillDirs) {
    const skillDir = join(dir, entry.name);
    const manifestPath = join(skillDir, 'SKILL.md');
    if (!(await pathExists(manifestPath))) continue;
    results.push({
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

  return results;
}

async function discoverSingleFile(
  filePath: string,
  name: string,
  scope: Skill['scope']
): Promise<Skill[]> {
  if (!(await pathExists(filePath))) return [];
  return [
    {
      id: makeId(filePath),
      agentId: AGENT_ID,
      name,
      path: filePath,
      manifestPath: filePath,
      format: 'agents-md',
      scope,
      treeSha256: await computeTreeSha256(filePath),
    },
  ];
}

async function discoverInstructionsDir(dir: string, scope: Skill['scope']): Promise<Skill[]> {
  let entries: { isFile(): boolean; name: string }[];
  try {
    entries = (await readdir(dir, { withFileTypes: true })) as {
      isFile(): boolean;
      name: string;
    }[];
  } catch {
    return [];
  }

  const mdFiles = entries.filter((e) => e.isFile() && e.name.endsWith('.instructions.md'));
  return Promise.all(
    mdFiles.map(async (e) => {
      const filePath = join(dir, e.name);
      return {
        id: makeId(filePath),
        agentId: AGENT_ID,
        name: basename(filePath, '.instructions.md'),
        path: filePath,
        manifestPath: filePath,
        format: 'agents-md' as const,
        scope,
        treeSha256: await computeTreeSha256(filePath),
      };
    })
  );
}

const copilotDiscovery: AgentDiscovery = {
  id: AGENT_ID,
  displayName: 'GitHub Copilot',

  async isInstalled(): Promise<boolean> {
    return pathExists(join(getHomeDir(), '.copilot'));
  },

  async discoverSkills(): Promise<Skill[]> {
    const home = getHomeDir();
    const cwd = getCwd();
    const skills: Skill[] = [];

    // User-scoped: ~/.copilot/skills/*/SKILL.md
    skills.push(...(await discoverSkillsDir(join(home, '.copilot', 'skills'), 'user')));

    // Project-scoped: .github/skills/*/SKILL.md
    skills.push(...(await discoverSkillsDir(join(cwd, '.github', 'skills'), 'project')));

    // Project-scoped: .github/copilot-instructions.md
    skills.push(
      ...(await discoverSingleFile(
        join(cwd, '.github', 'copilot-instructions.md'),
        'copilot-instructions',
        'project'
      ))
    );

    // Project-scoped: .github/instructions/*.instructions.md
    skills.push(
      ...(await discoverInstructionsDir(join(cwd, '.github', 'instructions'), 'project'))
    );

    return skills;
  },
};

export default copilotDiscovery;

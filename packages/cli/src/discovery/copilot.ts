import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import os from 'node:os';
import { basename, join, relative } from 'node:path';
import type { AgentDiscovery, Skill } from '../types.js';

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

async function discoverSkillsDir(dir: string, scope: Skill['scope']): Promise<Skill[]> {
  let entries: Awaited<ReturnType<typeof readdir>>;
  try {
    entries = await readdir(dir, { withFileTypes: true });
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
  let entries: Awaited<ReturnType<typeof readdir>>;
  try {
    entries = await readdir(dir, { withFileTypes: true });
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

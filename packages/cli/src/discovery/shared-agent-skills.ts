import { createHash } from 'node:crypto';
import os from 'node:os';
import { join } from 'node:path';
import { enterDirOnce, readDirFollowingLinks } from '../fs-walk.js';
import type { Skill } from '../types.js';
import { withInstallState } from './marketplace.js';
import { fallbackSkillNameFromDirectory } from './names.js';
import { computeTreeSha256 } from './tree-hash.js';

// Cross-agent Agent Skills location. Codex, Cursor, GitHub Copilot, Gemini CLI,
// Windsurf, and Cline read it under the home directory and the project root.
const SHARED_SKILLS_DIR = join('.agents', 'skills');
const SKILL_MANIFEST = 'SKILL.md';
const SKILL_ID_HEX_LENGTH = 16;

/**
 * Discover every SKILL.md directory under `~/.agents/skills` (user scope) and
 * `<cwd>/.agents/skills` (project scope) on behalf of one agent.
 * Each calling agent emits its own rows; discoverAll() collapses identical
 * content into one skill and keeps every owning agent.
 */
export async function discoverSharedAgentSkills(agentId: string): Promise<Skill[]> {
  const userSkillsDir = join(getHomeDir(), SHARED_SKILLS_DIR);
  const projectSkillsDir = join(getCwd(), SHARED_SKILLS_DIR);

  const userSkills = await discoverSkillDirs(agentId, userSkillsDir, 'user');
  const projectSkills = await discoverSkillDirs(agentId, projectSkillsDir, 'project');

  return [...userSkills, ...projectSkills];
}

async function discoverSkillDirs(
  agentId: string,
  skillsDir: string,
  scope: Skill['scope']
): Promise<Skill[]> {
  const skillDirs = await findSkillDirs(skillsDir);
  const skills: Skill[] = [];

  for (const skillDir of skillDirs) {
    skills.push(
      withInstallState({
        id: makeId(agentId, skillDir),
        agentId,
        name: fallbackSkillNameFromDirectory(skillDir),
        path: skillDir,
        manifestPath: join(skillDir, SKILL_MANIFEST),
        format: 'SKILL.md',
        scope,
        treeSha256: await computeTreeSha256(skillDir),
      })
    );
  }

  return skills;
}

/**
 * Lists every directory under root, root included, that holds a SKILL.md.
 * Codex and Cursor load nested skills and Gemini CLI loads a root SKILL.md.
 * The walk has no depth limit and does not skip hidden directories: the rule
 * engine scans each SKILL.md directory as its own root, so a directory that
 * discovery skips is never scanned. Symlinked skill dirs are followed, because
 * skill installers link each shared skill into a store.
 */
async function findSkillDirs(root: string): Promise<string[]> {
  const skillDirs: string[] = [];
  const visitedRealDirs = new Set<string>();

  async function visit(dir: string): Promise<void> {
    if (!(await enterDirOnce(visitedRealDirs, dir))) return;

    const entries = await readDirFollowingLinks(dir);
    const hasManifest = entries.some(
      (entry) => entry.name === SKILL_MANIFEST && entry.kind === 'file'
    );
    if (hasManifest) skillDirs.push(dir);

    for (const entry of entries) {
      if (entry.kind === 'dir') await visit(join(dir, entry.name));
    }
  }

  await visit(root);
  return skillDirs.sort((a, b) => a.localeCompare(b));
}

// Same id scheme as the agent plugins: stable hash of agent id and path.
function makeId(agentId: string, input: string): string {
  return createHash('sha256')
    .update(`${agentId}:${input}`)
    .digest('hex')
    .slice(0, SKILL_ID_HEX_LENGTH);
}

function getHomeDir(): string {
  return process.env.HOME ?? process.env.USERPROFILE ?? os.homedir();
}

// SKILL_AUDIT_CWD lets tests inject a project directory without process.chdir().
function getCwd(): string {
  return process.env.SKILL_AUDIT_CWD ?? process.cwd();
}

import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { enterDirOnce, readDirFollowingLinks } from '../fs-walk.js';
import type { Skill } from '../types.js';
import { addModifiedAt } from './modified-at.js';
import { fallbackSkillNameFromDirectory } from './names.js';
import { computeTreeSha256 } from './tree-hash.js';

// No agent has installed a path target. The JSON contract has no agent id for that, so path
// targets use the agent-neutral id that already exists.
const PATH_AGENT_ID = 'cross-agent';
const SKILL_MANIFEST = 'SKILL.md';
const SKILL_ID_HEX_LENGTH = 16;

/**
 * Lists the scan targets of `skill-audit scan <path>`. A file is one skill. In a directory,
 * each directory at or under the path that holds a SKILL.md is one skill. The path itself is
 * one more skill when it has files outside those skill directories, such as plugin hooks,
 * commands, or MCP configs, so the scan covers every file under the path.
 * Throws for a path that does not exist or that the user cannot read.
 */
export async function discoverPath(inputPath: string): Promise<Skill[]> {
  const root = resolve(inputPath);
  const info = await stat(root).catch(() => undefined);
  if (info === undefined) throw new Error(`path not found: ${inputPath}`);
  if (!info.isFile() && !info.isDirectory()) {
    throw new Error(`not a file or directory: ${inputPath}`);
  }
  // An unreadable target scans as empty, and an empty scan reports PASS.
  await access(root, constants.R_OK);

  const targets = info.isFile()
    ? [{ path: root, manifestPath: root, name: basename(root) }]
    : await findDirTargets(root);
  return addModifiedAt(await Promise.all(targets.map(pathSkill)));
}

async function findDirTargets(root: string): Promise<PathTarget[]> {
  const skillDirs: string[] = [];
  const aliasDirs: string[] = [];
  let hasFilesOutsideSkills = false;
  const visitedRealDirs = new Set<string>();

  // Same walk as the shared Agent Skills discovery: no depth limit, links followed.
  async function visit(dir: string, insideSkill: boolean): Promise<void> {
    if (!(await enterDirOnce(visitedRealDirs, dir))) {
      aliasDirs.push(dir);
      return;
    }

    const entries = await readDirFollowingLinks(dir);
    const isSkill = entries.some((entry) => entry.name === SKILL_MANIFEST && entry.kind === 'file');
    if (isSkill) skillDirs.push(dir);
    if (!insideSkill && !isSkill && entries.some((entry) => entry.kind === 'file')) {
      hasFilesOutsideSkills = true;
    }

    for (const entry of entries) {
      if (entry.kind === 'dir') await visit(join(dir, entry.name), insideSkill || isSkill);
    }
  }

  await visit(root, false);

  const targets: PathTarget[] = skillDirs
    .sort((a, b) => a.localeCompare(b))
    .map((dir) => ({
      path: dir,
      manifestPath: join(dir, SKILL_MANIFEST),
      name: fallbackSkillNameFromDirectory(dir),
    }));
  // The rule engine leaves the skill dirs out of the root's walk, so no file is scanned twice.
  if (hasFilesOutsideSkills) {
    targets.unshift({ path: root, manifestPath: null, name: fallbackSkillNameFromDirectory(root) });
  }

  // A skipped alias reaches a dir that this walk gave to the target it entered first. The root's
  // engine walk does not enter skill dirs, so it can reach a skill's real dir first through such
  // an alias and scan the skill again. The engine skips every path in `alsoInstalledAt`.
  const rootTarget = targets[0];
  if (rootTarget?.path === root && aliasDirs.length > 0) rootTarget.alsoInstalledAt = aliasDirs;
  return targets;
}

async function pathSkill(target: PathTarget): Promise<Skill> {
  return {
    id: createHash('sha256')
      .update(`${PATH_AGENT_ID}:${target.path}`)
      .digest('hex')
      .slice(0, SKILL_ID_HEX_LENGTH),
    agentId: PATH_AGENT_ID,
    name: target.name,
    path: target.path,
    manifestPath: target.manifestPath,
    ...(target.alsoInstalledAt === undefined ? {} : { alsoInstalledAt: target.alsoInstalledAt }),
    format: 'SKILL.md',
    scope: 'project',
    // The user selected the path, so it is reported like an active skill.
    installState: 'installed',
    treeSha256: await computeTreeSha256(target.path),
  };
}

type PathTarget = {
  path: string;
  manifestPath: string | null;
  name: string;
  alsoInstalledAt?: string[];
};

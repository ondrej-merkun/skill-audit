import { dirname, join } from 'node:path';
import { isRegularFile } from '../fs-walk.js';

/**
 * Returns dir and its parents up to the git root, inclusive, nearest first. Without a git
 * root, the walk ends at the filesystem root, as it does in the agents.
 */
export async function ancestorDirsToGitRoot(dir: string): Promise<string[]> {
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

export async function gitRootFromAncestors(ancestorDirs: string[]): Promise<string | undefined> {
  for (const dir of ancestorDirs) {
    if (await isWorkspaceGitRoot(dir)) return dir;
  }

  return undefined;
}

// A worktree or submodule has a `.git` file; a main checkout has a `.git/HEAD`.
async function isWorkspaceGitRoot(dir: string): Promise<boolean> {
  const gitPath = join(dir, '.git');
  if (await isRegularFile(gitPath)) return true;
  return isRegularFile(join(gitPath, 'HEAD'));
}

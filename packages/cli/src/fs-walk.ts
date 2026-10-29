import { type Dirent, realpathSync, statSync } from 'node:fs';
import { readdir, realpath, stat } from 'node:fs/promises';
import { join } from 'node:path';

// Directory-walk helpers that follow symlinks. Agents load symlinked skills
// (`npx skills` and skillshare link ~/.claude/skills/<name> into a shared
// store), so every walker must treat a link exactly like its target.
// ponytail: a link to a huge tree (for example `/`) makes the walk as large as
// that tree; loops are safe, size is not capped.

/**
 * Lists a directory with each symlink resolved to its target kind.
 * Returns [] when the directory cannot be read. Dangling links, link loops,
 * and special files (sockets, FIFOs, devices) are dropped.
 */
export async function readDirFollowingLinks(dir: string): Promise<DirEntry[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const resolved = await Promise.all(
    entries.map(async (entry) => ({ name: entry.name, kind: await entryKind(dir, entry) }))
  );
  return resolved.filter((entry): entry is DirEntry => entry.kind !== null);
}

/** Sync form of the symlink-following kind check, for the rule engine's sync walk. */
export function entryKindSync(dir: string, entry: Dirent): EntryKind | null {
  if (!entry.isSymbolicLink()) return kindOf(entry);
  try {
    return kindOf(statSync(join(dir, entry.name)));
  } catch {
    return null;
  }
}

/**
 * Records that one walk entered `dir`, keyed by its real path. Returns false
 * when the walk already entered that real directory (a loop such as `a -> ..`,
 * or a second link to the same target) or the path cannot be resolved.
 * ponytail: the second link to a shared target is skipped, so that alias path
 * is not reported by the walk.
 */
export async function enterDirOnce(visitedRealDirs: Set<string>, dir: string): Promise<boolean> {
  try {
    return markVisited(visitedRealDirs, await realpath(dir));
  } catch {
    return false;
  }
}

/** Sync form of enterDirOnce, for the rule engine's sync walk. */
export function enterDirOnceSync(visitedRealDirs: Set<string>, dir: string): boolean {
  try {
    return markVisited(visitedRealDirs, realpathSync(dir));
  } catch {
    return false;
  }
}

async function entryKind(dir: string, entry: Dirent): Promise<EntryKind | null> {
  if (!entry.isSymbolicLink()) return kindOf(entry);
  try {
    return kindOf(await stat(join(dir, entry.name)));
  } catch {
    return null;
  }
}

function markVisited(visitedRealDirs: Set<string>, realDir: string): boolean {
  if (visitedRealDirs.has(realDir)) return false;
  visitedRealDirs.add(realDir);
  return true;
}

function kindOf(target: { isDirectory(): boolean; isFile(): boolean }): EntryKind | null {
  if (target.isDirectory()) return 'dir';
  if (target.isFile()) return 'file';
  return null;
}

export type EntryKind = 'dir' | 'file';

export type DirEntry = { name: string; kind: EntryKind };

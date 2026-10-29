import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { enterDirOnce, readDirFollowingLinks } from '../fs-walk.js';

/**
 * Deterministic sha256 over a file or directory tree.
 *
 * File: sha256(file-contents)
 * Directory: sha256 of sorted "rel-path:file-sha256\n" lines
 * Symlinks hash as their target content, so a linked skill and a real copy match.
 *
 * Returns '' if the path does not exist or cannot be read. Unreadable files
 * inside a directory are left out: a link to a file the user cannot read (for
 * example a root-owned file) must not make the whole discovery plugin fail.
 */
export async function computeTreeSha256(p: string): Promise<string> {
  let s: Awaited<ReturnType<typeof stat>>;
  try {
    s = await stat(p);
  } catch {
    return '';
  }

  if (s.isFile()) {
    const content = await readFile(p).catch(() => null);
    return content === null ? '' : createHash('sha256').update(content).digest('hex');
  }

  const entries: Array<{ rel: string; sha: string }> = [];
  const visitedRealDirs = new Set<string>();

  async function walk(dir: string): Promise<void> {
    if (!(await enterDirOnce(visitedRealDirs, dir))) return;

    for (const item of await readDirFollowingLinks(dir)) {
      const full = join(dir, item.name);
      if (item.kind === 'dir') {
        await walk(full);
      } else {
        const content = await readFile(full).catch(() => null);
        if (content === null) continue;

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

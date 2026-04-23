import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

/**
 * Deterministic sha256 over a file or directory tree.
 *
 * File: sha256(file-contents)
 * Directory: sha256 of sorted "rel-path:file-sha256\n" lines
 *
 * Returns '' if the path does not exist or cannot be read.
 */
export async function computeTreeSha256(p: string): Promise<string> {
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

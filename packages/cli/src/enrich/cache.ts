import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

type CacheEntry<T> = {
  data: T;
  cachedAt: number; // unix ms
  etag?: string;
};

function cacheDir(source: string): string {
  return join(homedir(), '.cache', 'skill-audit', source);
}

function legacyCacheDir(source: string): string {
  return join(homedir(), '.cache', 'skillaudit', source);
}

function cacheKey(key: string): string {
  // Derive a filesystem-safe filename from the key (usually a URL)
  return `${createHash('sha256').update(key).digest('hex')}.json`;
}

export type CacheGetResult<T> = {
  data: T;
  etag?: string;
  stale: boolean;
};

/**
 * Read a cached entry. Returns the entry whether fresh or stale, with a
 * `stale` flag so callers can decide whether to revalidate. Returns null
 * if no entry exists at all.
 */
export async function cacheGet<T>(source: string, key: string): Promise<CacheGetResult<T> | null> {
  const filename = cacheKey(key);
  for (const dir of [cacheDir(source), legacyCacheDir(source)]) {
    try {
      const raw = await readFile(join(dir, filename), 'utf8');
      const entry: CacheEntry<T> = JSON.parse(raw) as CacheEntry<T>;
      const stale = Date.now() - entry.cachedAt > TTL_MS;
      return {
        data: entry.data,
        stale,
        ...(entry.etag !== undefined ? { etag: entry.etag } : {}),
      };
    } catch {
      // Try the next cache location.
    }
  }
  return null;
}

/**
 * Write a value into the cache under the given source namespace and key.
 * Fails silently — enrichment errors are never fatal.
 */
export async function cacheSet<T>(
  source: string,
  key: string,
  data: T,
  etag?: string
): Promise<void> {
  try {
    const dir = cacheDir(source);
    await mkdir(dir, { recursive: true });
    const entry: CacheEntry<T> = {
      data,
      cachedAt: Date.now(),
      ...(etag !== undefined ? { etag } : {}),
    };
    await writeFile(join(dir, cacheKey(key)), JSON.stringify(entry));
  } catch {
    // Cache writes are best-effort; ignore errors
  }
}

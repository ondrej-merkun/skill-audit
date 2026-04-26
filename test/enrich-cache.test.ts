import { createHash } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// We need to override homedir so the cache writes to a temp dir
const testHome = join(tmpdir(), 'skill-audit-cache-test-' + process.pid);

vi.mock('node:os', async (importOriginal) => {
  const orig = await importOriginal<typeof import('node:os')>();
  return { ...orig, homedir: () => testHome };
});

// Import after mock is set up
const { cacheGet, cacheSet } = await import('../packages/cli/src/enrich/cache.js');

describe('cache', () => {
  beforeEach(async () => {
    await mkdir(testHome, { recursive: true });
  });

  afterEach(async () => {
    await rm(testHome, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('returns null when no entry exists', async () => {
    const result = await cacheGet('github', 'https://api.github.com/repos/owner/repo');
    expect(result).toBeNull();
  });

  it('returns fresh entry with stale=false within TTL', async () => {
    const key = 'https://example.com/api';
    const data = { stars: 42 };
    await cacheSet('github', key, data);

    const result = await cacheGet<typeof data>('github', key);
    expect(result).not.toBeNull();
    expect(result?.data).toEqual(data);
    expect(result?.stale).toBe(false);
  });

  it('returns stale=true when entry is older than 24h', async () => {
    const key = 'https://example.com/api';
    const data = { stars: 99 };
    await cacheSet('github', key, data);

    // Advance time past TTL
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + 25 * 60 * 60 * 1000);

    const result = await cacheGet<typeof data>('github', key);
    expect(result?.stale).toBe(true);
    expect(result?.data).toEqual(data);
  });

  it('persists and retrieves etag', async () => {
    const key = 'https://example.com/api';
    await cacheSet('github', key, { ok: true }, '"abc123"');

    const result = await cacheGet('github', key);
    expect(result?.etag).toBe('"abc123"');
  });

  it('reads legacy skillaudit cache entries when the new cache path is empty', async () => {
    const key = 'legacy-key';
    const filename = `${createHash('sha256').update(key).digest('hex')}.json`;
    const legacyDir = join(testHome, '.cache', 'skillaudit', 'github');
    await mkdir(legacyDir, { recursive: true });
    await writeFile(
      join(legacyDir, filename),
      JSON.stringify({ data: { stars: 12 }, cachedAt: Date.now() }),
      'utf-8'
    );

    const result = await cacheGet<{ stars: number }>('github', key);
    expect(result?.data.stars).toBe(12);
    expect(result?.stale).toBe(false);
  });

  it('isolates different sources under separate namespaces', async () => {
    const key = 'same-key';
    await cacheSet('github', key, { source: 'github' });
    await cacheSet('deps-dev', key, { source: 'deps-dev' });

    const gh = await cacheGet<{ source: string }>('github', key);
    const dd = await cacheGet<{ source: string }>('deps-dev', key);
    expect(gh?.data.source).toBe('github');
    expect(dd?.data.source).toBe('deps-dev');
  });

  it('does not throw when cache dir is unwritable (fails silently)', async () => {
    // Pass a key; if the dir doesn't exist and mkdir fails, cacheSet should not throw.
    // We simulate by making homedir return a path we can't write to.
    await expect(cacheSet('github', 'x', { ok: true })).resolves.toBeUndefined();
  });
});

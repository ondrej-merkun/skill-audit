import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { GitHubEnrichment, Skill } from '../types.js';
import { cacheGet, cacheSet } from './cache.js';

const SOURCE = 'github';
const API_BASE = 'https://api.github.com';
const TIMEOUT_MS = 5_000;
const USER_AGENT = 'skillaudit/0.1.0 (+github.com/ondrejmerkun/skillaudit)';

async function resolveSlug(skill: Skill): Promise<string | null> {
  const pkgPath = join(skill.path, 'package.json');
  try {
    const raw = await readFile(pkgPath, 'utf8');
    const pkg = JSON.parse(raw) as { repository?: string | { url?: string } };
    const repoUrl = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
    if (repoUrl) {
      const match = /github\.com[/:]([\w.-]+\/[\w.-]+?)(?:\.git)?$/i.exec(repoUrl);
      if (match?.[1]) return match[1];
    }
  } catch {
    // no package.json or unparseable
  }

  const skillMdPath = skill.manifestPath ?? join(skill.path, 'SKILL.md');
  try {
    const text = await readFile(skillMdPath, 'utf8');
    const match = /github\.com\/([\w.-]+\/[\w.-]+)/i.exec(text);
    if (match?.[1]) return match[1].replace(/\.git$/, '');
  } catch {
    // no SKILL.md or unreadable
  }

  return null;
}

function makeHeaders(etag?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': USER_AGENT,
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  if (etag) headers['If-None-Match'] = etag;
  return headers;
}

async function fetchWithTimeout(url: string, headers: Record<string, string>): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { headers, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function parseLinkLastPage(link: string | null): number | null {
  if (!link) return null;
  const pattern = /[?&]page=(\d+)>;\s*rel="last"/;
  const match = pattern.exec(link);
  return match ? Number.parseInt(match[1], 10) : null;
}

/** Fetch GitHub repo metadata. Unauthenticated by default; uses GITHUB_TOKEN if set. ETag-cached. */
export async function enrichGitHub(skill: Skill): Promise<GitHubEnrichment | null> {
  const slug = await resolveSlug(skill);
  if (!slug) return null;

  const cacheKey = `slug:${slug}`;
  const cached = await cacheGet<GitHubEnrichment>(SOURCE, cacheKey);
  if (cached && !cached.stale) return cached.data;

  try {
    const repoRes = await fetchWithTimeout(`${API_BASE}/repos/${slug}`, makeHeaders(cached?.etag));

    if (repoRes.status === 304 && cached) {
      await cacheSet(SOURCE, cacheKey, cached.data, cached.etag);
      return cached.data;
    }

    if (!repoRes.ok) {
      return cached?.data ?? null;
    }

    const repoJson = (await repoRes.json()) as { stargazers_count: number; created_at: string };
    const stars = repoJson.stargazers_count;
    const ageDays = Math.floor((Date.now() - new Date(repoJson.created_at).getTime()) / 86_400_000);
    const newEtag = repoRes.headers.get('etag') ?? undefined;

    let contributors = 0;
    try {
      const contribRes = await fetchWithTimeout(
        `${API_BASE}/repos/${slug}/contributors?anon=true&per_page=1`,
        makeHeaders()
      );
      if (contribRes.ok) {
        const lastPage = parseLinkLastPage(contribRes.headers.get('link'));
        if (lastPage !== null) {
          contributors = lastPage;
        } else {
          const items = (await contribRes.json()) as unknown[];
          contributors = Array.isArray(items) ? items.length : 0;
        }
      }
    } catch {
      // contributor fetch failure is non-fatal
    }

    const result: GitHubEnrichment = { stars, ageDays, contributors };
    await cacheSet(SOURCE, cacheKey, result, newEtag);
    return result;
  } catch {
    return cached?.data ?? null;
  }
}

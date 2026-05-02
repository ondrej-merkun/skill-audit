import type { GitHubEnrichment, Skill } from '../types.js';
import { USER_AGENT } from '../version.js';
import { cacheGet, cacheSet } from './cache.js';
import { resolveGitHubSlug } from './metadata.js';

const SOURCE = 'github';
const API_BASE = 'https://api.github.com';
const TIMEOUT_MS = 5_000;

export async function hasGitHubQueryInput(skill: Skill): Promise<boolean> {
  return (await resolveGitHubSlug(skill)) !== null;
}

function makeHeaders(etag?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
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
  const pattern = /[?&]page=(\d+)[^>]*>;\s*rel="last"/;
  const match = pattern.exec(link);
  return match ? Number.parseInt(match[1], 10) : null;
}

async function fetchContributorCount(slug: string): Promise<number | null> {
  try {
    const contribRes = await fetchWithTimeout(
      `${API_BASE}/repos/${slug}/contributors?anon=true&per_page=1`,
      makeHeaders()
    );
    if (contribRes.status === 204) return 0;
    if (!contribRes.ok) return null;

    const lastPage = parseLinkLastPage(contribRes.headers.get('link'));
    if (lastPage !== null) return lastPage;

    const items = (await contribRes.json()) as unknown;
    return Array.isArray(items) ? items.length : null;
  } catch {
    return null;
  }
}

/** Fetch GitHub repo metadata. Unauthenticated by default; uses GITHUB_TOKEN if set. ETag-cached. */
export async function enrichGitHub(skill: Skill): Promise<GitHubEnrichment | null> {
  const slug = await resolveGitHubSlug(skill);
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

    const contributors = await fetchContributorCount(slug);

    const result: GitHubEnrichment = {
      stars,
      ageDays,
      contributors,
      contributorsStatus: contributors === null ? 'unavailable' : 'found',
    };
    await cacheSet(SOURCE, cacheKey, result, newEtag);
    return result;
  } catch {
    return cached?.data ?? null;
  }
}

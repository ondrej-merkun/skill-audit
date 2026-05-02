import type { DepsDevEnrichment, Skill } from '../types.js';
import { USER_AGENT } from '../version.js';
import { cacheGet, cacheSet } from './cache.js';
import { readDependencyRefs } from './metadata.js';

const SOURCE = 'depsdev';
const API_BASE = 'https://api.deps.dev/v3alpha';
const TIMEOUT_MS = 5_000;
const MAX_DEPS = 20;

type DepsDevVersion = {
  isDefault?: boolean;
  versionKey?: { version?: string };
  advisoryKeys?: { id: string }[];
  relatedProjects?: { projectKey?: { id?: string } }[];
};

type DepsDevPackageResponse = {
  versions?: DepsDevVersion[];
};

type DepsDevProjectResponse = {
  scorecard?: {
    overallScore?: number;
  };
};

type DependencyLookup = {
  advisories: number;
  scorecardScore: number | null;
};

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT },
    });
  } finally {
    clearTimeout(timer);
  }
}

function depsDevSystem(ecosystem: string): 'NPM' | 'PYPI' {
  return ecosystem === 'pypi' ? 'PYPI' : 'NPM';
}

function versionUrl(ecosystem: string, packageName: string, version: string): string {
  return `${API_BASE}/systems/${depsDevSystem(ecosystem)}/packages/${encodeURIComponent(packageName)}/versions/${encodeURIComponent(version)}`;
}

function packageUrl(ecosystem: string, packageName: string): string {
  return `${API_BASE}/systems/${depsDevSystem(ecosystem)}/packages/${encodeURIComponent(packageName)}`;
}

function projectUrl(projectId: string): string {
  return `${API_BASE}/projects/${encodeURIComponent(projectId)}`;
}

async function fetchProjectScorecard(projectId: string): Promise<number | null> {
  try {
    const res = await fetchWithTimeout(projectUrl(projectId));
    if (!res.ok) return null;
    const json = (await res.json()) as DepsDevProjectResponse;
    return typeof json.scorecard?.overallScore === 'number' ? json.scorecard.overallScore : null;
  } catch {
    return null;
  }
}

async function fetchDependencyLookup(
  ecosystem: string,
  packageName: string
): Promise<DependencyLookup | null> {
  const cacheKey = `${ecosystem}__${packageName}`;
  const cached = await cacheGet<DependencyLookup>(SOURCE, cacheKey);
  if (cached && !cached.stale) return cached.data;

  try {
    const packageRes = await fetchWithTimeout(packageUrl(ecosystem, packageName));
    if (packageRes.status === 404) return cached?.data ?? null;
    if (!packageRes.ok) {
      if (cached) return cached.data;
      throw new Error(`deps.dev package lookup failed with ${packageRes.status}`);
    }

    const packageJson = (await packageRes.json()) as DepsDevPackageResponse;
    const defaultVer = packageJson.versions?.find((v) => v.isDefault) ?? packageJson.versions?.[0];
    const version = defaultVer?.versionKey?.version;
    if (typeof version !== 'string' || version.length === 0) return cached?.data ?? null;

    const versionRes = await fetchWithTimeout(versionUrl(ecosystem, packageName, version));
    if (versionRes.status === 404) return cached?.data ?? null;
    if (!versionRes.ok) {
      if (cached) return cached.data;
      throw new Error(`deps.dev version lookup failed with ${versionRes.status}`);
    }

    const versionJson = (await versionRes.json()) as DepsDevVersion;
    const advisories = versionJson.advisoryKeys?.length ?? 0;
    const projectId = versionJson.relatedProjects?.find((p) => p.projectKey?.id)?.projectKey?.id;
    const scorecardScore =
      typeof projectId === 'string' ? await fetchProjectScorecard(projectId) : null;
    const result = { advisories, scorecardScore };

    await cacheSet(SOURCE, cacheKey, result);
    return result;
  } catch {
    if (cached) return cached.data;
    throw new Error('deps.dev lookup failed');
  }
}

export async function hasDepsDevQueryInput(skill: Skill): Promise<boolean> {
  return (await readDependencyRefs(skill, MAX_DEPS)).length > 0;
}

/** Fetch OSSF Scorecard + OSV advisory count from deps.dev for skill dependencies. Fail-silent, cached 24h. */
export async function enrichDepsDev(skill: Skill): Promise<DepsDevEnrichment | null> {
  const deps = await readDependencyRefs(skill, MAX_DEPS);
  if (deps.length === 0) return null;

  const lookups = await Promise.all(deps.map((d) => fetchDependencyLookup(d.ecosystem, d.name)));
  const found = lookups.filter((lookup): lookup is DependencyLookup => lookup !== null);
  if (found.length === 0) return null;

  const osvAdvisories = found.reduce((sum, lookup) => sum + lookup.advisories, 0);
  const scorecardScores = found
    .map((lookup) => lookup.scorecardScore)
    .filter((score): score is number => typeof score === 'number');
  const scorecardScore = scorecardScores.length === 0 ? null : Math.max(...scorecardScores);

  return { scorecardScore, osvAdvisories };
}

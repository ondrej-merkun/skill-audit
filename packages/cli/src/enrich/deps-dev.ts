import type { DepsDevEnrichment, Skill } from '../types.js';
import { cacheGet, cacheSet } from './cache.js';
import { readDependencyRefs } from './metadata.js';

const SOURCE = 'depsdev';
const API_BASE = 'https://api.deps.dev/v3alpha';
const TIMEOUT_MS = 5_000;
const USER_AGENT = 'skill-audit/0.1.0 (+github.com/ondrej-merkun/skill-audit)';
const MAX_DEPS = 20;

type DepsDevVersion = {
  isDefault?: boolean;
  advisoryKeys?: { id: string }[];
};

type DepsDevPackageResponse = {
  versions?: DepsDevVersion[];
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

async function fetchAdvisoryCount(ecosystem: string, packageName: string): Promise<number> {
  const cacheKey = `${ecosystem}__${packageName}`;
  const cached = await cacheGet<{ advisories: number }>(SOURCE, cacheKey);
  if (cached && !cached.stale) return cached.data.advisories;

  try {
    const encoded = encodeURIComponent(packageName);
    const res = await fetchWithTimeout(`${API_BASE}/packages/${ecosystem}/${encoded}`);
    if (!res.ok) return cached?.data.advisories ?? 0;

    const json = (await res.json()) as DepsDevPackageResponse;
    const defaultVer = json.versions?.find((v) => v.isDefault) ?? json.versions?.[0];
    const count = defaultVer?.advisoryKeys?.length ?? 0;

    await cacheSet(SOURCE, cacheKey, { advisories: count });
    return count;
  } catch {
    return cached?.data.advisories ?? 0;
  }
}

export async function hasDepsDevQueryInput(skill: Skill): Promise<boolean> {
  return (await readDependencyRefs(skill, MAX_DEPS)).length > 0;
}

/** Fetch OSSF Scorecard + OSV advisory count from deps.dev for skill dependencies. Fail-silent, cached 24h. */
export async function enrichDepsDev(skill: Skill): Promise<DepsDevEnrichment | null> {
  const deps = await readDependencyRefs(skill, MAX_DEPS);
  if (deps.length === 0) return null;

  const counts = await Promise.all(deps.map((d) => fetchAdvisoryCount(d.ecosystem, d.name)));
  const osvAdvisories = counts.reduce((sum, c) => sum + c, 0);

  return { scorecardScore: null, osvAdvisories };
}

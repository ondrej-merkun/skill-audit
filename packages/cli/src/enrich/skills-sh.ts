import type { Skill, SkillsShEnrichment } from '../types.js';
import { cacheGet, cacheSet } from './cache.js';
import { resolveGitHubSlug } from './metadata.js';

const SOURCE = 'skills-sh';
const AUDIT_URL = 'https://add-skill.vercel.sh/audit';
const TIMEOUT_MS = 5_000;
const USER_AGENT = 'skill-audit/0.1.0 (+github.com/ondrej-merkun/skill-audit)';

type SkillsShResponse = {
  gen?: string;
  socket_alerts?: number;
  snyk?: string;
};

export async function hasSkillsShQueryInput(skill: Skill): Promise<boolean> {
  return (await resolveGitHubSlug(skill)) !== null;
}

/** Fetch enrichment from skills.sh audit endpoint. Fail-silent, cached 24h. */
export async function enrichSkillsSh(skill: Skill): Promise<SkillsShEnrichment | null> {
  const slug = await resolveGitHubSlug(skill);
  if (!slug) return null;

  const cacheKey = `slug:${slug}`;

  const cached = await cacheGet<SkillsShEnrichment>(SOURCE, cacheKey);
  if (cached && !cached.stale) return cached.data;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(AUDIT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': USER_AGENT,
        },
        body: JSON.stringify({ slug }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      return cached?.data ?? null;
    }

    const json = (await res.json()) as SkillsShResponse;
    const result: SkillsShEnrichment = {
      gen: typeof json.gen === 'string' ? json.gen : 'unknown',
      socketAlerts: typeof json.socket_alerts === 'number' ? json.socket_alerts : 0,
      snyk: typeof json.snyk === 'string' ? json.snyk : 'unknown',
    };

    await cacheSet(SOURCE, cacheKey, result);
    return result;
  } catch {
    return cached?.data ?? null;
  }
}

import type { Skill, SkillsShEnrichment } from '../types.js';
import { cacheGet, cacheSet } from './cache.js';
import { resolveGitHubSlug } from './metadata.js';

const SOURCE = 'skills-sh';
const AUDIT_URL = 'https://add-skill.vercel.sh/audit';
const TIMEOUT_MS = 5_000;
const USER_AGENT = 'skill-audit/0.1.0 (+github.com/ondrej-merkun/skill-audit)';

type SkillsShResponse = {
  gen?: string;
  socket?: { alerts?: number };
  socket_alerts?: number;
  snyk?: string;
};

function skillAuditKey(slug: string, skillName: string): string {
  return `${slug}/${skillName}`;
}

function parseSkillsShResponse(json: unknown, key: string): SkillsShEnrichment | null {
  const response =
    typeof json === 'object' && json !== null && key in json
      ? (json as Record<string, unknown>)[key]
      : json;
  if (typeof response !== 'object' || response === null) return null;

  const data = response as SkillsShResponse;
  const socketAlerts =
    typeof data.socket?.alerts === 'number'
      ? data.socket.alerts
      : typeof data.socket_alerts === 'number'
        ? data.socket_alerts
        : null;

  if (typeof data.gen !== 'string' || typeof data.snyk !== 'string' || socketAlerts === null) {
    return null;
  }

  return { gen: data.gen, socketAlerts, snyk: data.snyk };
}

export async function hasSkillsShQueryInput(skill: Skill): Promise<boolean> {
  return (await resolveGitHubSlug(skill)) !== null;
}

/** Fetch enrichment from skills.sh audit endpoint. Fail-silent, cached 24h. */
export async function enrichSkillsSh(skill: Skill): Promise<SkillsShEnrichment | null> {
  const slug = await resolveGitHubSlug(skill);
  if (!slug) return null;

  const auditKey = skillAuditKey(slug, skill.name);
  const cacheKey = `skill:${auditKey}`;

  const cached = await cacheGet<SkillsShEnrichment>(SOURCE, cacheKey);
  if (cached && !cached.stale) return cached.data;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let res: Response;
    try {
      // add-skill.vercel.sh/audit is undocumented. As of 2026-04-27 it accepts
      // GET ?source=github&skills=<owner>/<repo>/<skill> and returns a keyed map.
      const url = new URL(AUDIT_URL);
      url.searchParams.set('source', 'github');
      url.searchParams.set('skills', auditKey);
      res = await fetch(url.toString(), {
        headers: {
          'User-Agent': USER_AGENT,
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      return cached?.data ?? null;
    }

    const result = parseSkillsShResponse(await res.json(), auditKey);
    if (result === null) return cached?.data ?? null;

    await cacheSet(SOURCE, cacheKey, result);
    return result;
  } catch {
    return cached?.data ?? null;
  }
}

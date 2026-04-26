import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Skill, SkillsShEnrichment } from '../types.js';
import { cacheGet, cacheSet } from './cache.js';

const SOURCE = 'skills-sh';
const AUDIT_URL = 'https://add-skill.vercel.sh/audit';
const TIMEOUT_MS = 5_000;
const USER_AGENT = 'skill-audit/0.1.0 (+github.com/ondrej-merkun/skillaudit)';

type SkillsShResponse = {
  gen?: string;
  socket_alerts?: number;
  snyk?: string;
};

/** Extract a GitHub owner/repo slug from a skill's package.json or SKILL.md. */
async function resolveSlug(skill: Skill): Promise<string | null> {
  // Try package.json repository field
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

  // Try SKILL.md for a GitHub URL reference
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

/** Fetch enrichment from skills.sh audit endpoint. Fail-silent, cached 24h. */
export async function enrichSkillsSh(skill: Skill): Promise<SkillsShEnrichment | null> {
  const slug = await resolveSlug(skill);
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

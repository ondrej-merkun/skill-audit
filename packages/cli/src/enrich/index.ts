import type {
  Enrichment,
  EnrichmentSourceKey,
  EnrichmentSourceOutcome,
  EnrichmentSourceStatus,
  Skill,
} from '../types.js';
import { enrichDepsDev, hasDepsDevQueryInput } from './deps-dev.js';
import { enrichGitHub, hasGitHubQueryInput } from './github.js';
import { enrichSkillsSh, hasSkillsShQueryInput } from './skills-sh.js';

export type EnrichmentSource = EnrichmentSourceKey;

export const ENRICHMENT_ENABLED = false;

const ALL_SOURCES: EnrichmentSource[] = ['skillsSh', 'github', 'depsdev'];

export type EnrichmentOptions = {
  sources?: EnrichmentSource[];
};

function hasSource(sources: EnrichmentSource[], source: EnrichmentSource): boolean {
  return sources.includes(source);
}

function setSourceData(enrichment: Enrichment, source: EnrichmentSource, data: unknown): void {
  if (source === 'skillsSh') {
    enrichment.skillsSh = data as NonNullable<Enrichment['skillsSh']>;
  } else if (source === 'github') {
    enrichment.github = data as NonNullable<Enrichment['github']>;
  } else {
    enrichment.depsdev = data as NonNullable<Enrichment['depsdev']>;
  }
}

function makeOutcome(
  source: EnrichmentSource,
  status: EnrichmentSourceStatus,
  reason?: string
): EnrichmentSourceOutcome {
  return reason === undefined ? { source, status } : { source, status, reason };
}

export function summarizeEnrichmentOutcomes(
  outcomes: EnrichmentSourceOutcome[]
): 'found' | 'no-metadata' | 'unavailable' {
  if (outcomes.some((o) => o.status === 'found' || o.status === 'stale-cache')) return 'found';
  if (outcomes.some((o) => o.status === 'unavailable')) return 'unavailable';
  return 'no-metadata';
}

export function skippedEnrichmentOutcomes(
  sources: EnrichmentSource[],
  reason = 'offline mode is active'
): EnrichmentSourceOutcome[] {
  return sources.map((source) => makeOutcome(source, 'skipped-offline', reason));
}

export type EnrichmentResult = {
  enrichment: Enrichment;
  outcomes: EnrichmentSourceOutcome[];
};

async function enrichSource(
  source: EnrichmentSource,
  skill: Skill,
  enabled: boolean
): Promise<{ source: EnrichmentSource; data: unknown | null; outcome: EnrichmentSourceOutcome }> {
  if (!enabled) {
    return {
      source,
      data: null,
      outcome: makeOutcome(source, 'skipped-offline', 'source was not requested'),
    };
  }

  try {
    const hasInput =
      source === 'skillsSh'
        ? await hasSkillsShQueryInput(skill)
        : source === 'github'
          ? await hasGitHubQueryInput(skill)
          : await hasDepsDevQueryInput(skill);
    if (!hasInput) {
      return {
        source,
        data: null,
        outcome: makeOutcome(source, 'no-input', 'no local metadata to query'),
      };
    }

    const data =
      source === 'skillsSh'
        ? await enrichSkillsSh(skill)
        : source === 'github'
          ? await enrichGitHub(skill)
          : await enrichDepsDev(skill);
    return {
      source,
      data,
      outcome:
        data === null
          ? makeOutcome(source, 'no-metadata', 'no metadata found')
          : makeOutcome(source, 'found'),
    };
  } catch {
    return {
      source,
      data: null,
      outcome: makeOutcome(source, 'unavailable', 'lookup failed or timed out'),
    };
  }
}

export async function enrichSkillWithOutcomes(
  skill: Skill,
  options: EnrichmentOptions = {}
): Promise<EnrichmentResult> {
  const sources = options.sources ?? ALL_SOURCES;
  const results = await Promise.all(
    ALL_SOURCES.map((source) => enrichSource(source, skill, hasSource(sources, source)))
  );

  const enrichment: Enrichment = {};
  const outcomes: EnrichmentSourceOutcome[] = [];
  for (const result of results) {
    outcomes.push(result.outcome);
    if (result.data !== null) setSourceData(enrichment, result.source, result.data);
  }
  return { enrichment, outcomes: outcomes.filter((o) => hasSource(sources, o.source)) };
}

export async function enrichSkill(
  skill: Skill,
  options: EnrichmentOptions = {}
): Promise<Enrichment> {
  const result = await enrichSkillWithOutcomes(skill, options);
  return result.enrichment;
}

export async function enrichAll(
  skills: Skill[],
  options: EnrichmentOptions = {}
): Promise<Enrichment[]> {
  return Promise.all(skills.map((s) => enrichSkill(s, options)));
}

export async function enrichAllWithOutcomes(
  skills: Skill[],
  options: EnrichmentOptions = {}
): Promise<EnrichmentResult[]> {
  return Promise.all(skills.map((s) => enrichSkillWithOutcomes(s, options)));
}

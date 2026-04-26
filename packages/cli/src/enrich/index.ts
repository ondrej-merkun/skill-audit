import type { Enrichment, Skill } from '../types.js';
import { enrichDepsDev } from './deps-dev.js';
import { enrichGitHub } from './github.js';
import { enrichSkillsSh } from './skills-sh.js';

export type EnrichmentSource = 'skillsSh' | 'github' | 'depsdev';

const ALL_SOURCES: EnrichmentSource[] = ['skillsSh', 'github', 'depsdev'];

export type EnrichmentOptions = {
  sources?: EnrichmentSource[];
};

function hasSource(sources: EnrichmentSource[], source: EnrichmentSource): boolean {
  return sources.includes(source);
}

export async function enrichSkill(
  skill: Skill,
  options: EnrichmentOptions = {}
): Promise<Enrichment> {
  const sources = options.sources ?? ALL_SOURCES;
  const [skillsSh, github, depsdev] = await Promise.all([
    hasSource(sources, 'skillsSh') ? enrichSkillsSh(skill).catch(() => null) : null,
    hasSource(sources, 'github') ? enrichGitHub(skill).catch(() => null) : null,
    hasSource(sources, 'depsdev') ? enrichDepsDev(skill).catch(() => null) : null,
  ]);

  const enrichment: Enrichment = {};
  if (skillsSh !== null) enrichment.skillsSh = skillsSh;
  if (github !== null) enrichment.github = github;
  if (depsdev !== null) enrichment.depsdev = depsdev;
  return enrichment;
}

export async function enrichAll(
  skills: Skill[],
  options: EnrichmentOptions = {}
): Promise<Enrichment[]> {
  return Promise.all(skills.map((s) => enrichSkill(s, options)));
}

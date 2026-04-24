import type { Enrichment, Skill } from '../types.js';
import { enrichDepsDev } from './deps-dev.js';
import { enrichGitHub } from './github.js';
import { enrichSkillsSh } from './skills-sh.js';

export async function enrichSkill(skill: Skill): Promise<Enrichment> {
  const [skillsSh, github, depsdev] = await Promise.all([
    enrichSkillsSh(skill).catch(() => null),
    enrichGitHub(skill).catch(() => null),
    enrichDepsDev(skill).catch(() => null),
  ]);

  const enrichment: Enrichment = {};
  if (skillsSh !== null) enrichment.skillsSh = skillsSh;
  if (github !== null) enrichment.github = github;
  if (depsdev !== null) enrichment.depsdev = depsdev;
  return enrichment;
}

export async function enrichAll(skills: Skill[]): Promise<Enrichment[]> {
  return Promise.all(skills.map((s) => enrichSkill(s)));
}

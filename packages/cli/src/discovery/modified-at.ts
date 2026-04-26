import { stat } from 'node:fs/promises';
import type { Skill } from '../types.js';

export async function withModifiedAt(skill: Skill): Promise<Skill> {
  const statPath = skill.manifestPath ?? skill.path;

  try {
    const info = await stat(statPath);
    return { ...skill, modifiedAt: info.mtime.toISOString() };
  } catch {
    return skill;
  }
}

export async function addModifiedAt(skills: Skill[]): Promise<Skill[]> {
  return Promise.all(skills.map(withModifiedAt));
}

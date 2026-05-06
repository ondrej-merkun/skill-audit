import type { Skill } from '../types.js';

export function findSkillByNameOrId(skills: Skill[], nameOrId: string): Skill | undefined {
  const rawNeedle = nameOrId.trim();
  if (rawNeedle === '') return undefined;

  const needle = rawNeedle.toLowerCase();
  return (
    skills.find((skill) => skill.name.toLowerCase() === needle) ??
    skills.find((skill) => skill.id === rawNeedle) ??
    skills.find((skill) => skill.name.toLowerCase().includes(needle))
  );
}

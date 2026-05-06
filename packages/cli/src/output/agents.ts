import { formatAgentName } from '../agent-names.js';
import type { Skill } from '../types.js';

export function skillAgentIds(skill: Pick<Skill, 'agentId' | 'agentIds'>): string[] {
  return skill.agentIds ?? [skill.agentId];
}

export function skillAgentLabel(skill: Pick<Skill, 'agentId' | 'agentIds'>): string {
  const agentIds = skillAgentIds(skill);
  if (agentIds.length === 1) return formatAgentName(agentIds[0] ?? skill.agentId);
  return `${agentIds.length} agents`;
}

export function skillAgentNames(skill: Pick<Skill, 'agentId' | 'agentIds'>): string {
  return skillAgentIds(skill).map(formatAgentName).join(', ');
}

export function skillAgentPaths(
  skill: Pick<Skill, 'agentId' | 'agentIds' | 'agentPaths' | 'path'>
): Array<{ agentId: string; path: string }> {
  if (skill.agentPaths !== undefined && skill.agentPaths.length > 0) return skill.agentPaths;
  return [{ agentId: skill.agentId, path: skill.path }];
}

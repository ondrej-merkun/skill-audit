import { basename } from 'node:path';
import type { Skill, SkillInstallation } from '../types.js';

/**
 * What rule selection reads from a skill's own installation. Dedupe keeps one per merged
 * installation. This module stays a leaf, so discovery does not load the rule engine.
 */
export function ruleInstallation(skill: Skill): SkillInstallation {
  return {
    format: skill.format,
    scope: skill.scope,
    scanName: skill.metadata?.ruleScanFilename ?? basename(skill.path),
  };
}

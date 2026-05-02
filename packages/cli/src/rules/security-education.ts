import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Finding, Skill } from '../types.js';

export const SECURITY_EDUCATION_CONTEXT_RULE_ID = 'CTX-SECURITY-EDUCATION';

const SECURITY_EDUCATION_SKILL_PATTERN =
  /\b(?:security|audit(?:or|ing)?|scanner|detector|tester|testing|red[-_ ]?team|blue[-_ ]?team|prompt[-_ ]?injection|jailbreak|malware|vulnerab(?:ility|ilities)?|threat[-_ ]?model|payload|fixture|rule[-_ ]?test|false[-_ ]?positive)\b/i;

function readIfExists(path: string): string {
  try {
    if (!existsSync(path)) return '';
    return readFileSync(path, 'utf-8').slice(0, 8_000);
  } catch {
    return '';
  }
}

function stringifyMetadata(skill: Skill): string {
  if (skill.metadata === undefined) return '';
  try {
    return JSON.stringify(skill.metadata) ?? '';
  } catch {
    return '';
  }
}

function readSkillContext(skill: Skill): string {
  const metadata = stringifyMetadata(skill);
  const manifestText = skill.manifestPath === null ? '' : readIfExists(skill.manifestPath);

  let pathText = '';
  try {
    const st = statSync(skill.path);
    if (st.isFile()) {
      pathText = readIfExists(skill.path);
    } else if (st.isDirectory()) {
      for (const candidate of ['SKILL.md', 'AGENTS.md', 'README.md']) {
        pathText = readIfExists(join(skill.path, candidate));
        if (pathText !== '') break;
      }
    }
  } catch {
    pathText = '';
  }

  return [skill.name, skill.path, metadata, manifestText, pathText].join('\n');
}

export function isLikelySecurityEducationSkill(skill: Skill): boolean {
  return SECURITY_EDUCATION_SKILL_PATTERN.test(readSkillContext(skill));
}

export function withSecurityEducationContextFinding(skill: Skill, findings: Finding[]): Finding[] {
  const hasNonInfoFinding = findings.some((finding) => finding.severity !== 'info');
  if (!hasNonInfoFinding) return findings;
  if (findings.some((finding) => finding.ruleId === SECURITY_EDUCATION_CONTEXT_RULE_ID)) {
    return findings;
  }
  if (!isLikelySecurityEducationSkill(skill)) return findings;

  const anchor = findings.find((finding) => finding.severity !== 'info') ?? findings[0];
  const file = anchor?.file ?? skill.manifestPath ?? skill.path;

  return [
    ...findings,
    {
      ruleId: SECURITY_EDUCATION_CONTEXT_RULE_ID,
      severity: 'info',
      category: 'context',
      file,
      line: 1,
      column: 1,
      snippet: 'Likely security, scanner, tester, or red-team skill context.',
      message:
        'This skill appears security-related; review whether matched evidence is an inert example before ignoring it.',
      fix: 'If every non-info finding is confirmed to be example content, run skill-audit ignore <skill>. Otherwise remove the active risky instruction or code.',
      cwe: [],
    },
  ];
}

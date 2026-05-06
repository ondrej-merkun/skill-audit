import type { ScannedSkill } from '../types.js';

type TopIssue = {
  kind: 'allowlisted' | 'none' | 'finding';
  label: string;
  location?: string;
};

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

const MAX_TOP_ISSUE_LENGTH = 56;

function humanizeRuleId(ruleId: string): string {
  return ruleId.toLowerCase().split('-').filter(Boolean).join(' ');
}

function compactMessage(message: string, ruleId: string): string {
  const normalized = message.replace(/\s+/g, ' ').trim();
  const withoutDetail = normalized.split(/\s+(?:-|—)\s+/u)[0]?.trim() ?? normalized;
  const withoutTrailingPunctuation = withoutDetail.replace(/[.!?]+$/u, '');
  const withoutDetected = withoutTrailingPunctuation.replace(/\s+detected$/iu, '');
  const label = withoutDetected.length > 0 ? withoutDetected : humanizeRuleId(ruleId);

  if (label.length <= MAX_TOP_ISSUE_LENGTH) return label;
  return `${label.slice(0, MAX_TOP_ISSUE_LENGTH - 3).trimEnd()}...`;
}

function findingLocation(file: string, line: number): string | undefined {
  if (line <= 0) return undefined;

  const basename = file.replace(/^.*[\\/]/, '');
  return `${basename}:${line}`;
}

export function topIssueForSkill(skill: ScannedSkill): TopIssue {
  if (skill.summary.allowlisted) return { kind: 'allowlisted', label: 'allowlisted ✓' };
  if (skill.findings.length === 0) return { kind: 'none', label: '—' };

  const sorted = [...skill.findings].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99)
  );
  const top = sorted[0];
  if (!top) return { kind: 'none', label: '—' };

  const label = compactMessage(top.message, top.ruleId);
  const location = findingLocation(top.file, top.line);
  return location === undefined ? { kind: 'finding', label } : { kind: 'finding', label, location };
}

export function formatTopIssuePlain(skill: ScannedSkill): string {
  const issue = topIssueForSkill(skill);
  return issue.location === undefined ? issue.label : `${issue.label} (${issue.location})`;
}

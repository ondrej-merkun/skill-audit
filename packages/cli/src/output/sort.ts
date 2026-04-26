import type { ScannedSkill, Severity, Verdict } from '../types.js';

const VERDICT_RANK: Record<Verdict, number> = { FAIL: 0, REVIEW: 1, PASS: 2 };
const SEVERITY_RANK: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

function compareString(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function highestFindingSeverityRank(skill: ScannedSkill): number {
  return skill.findings.reduce((rank, finding) => {
    return Math.min(rank, SEVERITY_RANK[finding.severity] ?? Number.POSITIVE_INFINITY);
  }, Number.POSITIVE_INFINITY);
}

export function compareScannedSkillsByRisk(a: ScannedSkill, b: ScannedSkill): number {
  const scoreDelta = a.summary.score - b.summary.score;
  if (scoreDelta !== 0) return scoreDelta;

  const verdictDelta = VERDICT_RANK[a.summary.verdict] - VERDICT_RANK[b.summary.verdict];
  if (verdictDelta !== 0) return verdictDelta;

  const severityDelta = highestFindingSeverityRank(a) - highestFindingSeverityRank(b);
  if (severityDelta !== 0) return severityDelta;

  return (
    compareString(a.agentId, b.agentId) ||
    compareString(a.name, b.name) ||
    compareString(a.path, b.path)
  );
}

export function sortScanSkills(skills: ScannedSkill[]): ScannedSkill[] {
  return [...skills].sort(compareScannedSkillsByRisk);
}

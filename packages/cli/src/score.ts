import type { Finding, Severity, SkillSummary, Verdict } from './types.js';

function countUniqueRulesBySeverity(findings: Finding[], severity: Severity): number {
  const ids = new Set<string>();
  for (const f of findings) {
    if (f.severity === severity) ids.add(f.ruleId);
  }
  return ids.size;
}

function verdictFromScore(score: number): Verdict {
  if (score >= 85) return 'PASS';
  if (score >= 50) return 'REVIEW';
  return 'FAIL';
}

/** Compute a SkillSummary from a list of findings using the spec §4 scoring formula. */
export function scoreFindings(findings: Finding[]): SkillSummary {
  const critical = countUniqueRulesBySeverity(findings, 'critical');
  const high = countUniqueRulesBySeverity(findings, 'high');
  const medium = countUniqueRulesBySeverity(findings, 'medium');
  const low = countUniqueRulesBySeverity(findings, 'low');
  const info = countUniqueRulesBySeverity(findings, 'info');

  const score = Math.max(0, 100 - (25 * critical + 10 * high + 3 * medium + 1 * low));
  const verdict = verdictFromScore(score);

  return {
    critical,
    high,
    medium,
    low,
    info,
    score,
    verdict,
    mandatoryFail: [],
    allowlisted: false,
  };
}

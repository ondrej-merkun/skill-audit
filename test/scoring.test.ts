import { describe, expect, it } from 'vitest';
import { scoreFindings } from '../packages/cli/src/score.js';
import type { Finding } from '../packages/cli/src/types.js';

function finding(ruleId: string, severity: Finding['severity']): Finding {
  return {
    ruleId,
    severity,
    category: 'test',
    file: 'SKILL.md',
    line: 1,
    column: 0,
    snippet: 'test',
    message: 'test',
    fix: 'test',
    cwe: [],
  };
}

describe('scoreFindings', () => {
  it('should return score 100 and PASS for zero findings', () => {
    const result = scoreFindings([]);
    expect(result.score).toBe(100);
    expect(result.verdict).toBe('PASS');
    expect(result.critical).toBe(0);
    expect(result.mandatoryFail).toEqual([]);
    expect(result.allowlisted).toBe(false);
  });

  it('should return score 75 and REVIEW for one critical', () => {
    const result = scoreFindings([finding('PI-OVERRIDE', 'critical')]);
    expect(result.score).toBe(75);
    expect(result.verdict).toBe('REVIEW');
    expect(result.critical).toBe(1);
  });

  it('should count unique rule IDs, not total findings', () => {
    // Same rule firing 5 times should count as 1 unique critical
    const dupes = Array.from({ length: 5 }, () => finding('PI-OVERRIDE', 'critical'));
    const result = scoreFindings(dupes);
    expect(result.score).toBe(75);
    expect(result.critical).toBe(1);
  });

  it('should return score 50 and REVIEW for two criticals', () => {
    const result = scoreFindings([
      finding('RULE-A', 'critical'),
      finding('RULE-B', 'critical'),
    ]);
    expect(result.score).toBe(50);
    expect(result.verdict).toBe('REVIEW');
  });

  it('should return score 25 and FAIL for three criticals', () => {
    const result = scoreFindings([
      finding('RULE-A', 'critical'),
      finding('RULE-B', 'critical'),
      finding('RULE-C', 'critical'),
    ]);
    expect(result.score).toBe(25);
    expect(result.verdict).toBe('FAIL');
  });

  it('should clamp score to 0 and FAIL for many criticals', () => {
    const manyRules = Array.from({ length: 10 }, (_, i) => finding(`RULE-${i}`, 'critical'));
    const result = scoreFindings(manyRules);
    expect(result.score).toBe(0);
    expect(result.verdict).toBe('FAIL');
  });

  it('should apply full formula: 25C + 10H + 3M + 1L', () => {
    const findings = [
      finding('CRIT', 'critical'),   // -25
      finding('HIGH', 'high'),       // -10
      finding('MED', 'medium'),      // -3
      finding('LOW', 'low'),         // -1
    ];
    const result = scoreFindings(findings);
    expect(result.score).toBe(100 - 25 - 10 - 3 - 1); // 61
    expect(result.verdict).toBe('REVIEW');
  });

  it('should not count info findings in score', () => {
    const result = scoreFindings([finding('INFO-RULE', 'info')]);
    expect(result.score).toBe(100);
    expect(result.verdict).toBe('PASS');
    expect(result.info).toBe(1);
  });

  it('should return score 85 and PASS at lower boundary', () => {
    // 1 high (-10) + 1 medium (-3) + 2 low (-2) = -15, score = 85
    const findings = [
      finding('H1', 'high'),
      finding('M1', 'medium'),
      finding('L1', 'low'),
      finding('L2', 'low'),
    ];
    const result = scoreFindings(findings);
    expect(result.score).toBe(85);
    expect(result.verdict).toBe('PASS');
  });

  it('should return score 84 and REVIEW just below PASS boundary', () => {
    // 1 high (-10) + 2 medium (-6) = -16, score = 84
    const findings = [finding('H1', 'high'), finding('M1', 'medium'), finding('M2', 'medium')];
    const result = scoreFindings(findings);
    expect(result.score).toBe(84);
    expect(result.verdict).toBe('REVIEW');
  });
});

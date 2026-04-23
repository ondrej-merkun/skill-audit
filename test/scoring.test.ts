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

describe('mandatory-fail overrides', () => {
  it('should force FAIL for NET-EXFIL-ENV even if score would be REVIEW', () => {
    const result = scoreFindings([finding('NET-EXFIL-ENV', 'critical')]);
    expect(result.verdict).toBe('FAIL');
    expect(result.mandatoryFail).toContain('NET-EXFIL-ENV');
  });

  it('should force FAIL for NET-WEBHOOK-KNOWN', () => {
    const result = scoreFindings([finding('NET-WEBHOOK-KNOWN', 'high')]);
    expect(result.verdict).toBe('FAIL');
    expect(result.mandatoryFail).toContain('NET-WEBHOOK-KNOWN');
  });

  it('should force FAIL for SKILL-PASSWORD-ZIP', () => {
    const result = scoreFindings([finding('SKILL-PASSWORD-ZIP', 'high')]);
    expect(result.verdict).toBe('FAIL');
    expect(result.mandatoryFail).toContain('SKILL-PASSWORD-ZIP');
  });

  it('should force FAIL for PI-EXFIL-TRIGGER-CLAUSE', () => {
    const result = scoreFindings([finding('PI-EXFIL-TRIGGER-CLAUSE', 'critical')]);
    expect(result.verdict).toBe('FAIL');
    expect(result.mandatoryFail).toContain('PI-EXFIL-TRIGGER-CLAUSE');
  });

  it('should force FAIL for OBFS-EVAL-ATOB', () => {
    const result = scoreFindings([finding('OBFS-EVAL-ATOB', 'critical')]);
    expect(result.verdict).toBe('FAIL');
    expect(result.mandatoryFail).toContain('OBFS-EVAL-ATOB');
  });

  it('should force FAIL for DEPS-REMOTE-IMPORT + SKILL-CURL-BASH-IN-MD', () => {
    const result = scoreFindings([
      finding('DEPS-REMOTE-IMPORT', 'high'),
      finding('SKILL-CURL-BASH-IN-MD', 'high'),
    ]);
    expect(result.verdict).toBe('FAIL');
    expect(result.mandatoryFail).toContain('DEPS-REMOTE-IMPORT');
    expect(result.mandatoryFail).toContain('SKILL-CURL-BASH-IN-MD');
  });

  it('should NOT force FAIL for DEPS-REMOTE-IMPORT alone', () => {
    const result = scoreFindings([finding('DEPS-REMOTE-IMPORT', 'high')]);
    // DEPS-REMOTE-IMPORT alone: score = 100 - 10 = 90 → PASS
    expect(result.verdict).toBe('PASS');
    expect(result.mandatoryFail).toEqual([]);
  });

  it('should force FAIL for FS-CREDSTORE + NET-EXFIL-ENV compound', () => {
    const result = scoreFindings([
      finding('FS-CREDSTORE', 'high'),
      finding('NET-EXFIL-ENV', 'critical'),
    ]);
    expect(result.verdict).toBe('FAIL');
    expect(result.mandatoryFail).toContain('FS-CREDSTORE');
    expect(result.mandatoryFail).toContain('NET-EXFIL-ENV');
  });

  it('should force FAIL for FS-CREDSTORE + any NET-* rule', () => {
    const result = scoreFindings([
      finding('FS-CREDSTORE', 'high'),
      finding('NET-OUTBOUND-NONLOCAL', 'medium'),
    ]);
    expect(result.verdict).toBe('FAIL');
    expect(result.mandatoryFail).toContain('FS-CREDSTORE');
    expect(result.mandatoryFail).toContain('NET-OUTBOUND-NONLOCAL');
  });

  it('should NOT force FAIL for FS-CREDSTORE alone (no NET-* present)', () => {
    const result = scoreFindings([finding('FS-CREDSTORE', 'high')]);
    // FS-CREDSTORE alone: score = 100 - 10 = 90 → PASS
    expect(result.verdict).toBe('PASS');
    expect(result.mandatoryFail).toEqual([]);
  });

  it('should include all triggered mandatory-fail IDs when multiple apply', () => {
    const result = scoreFindings([
      finding('NET-EXFIL-ENV', 'critical'),
      finding('OBFS-EVAL-ATOB', 'critical'),
    ]);
    expect(result.verdict).toBe('FAIL');
    expect(result.mandatoryFail).toContain('NET-EXFIL-ENV');
    expect(result.mandatoryFail).toContain('OBFS-EVAL-ATOB');
  });

  it('should force FAIL even when score would be high (REVIEW) for mandatory rule', () => {
    // Only 1 critical = score 75 (REVIEW band), but mandatory-fail overrides
    const result = scoreFindings([finding('PI-EXFIL-TRIGGER-CLAUSE', 'critical')]);
    expect(result.score).toBe(75);
    expect(result.verdict).toBe('FAIL');
  });
});

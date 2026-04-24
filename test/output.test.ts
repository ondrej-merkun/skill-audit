import { describe, expect, it, vi } from 'vitest';
import { renderTable, renderTableToString } from '../packages/cli/src/output/table.js';
import {
  renderSummaryFooter,
  renderSummaryCompact,
  renderSummary,
} from '../packages/cli/src/output/summary.js';
import type { ScanResult, ScannedSkill } from '../packages/cli/src/types.js';

function makeSkill(overrides: Partial<ScannedSkill> = {}): ScannedSkill {
  return {
    id: 'abc123',
    agentId: 'claude-code',
    name: 'test-skill',
    path: '/tmp/test-skill',
    manifestPath: null,
    format: 'SKILL.md',
    scope: 'user',
    treeSha256: 'deadbeef',
    findings: [],
    enrichment: {},
    summary: {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
      score: 100,
      verdict: 'PASS',
      mandatoryFail: [],
      allowlisted: false,
    },
    ...overrides,
  };
}

function makeScanResult(overrides: Partial<ScanResult> = {}): ScanResult {
  return {
    schemaVersion: '1.0',
    scan: { startedAt: '2024-01-01T00:00:00.000Z', durationMs: 1320, toolVersion: '0.1.0' },
    agents: [{ id: 'claude-code', installed: true, skillsScanned: 1 }],
    skills: [makeSkill()],
    summary: {
      skillsScanned: 1,
      compromised: 0,
      percentCompromised: 0,
      verdict: 'PASS',
    },
    ...overrides,
  };
}

describe('renderTableToString', () => {
  it('includes skill count and agent count in header', () => {
    const result = makeScanResult();
    const out = renderTableToString(result);
    expect(out).toContain('scanned 1 skill');
    expect(out).toContain('1 agent');
  });

  it('shows 🟢 dot and PASS for a clean skill', () => {
    const out = renderTableToString(makeScanResult());
    expect(out).toContain('🟢');
    expect(out).toContain('PASS');
  });

  it('shows 🔴 dot and FAIL for a failing skill', () => {
    const result = makeScanResult({
      skills: [
        makeSkill({
          summary: {
            critical: 1,
            high: 0,
            medium: 0,
            low: 0,
            info: 0,
            score: 0,
            verdict: 'FAIL',
            mandatoryFail: ['NET-EXFIL-ENV'],
            allowlisted: false,
          },
          findings: [
            {
              ruleId: 'NET-EXFIL-ENV',
              severity: 'critical',
              category: 'network-exfil',
              file: 'SKILL.md',
              line: 14,
              column: 1,
              snippet: 'os.environ',
              message: 'Env var exfiltrated via network.',
              fix: 'Remove network calls that include env vars.',
              cwe: ['CWE-200'],
            },
          ],
        }),
      ],
      summary: { skillsScanned: 1, compromised: 1, percentCompromised: 100, verdict: 'FAIL' },
    });
    const out = renderTableToString(result);
    expect(out).toContain('🔴');
    expect(out).toContain('FAIL');
    expect(out).toContain('net-exfil-env');
    expect(out).toContain('SKILL.md:14');
  });

  it('shows orange dot 🟠 for REVIEW at score < 75', () => {
    const result = makeScanResult({
      skills: [
        makeSkill({
          summary: {
            critical: 0,
            high: 1,
            medium: 0,
            low: 0,
            info: 0,
            score: 65,
            verdict: 'REVIEW',
            mandatoryFail: [],
            allowlisted: false,
          },
        }),
      ],
    });
    const out = renderTableToString(result);
    expect(out).toContain('🟠');
  });

  it('shows yellow dot 🟡 for REVIEW at score >= 75', () => {
    const result = makeScanResult({
      skills: [
        makeSkill({
          summary: {
            critical: 0,
            high: 1,
            medium: 0,
            low: 0,
            info: 0,
            score: 82,
            verdict: 'REVIEW',
            mandatoryFail: [],
            allowlisted: false,
          },
        }),
      ],
    });
    const out = renderTableToString(result);
    expect(out).toContain('🟡');
  });

  it('shows "allowlisted ✓" for allowlisted skills', () => {
    const result = makeScanResult({
      skills: [
        makeSkill({
          name: 'anthropic/pdf',
          summary: {
            critical: 0,
            high: 0,
            medium: 0,
            low: 0,
            info: 0,
            score: 100,
            verdict: 'PASS',
            mandatoryFail: [],
            allowlisted: true,
          },
        }),
      ],
    });
    const out = renderTableToString(result);
    expect(out).toContain('allowlisted ✓');
  });

  it('shows "—" for a clean non-allowlisted skill', () => {
    const out = renderTableToString(makeScanResult());
    expect(out).toContain('—');
  });

  it('sorts FAIL rows before REVIEW and PASS', () => {
    const result = makeScanResult({
      skills: [
        makeSkill({
          id: 'pass-skill',
          name: 'pass-skill',
          summary: {
            critical: 0,
            high: 0,
            medium: 0,
            low: 0,
            info: 0,
            score: 100,
            verdict: 'PASS',
            mandatoryFail: [],
            allowlisted: false,
          },
        }),
        makeSkill({
          id: 'fail-skill',
          name: 'fail-skill',
          summary: {
            critical: 1,
            high: 0,
            medium: 0,
            low: 0,
            info: 0,
            score: 0,
            verdict: 'FAIL',
            mandatoryFail: ['NET-EXFIL-ENV'],
            allowlisted: false,
          },
        }),
      ],
      summary: { skillsScanned: 2, compromised: 1, percentCompromised: 50, verdict: 'FAIL' },
    });
    const out = renderTableToString(result);
    const failIdx = out.indexOf('fail-skill');
    const passIdx = out.indexOf('pass-skill');
    expect(failIdx).toBeLessThan(passIdx);
  });

  it('shows compromised count in summary', () => {
    const result = makeScanResult({
      skills: [
        makeSkill({
          summary: {
            critical: 1,
            high: 0,
            medium: 0,
            low: 0,
            info: 0,
            score: 0,
            verdict: 'FAIL',
            mandatoryFail: ['NET-EXFIL-ENV'],
            allowlisted: false,
          },
        }),
      ],
      summary: { skillsScanned: 1, compromised: 1, percentCompromised: 100, verdict: 'FAIL' },
    });
    const out = renderTableToString(result);
    expect(out).toContain('Compromised skills');
  });

  it('includes next-step commands for explain when there is a FAIL skill', () => {
    const result = makeScanResult({
      skills: [
        makeSkill({
          name: 'bad-skill',
          summary: {
            critical: 1,
            high: 0,
            medium: 0,
            low: 0,
            info: 0,
            score: 0,
            verdict: 'FAIL',
            mandatoryFail: ['NET-EXFIL-ENV'],
            allowlisted: false,
          },
        }),
      ],
      summary: { skillsScanned: 1, compromised: 1, percentCompromised: 100, verdict: 'FAIL' },
    });
    const out = renderTableToString(result);
    expect(out).toContain('skillaudit explain bad-skill');
    expect(out).toContain('skillaudit --html report.html');
  });
});

describe('renderSummaryFooter', () => {
  it('includes Skills scanned count', () => {
    const out = renderSummaryFooter(makeScanResult(), [makeSkill()]);
    expect(out).toContain('Skills scanned');
    expect(out).toContain('1');
  });

  it('includes Unique issues line', () => {
    const out = renderSummaryFooter(makeScanResult(), [makeSkill()]);
    expect(out).toContain('Unique issues');
  });

  it('shows compromised count when non-zero', () => {
    const failSkill = makeSkill({
      summary: {
        critical: 1,
        high: 0,
        medium: 0,
        low: 0,
        info: 0,
        score: 0,
        verdict: 'FAIL',
        mandatoryFail: ['NET-EXFIL-ENV'],
        allowlisted: false,
      },
    });
    const result = makeScanResult({
      skills: [failSkill],
      summary: { skillsScanned: 1, compromised: 1, percentCompromised: 100, verdict: 'FAIL' },
    });
    const out = renderSummaryFooter(result, [failSkill]);
    expect(out).toContain('Compromised skills');
    expect(out).toContain('100%');
  });

  it('shows Duration line', () => {
    const out = renderSummaryFooter(makeScanResult(), [makeSkill()]);
    expect(out).toContain('Duration');
    expect(out).toContain('1.32s');
  });

  it('shows next-command for FAIL skill', () => {
    const failSkill = makeSkill({
      name: 'risky-skill',
      summary: {
        critical: 1,
        high: 0,
        medium: 0,
        low: 0,
        info: 0,
        score: 0,
        verdict: 'FAIL',
        mandatoryFail: ['NET-EXFIL-ENV'],
        allowlisted: false,
      },
    });
    const result = makeScanResult({
      skills: [failSkill],
      summary: { skillsScanned: 1, compromised: 1, percentCompromised: 100, verdict: 'FAIL' },
    });
    const out = renderSummaryFooter(result, [failSkill]);
    expect(out).toContain('skillaudit explain risky-skill');
    expect(out).toContain('skillaudit --html report.html');
  });

  it('omits Enrichment line when no enrichment data', () => {
    const out = renderSummaryFooter(makeScanResult(), [makeSkill()]);
    expect(out).not.toContain('Enrichment');
  });

  it('shows Enrichment line when skills.sh data is present', () => {
    const enrichedSkill = makeSkill({
      enrichment: { skillsSh: { gen: 'Low', socketAlerts: 0, snyk: 'Low' } },
    });
    const result = makeScanResult({ skills: [enrichedSkill] });
    const out = renderSummaryFooter(result, [enrichedSkill]);
    expect(out).toContain('Enrichment');
    expect(out).toContain('skills.sh');
  });
});

describe('renderSummaryCompact', () => {
  it('includes skill count', () => {
    const out = renderSummaryCompact(makeScanResult());
    expect(out).toContain('1 skills');
  });

  it('includes compromised count', () => {
    const out = renderSummaryCompact(
      makeScanResult({
        summary: { skillsScanned: 5, compromised: 2, percentCompromised: 40, verdict: 'FAIL' },
      })
    );
    expect(out).toContain('2 compromised');
    expect(out).toContain('40%');
  });

  it('includes verdict string', () => {
    const out = renderSummaryCompact(makeScanResult());
    expect(out).toContain('PASS');
  });

  it('includes duration', () => {
    const out = renderSummaryCompact(makeScanResult());
    expect(out).toContain('1.32s');
  });

  it('ends with newline', () => {
    const out = renderSummaryCompact(makeScanResult());
    expect(out.endsWith('\n')).toBe(true);
  });
});

describe('renderSummary', () => {
  it('writes compact summary to stdout', () => {
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    renderSummary(makeScanResult());
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('renderTable', () => {
  it('writes output to stdout without throwing', () => {
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    renderTable(makeScanResult());
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('handles a FAIL verdict skill without throwing', () => {
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const result = makeScanResult({
      skills: [
        makeSkill({
          summary: {
            critical: 1,
            high: 0,
            medium: 0,
            low: 0,
            info: 0,
            score: 75,
            verdict: 'FAIL',
            mandatoryFail: ['NET-EXFIL-ENV'],
            allowlisted: false,
          },
        }),
      ],
      summary: { skillsScanned: 1, compromised: 1, percentCompromised: 100, verdict: 'FAIL' },
    });
    renderTable(result);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('handles multiple skills without throwing', () => {
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const result = makeScanResult({
      skills: [makeSkill(), makeSkill({ id: 'def456', agentId: 'cursor', name: 'another-skill' })],
      summary: { skillsScanned: 2, compromised: 0, percentCompromised: 0, verdict: 'PASS' },
    });
    renderTable(result);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

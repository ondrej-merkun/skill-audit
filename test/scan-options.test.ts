import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import stripAnsi from './helpers/strip-ansi.js';
import type { LlmReviewFetch } from '../packages/cli/src/llm/review.js';
import type { Skill } from '../packages/cli/src/types.js';

// Mock discovery and rules engine before importing runScan
vi.mock('../packages/cli/src/discovery/index.js', () => ({
  clearPlugins: vi.fn(),
  initDefaultPlugins: vi.fn(),
  discoverAll: vi.fn(),
}));

vi.mock('../packages/cli/src/rules/engine.js', () => ({
  runRules: vi.fn(),
}));

vi.mock('../packages/cli/src/enrich/index.js', () => ({
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
import { runRules } from '../packages/cli/src/rules/engine.js';
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

  it('--json emits parseable JSON to stdout', async () => {
    vi.mocked(discoverAll).mockResolvedValue([makeSkill()]);
    await runScan({ json: true });
    const out = stdoutChunks.join('');
    expect(() => JSON.parse(out)).not.toThrow();
    const json = JSON.parse(out);
    expect(json.schema_version).toBe('1.0');
    expect(Array.isArray(json.skills)).toBe(true);
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
    vi.mocked(runRules).mockImplementation(async (path) => {
      if (path === '/tmp/fail-score-0') {
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
      if (path === '/tmp/fail-score-75') {
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
      if (path === '/tmp/review-score-50') {
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

  it('default scan enriches only sources shown in the table', async () => {
    vi.mocked(discoverAll).mockResolvedValue([makeSkill()]);

    await runScan({});

    expect(enrichAllWithOutcomes).toHaveBeenCalledWith(expect.any(Array), {
      sources: ['skillsSh', 'github', 'depsdev'],
    });
  });

  it('writes live scan and enrichment progress only to stderr for pretty output', async () => {
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
    expect(stderr).toContain('Enriching with skills.sh, GitHub, deps.dev');
    expect(stderr).toContain('skills.sh no metadata');
    expect(stderr).toContain('deps.dev no metadata');
    expect(stderr).not.toContain('skills.sh ✓');
    expect(stderr).not.toContain('deps.dev ✓');
  });

  it('default scan explains when selected enrichment sources find no metadata', async () => {
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
    expect(out).toContain('Enrichment');
    expect(out).toContain('skills.sh no metadata');
    expect(out).toContain('deps.dev no metadata');
  });

  it('default scan explains when aggregate enrichment lookup fails', async () => {
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
    expect(out).toContain('Enrichment');
    expect(out).toContain('skills.sh unavailable');
    expect(out).toContain('deps.dev unavailable');
  });

  it('--json requests all enrichment sources for machine output', async () => {
    vi.mocked(discoverAll).mockResolvedValue([makeSkill()]);

    await runScan({ json: true });

    expect(enrichAllWithOutcomes).toHaveBeenCalledWith(expect.any(Array), {
      sources: ['skillsSh', 'github', 'depsdev'],
    });
  });

  it('--html requests all enrichment sources displayed in the report panel', async () => {
    await withTempDir(async (dir) => {
      vi.mocked(discoverAll).mockResolvedValue([makeSkill()]);
      const html = join(dir, 'report.html');

      await runScan({ html });

      expect(enrichAllWithOutcomes).toHaveBeenCalledWith(expect.any(Array), {
        sources: ['skillsSh', 'github', 'depsdev'],
      });
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
      vi.mocked(runRules).mockImplementation(async (path) => {
        if (path === '/tmp/errored') throw new Error('cannot scan');
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
    expect(errOut).toContain('claude-code');
  });

  it('--offline writes notice to stderr', async () => {
    vi.mocked(discoverAll).mockResolvedValue([makeSkill()]);
    await runScan({ offline: true });
    const errOut = stripAnsi(stderrChunks.join(''));
    const out = stripAnsi(stdoutChunks.join(''));
    expect(errOut).toContain('offline mode');
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
      expect(errOut).toContain('review-me: reviewer ok (1 LLM-only finding)');
      expect(process.exitCode).toBeUndefined();
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
      expect(parsed.skills[0]).not.toHaveProperty('llm_reviews');
      expect(stripAnsi(stderrChunks.join(''))).toContain('reviewer invalid-response');
    });
  });

  it('--summary --llm keeps stdout compact and puts review status on stderr', async () => {
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
      expect(stripAnsi(stdoutChunks.join(''))).not.toContain('LLM review');
      expect(stripAnsi(stderrChunks.join(''))).toContain('reviewer ok (0 LLM-only findings)');
    });
  });

  it('--html --llm writes HTML without adding LLM fields before the output contract task', async () => {
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
      expect(htmlOut).not.toContain('llmReviews');
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

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import stripAnsi from './helpers/strip-ansi.js';
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
  enrichAll: vi.fn(async (skills: Skill[]) => skills.map(() => ({}))),
}));

import { discoverAll } from '../packages/cli/src/discovery/index.js';
import { enrichAll } from '../packages/cli/src/enrich/index.js';
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
  const dir = await mkdtemp(join(tmpdir(), 'skillaudit-scan-options-'));
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
    vi.mocked(enrichAll).mockImplementation(async (skills) => skills.map(() => ({})));
  });

  afterEach(() => {
    restoreTTY();
    restoreProgressEnv();
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
    expect(enrichAll).not.toHaveBeenCalled();
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

    expect(enrichAll).toHaveBeenCalledWith(expect.any(Array), {
      sources: ['skillsSh', 'depsdev'],
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
    expect(stdout).toContain('skillaudit');
    expect(stdout).not.toContain('Scanning skills');
    expect(stderr).toContain('Scanning skills 1/2');
    expect(stderr).toContain('Scanning skills 2/2');
    expect(stderr).toContain('Enriching with skills.sh, deps.dev');
  });

  it('default scan explains when selected enrichment sources find no metadata', async () => {
    vi.mocked(discoverAll).mockResolvedValue([makeSkill()]);
    vi.mocked(enrichAll).mockResolvedValue([{}]);

    await runScan({});

    const out = stripAnsi(stdoutChunks.join(''));
    expect(out).toContain('Enrichment');
    expect(out).toContain('no metadata found');
  });

  it('default scan explains when aggregate enrichment lookup fails', async () => {
    vi.mocked(discoverAll).mockResolvedValue([makeSkill()]);
    vi.mocked(enrichAll).mockRejectedValue(new Error('timeout'));

    await runScan({});

    const out = stripAnsi(stdoutChunks.join(''));
    expect(out).toContain('Enrichment');
    expect(out).toContain('lookup failed or timed out');
  });

  it('--json requests all enrichment sources for machine output', async () => {
    vi.mocked(discoverAll).mockResolvedValue([makeSkill()]);

    await runScan({ json: true });

    expect(enrichAll).toHaveBeenCalledWith(expect.any(Array), {
      sources: ['skillsSh', 'github', 'depsdev'],
    });
  });

  it('--html requests all enrichment sources displayed in the report panel', async () => {
    await withTempDir(async (dir) => {
      vi.mocked(discoverAll).mockResolvedValue([makeSkill()]);
      const html = join(dir, 'report.html');

      await runScan({ html });

      expect(enrichAll).toHaveBeenCalledWith(expect.any(Array), {
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
      expect(out).toContain('skillaudit');
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
      makeSkill({ id: 'cursor-skill', agentId: 'cursor', name: 'cursor-skill' }),
    ]);
    await runScan({ json: true, agent: 'claude-code' });
    const out = stdoutChunks.join('');
    const json = JSON.parse(out);
    expect(json.skills).toHaveLength(1);
    expect(json.skills[0].agent_id).toBe('claude-code');
  });

  it('--agent with no matching skills exits 0 with stderr message', async () => {
    vi.mocked(discoverAll).mockResolvedValue([
      makeSkill({ id: 'cc-skill', agentId: 'claude-code', name: 'cc-skill' }),
    ]);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    await runScan({ agent: 'cursor' });
    expect(exitSpy).toHaveBeenCalledWith(0);
    const errOut = stripAnsi(stderrChunks.join(''));
    expect(errOut).toContain('"cursor"');
  });

  it('--offline writes notice to stderr', async () => {
    vi.mocked(discoverAll).mockResolvedValue([makeSkill()]);
    await runScan({ offline: true });
    const errOut = stripAnsi(stderrChunks.join(''));
    const out = stripAnsi(stdoutChunks.join(''));
    expect(errOut).toContain('offline mode');
    expect(out).not.toContain('ENRICHMENT');
  });

  it('default (no flags) renders table output without throwing', async () => {
    vi.mocked(discoverAll).mockResolvedValue([makeSkill()]);
    await runScan({});
    // table writes to stdout — just verify it wrote something
    expect(stdoutChunks.length).toBeGreaterThan(0);
  });

});

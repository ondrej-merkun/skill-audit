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

import { discoverAll } from '../packages/cli/src/discovery/index.js';
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
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('--json emits parseable JSON to stdout', async () => {
    vi.mocked(discoverAll).mockResolvedValue([makeSkill()]);
    await runScan({ json: true });
    const out = stdoutChunks.join('');
    expect(() => JSON.parse(out)).not.toThrow();
    const json = JSON.parse(out);
    expect(json.schema_version).toBe('1.0');
    expect(Array.isArray(json.skills)).toBe(true);
  });

  it('--summary emits compact summary line to stdout', async () => {
    vi.mocked(discoverAll).mockResolvedValue([makeSkill()]);
    await runScan({ summary: true });
    const out = stripAnsi(stdoutChunks.join(''));
    expect(out).toContain('skills');
    expect(out).toMatch(/PASS|REVIEW|FAIL/);
  });

  it('--json takes precedence over --summary', async () => {
    vi.mocked(discoverAll).mockResolvedValue([makeSkill()]);
    await runScan({ json: true, summary: true });
    const out = stdoutChunks.join('');
    expect(() => JSON.parse(out)).not.toThrow();
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
    expect(errOut).toContain('offline mode');
  });

  it('default (no flags) renders table output without throwing', async () => {
    vi.mocked(discoverAll).mockResolvedValue([makeSkill()]);
    await runScan({});
    // table writes to stdout — just verify it wrote something
    expect(stdoutChunks.length).toBeGreaterThan(0);
  });

  it('--deep exits 2 with the coming-soon message on stderr', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    await runScan({ deep: true });
    expect(exitSpy).toHaveBeenCalledWith(2);
    const errOut = stripAnsi(stderrChunks.join(''));
    expect(errOut).toContain('Deep mode coming soon');
    expect(errOut).toContain('Ollama');
    // discovery must not have been called — we exit before touching plugins
    expect(discoverAll).not.toHaveBeenCalled();
  });
});

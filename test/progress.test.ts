import { describe, expect, it } from 'vitest';
import {
  createProgressReporter,
  formatEnrichmentOutcome,
  formatEnrichmentSource,
  selectProgressMode,
} from '../packages/cli/src/progress.js';

describe('progress mode selection', () => {
  it('enables animation only for interactive pretty output', () => {
    expect(
      selectProgressMode({
        outputKind: 'pretty',
        stdoutIsTTY: true,
        stderrIsTTY: true,
        env: { TERM: 'xterm-256color' },
      })
    ).toBe('animated');
  });

  it('stays silent for machine-readable, file, CI, non-TTY, and dumb terminals', () => {
    const interactiveEnv = { TERM: 'xterm-256color' };
    expect(
      selectProgressMode({
        outputKind: 'json',
        stdoutIsTTY: true,
        stderrIsTTY: true,
        env: interactiveEnv,
      })
    ).toBe('silent');
    expect(
      selectProgressMode({
        outputKind: 'summary',
        stdoutIsTTY: true,
        stderrIsTTY: true,
        env: interactiveEnv,
      })
    ).toBe('silent');
    expect(
      selectProgressMode({
        outputKind: 'file',
        stdoutIsTTY: true,
        stderrIsTTY: true,
        env: interactiveEnv,
      })
    ).toBe('silent');
    expect(
      selectProgressMode({
        outputKind: 'pretty',
        stdoutIsTTY: true,
        stderrIsTTY: true,
        env: { TERM: 'xterm-256color', CI: 'true' },
      })
    ).toBe('silent');
    expect(
      selectProgressMode({
        outputKind: 'pretty',
        stdoutIsTTY: false,
        stderrIsTTY: true,
        env: interactiveEnv,
      })
    ).toBe('silent');
    expect(
      selectProgressMode({
        outputKind: 'pretty',
        stdoutIsTTY: true,
        stderrIsTTY: true,
        env: { TERM: 'dumb' },
      })
    ).toBe('silent');
  });

  it('uses source display names for enrichment progress', () => {
    expect(formatEnrichmentSource('skillsSh')).toBe('skills.sh');
    expect(formatEnrichmentSource('depsdev')).toBe('deps.dev');
    expect(formatEnrichmentSource('github')).toBe('GitHub');
  });

  it('renders truthful source outcome labels for enrichment progress', () => {
    expect(formatEnrichmentOutcome({ source: 'skillsSh', status: 'found' })).toBe('skills.sh ✓');
    expect(formatEnrichmentOutcome({ source: 'depsdev', status: 'no-metadata' })).toBe(
      'deps.dev no metadata'
    );
    expect(formatEnrichmentOutcome({ source: 'github', status: 'unavailable' })).toBe(
      'GitHub unavailable'
    );
    expect(formatEnrichmentOutcome({ source: 'skillsSh', status: 'skipped-offline' })).toBe(
      'skills.sh skipped'
    );
  });

  it('renders agent-specific discovery status instead of leaving a stale broad label', () => {
    const writes: string[] = [];
    const stream = {
      write(chunk: string) {
        writes.push(String(chunk));
        return true;
      },
    } as NodeJS.WritableStream;
    const progress = createProgressReporter({ mode: 'animated', unicode: false, stream });

    progress.onDiscoveryProgress({ type: 'start', pluginCount: 2 });
    progress.onDiscoveryProgress({
      type: 'checking-agent',
      agentId: 'plugin-a',
      displayName: 'Plugin A',
    });
    progress.onDiscoveryProgress({
      type: 'agent-status',
      agentId: 'plugin-a',
      displayName: 'Plugin A',
      message: 'Searching Plugin A skills...',
    });
    progress.onDiscoveryProgress({
      type: 'agent-skipped',
      agentId: 'plugin-a',
      displayName: 'Plugin A',
    });

    const out = writes.join('');
    expect(out).toContain('Searching Plugin A skills...');
    expect(out).toContain('Skipping Plugin A (not installed)');
  });

  it('renders ASCII progress when unicode is disabled', () => {
    const writes: string[] = [];
    const stream = {
      write(chunk: string) {
        writes.push(String(chunk));
        return true;
      },
    } as NodeJS.WritableStream;
    const progress = createProgressReporter({ mode: 'animated', unicode: false, stream });

    progress.startScan(2);
    progress.updateScan(1, 2, 'alpha');
    progress.updateScan(2, 2, 'beta');
    progress.succeedScan(2);

    const out = writes.join('');
    expect(out).toContain('[#####.....] Scanning skills 1/2');
    expect(out).toContain('[##########] Scanning skills 2/2');
    expect(out).toContain('Scan complete: 2 skills checked');
  });

  it('renders ASCII LLM review progress when unicode is disabled', () => {
    const writes: string[] = [];
    const stream = {
      write(chunk: string) {
        writes.push(String(chunk));
        return true;
      },
    } as NodeJS.WritableStream;
    const progress = createProgressReporter({ mode: 'animated', unicode: false, stream });

    progress.startLlmReview(2);
    progress.updateLlmReview(1, 2, 'alpha');
    progress.updateLlmReview(2, 2, 'beta');
    progress.succeedLlmReview(2);

    const out = writes.join('');
    expect(out).toContain('[#####.....] LLM review 1/2 skills - alpha');
    expect(out).toContain('[##########] LLM review 2/2 skills - beta');
    expect(out).toContain('LLM review complete: 2 skills reviewed');
  });
});

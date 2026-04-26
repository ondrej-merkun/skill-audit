import ora from 'ora';
import type { Ora, Spinner } from 'ora';
import type { EnrichmentSource } from './enrich/index.js';

export type ProgressMode = 'animated' | 'silent';
export type ProgressOutputKind = 'pretty' | 'json' | 'summary' | 'file';

export type ProgressModeOptions = {
  outputKind: ProgressOutputKind;
  stdoutIsTTY: boolean;
  stderrIsTTY: boolean;
  env?: NodeJS.ProcessEnv;
};

export type DiscoveryProgressEvent =
  | { type: 'start'; pluginCount: number }
  | { type: 'checking-agent'; agentId: string; displayName: string }
  | { type: 'agent-skipped'; agentId: string; displayName: string }
  | { type: 'agent-done'; agentId: string; displayName: string; skillCount: number }
  | { type: 'complete'; skillCount: number; agentCount: number };

export type DiscoveryProgressCallback = (event: DiscoveryProgressEvent) => void;

type ProgressReporterOptions = {
  mode?: ProgressMode;
  unicode?: boolean;
  stream?: NodeJS.WritableStream;
};

const DISCOVERY_UNICODE_FRAMES = [
  '🕵️··········',
  '··🕵️········',
  '····🕵️······',
  '······🕵️····',
  '········🕵️··',
  '··········🕵️',
];

const DISCOVERY_ASCII_FRAMES = [
  '>..........',
  '..>........',
  '....>......',
  '......>....',
  '........>..',
  '..........>',
];

const STATIC_UNICODE_SPINNER: Spinner = { frames: ['🔎'], interval: 120 };
const STATIC_ASCII_SPINNER: Spinner = { frames: ['>'], interval: 120 };

function isTruthyEnv(value: string | undefined): boolean {
  return value !== undefined && value !== '' && value !== '0' && value.toLowerCase() !== 'false';
}

export function selectProgressMode(options: ProgressModeOptions): ProgressMode {
  const env = options.env ?? process.env;
  if (options.outputKind !== 'pretty') return 'silent';
  if (!options.stdoutIsTTY || !options.stderrIsTTY) return 'silent';
  if (isTruthyEnv(env.CI)) return 'silent';
  if (env.TERM === 'dumb') return 'silent';
  return 'animated';
}

export function supportsUnicode(env: NodeJS.ProcessEnv = process.env): boolean {
  if (isTruthyEnv(env.SKILLAUDIT_ASCII)) return false;
  if (env.TERM === 'dumb') return false;
  if (process.platform !== 'win32') return true;
  return env.WT_SESSION !== undefined || env.TERM_PROGRAM === 'vscode';
}

export function formatEnrichmentSource(source: EnrichmentSource): string {
  if (source === 'skillsSh') return 'skills.sh';
  if (source === 'depsdev') return 'deps.dev';
  return 'github';
}

function skillNoun(count: number): string {
  return count === 1 ? 'skill' : 'skills';
}

function agentNoun(count: number): string {
  return count === 1 ? 'agent' : 'agents';
}

function progressBar(completed: number, total: number, unicode: boolean): string {
  const width = 10;
  const boundedTotal = Math.max(total, 1);
  const filled = Math.min(width, Math.max(0, Math.round((completed / boundedTotal) * width)));
  const fillChar = unicode ? '█' : '#';
  const emptyChar = unicode ? '░' : '.';
  return `[${fillChar.repeat(filled)}${emptyChar.repeat(width - filled)}]`;
}

export type ProgressReporter = {
  onDiscoveryProgress: DiscoveryProgressCallback;
  startScan(total: number): void;
  updateScan(completed: number, total: number, skillName: string): void;
  succeedScan(total: number): void;
  failScan(text?: string): void;
  startEnrichment(sources: EnrichmentSource[]): void;
  succeedEnrichment(sources: EnrichmentSource[]): void;
  warnEnrichment(text?: string): void;
};

export function createProgressReporter(options: ProgressReporterOptions = {}): ProgressReporter {
  const mode = options.mode ?? 'silent';
  const unicode = options.unicode ?? supportsUnicode();
  const stream = options.stream ?? process.stderr;
  let spinner: Ora | null = null;

  function start(text: string, spinnerFrames: Spinner): void {
    if (mode === 'silent') return;
    spinner = ora({
      text,
      spinner: spinnerFrames,
      stream,
      isEnabled: true,
      hideCursor: false,
    }).start();
  }

  function update(text: string): void {
    if (spinner === null) return;
    spinner.text = text;
    spinner.render();
  }

  function succeed(text: string): void {
    if (spinner === null) return;
    spinner.succeed(text);
    spinner = null;
  }

  function fail(text: string): void {
    if (spinner === null) return;
    spinner.fail(text);
    spinner = null;
  }

  function warn(text: string): void {
    if (spinner === null) return;
    spinner.warn(text);
    spinner = null;
  }

  return {
    onDiscoveryProgress(event) {
      if (event.type === 'start') {
        start('Opening the case file...', {
          frames: unicode ? DISCOVERY_UNICODE_FRAMES : DISCOVERY_ASCII_FRAMES,
          interval: 120,
        });
        return;
      }
      if (event.type === 'checking-agent') {
        update(`Checking ${event.displayName}...`);
        return;
      }
      if (event.type === 'complete') {
        succeed(
          `Found ${event.skillCount} ${skillNoun(event.skillCount)} across ${event.agentCount} ${agentNoun(event.agentCount)}`
        );
      }
    },
    startScan(total) {
      start(
        `${progressBar(0, total, unicode)} Scanning skills 0/${total}`,
        unicode ? STATIC_UNICODE_SPINNER : STATIC_ASCII_SPINNER
      );
    },
    updateScan(completed, total, skillName) {
      update(
        `${progressBar(completed, total, unicode)} Scanning skills ${completed}/${total} - ${skillName}`
      );
    },
    succeedScan(total) {
      succeed(`Scan complete: ${total} ${skillNoun(total)} checked`);
    },
    failScan(text = 'Scan failed') {
      fail(text);
    },
    startEnrichment(sources) {
      const names = sources.map(formatEnrichmentSource).join(', ');
      start(
        `Enriching with ${names}`,
        unicode ? { frames: ['⠋', '⠙', '⠹', '⠸'], interval: 80 } : STATIC_ASCII_SPINNER
      );
    },
    succeedEnrichment(sources) {
      const done = sources.map((source) => `${formatEnrichmentSource(source)} ✓`).join('  ');
      succeed(`Enrichment complete: ${done}`);
    },
    warnEnrichment(text = 'Enrichment failed (continuing)') {
      warn(text);
    },
  };
}

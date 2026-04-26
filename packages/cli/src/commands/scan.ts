import { writeFile } from 'node:fs/promises';
import { stripVTControlCharacters } from 'node:util';
import { loadIgnoreList } from '../allowlist/ignore.js';
import { clearPlugins, discoverAll, initDefaultPlugins } from '../discovery/index.js';
import { enrichAll } from '../enrich/index.js';
import type { EnrichmentSource } from '../enrich/index.js';
import { renderHtml } from '../output/html.js';
import { renderJson } from '../output/json.js';
import { sortScanSkills } from '../output/sort.js';
import { renderSummaryCompact } from '../output/summary.js';
import { renderTableToString } from '../output/table.js';
import { calculateCompromisedPercent } from '../percent.js';
import {
  type ProgressOutputKind,
  createProgressReporter,
  selectProgressMode,
} from '../progress.js';
import { runRules } from '../rules/engine.js';
import { ALL_RULES } from '../rules/index.js';
import { scoreFindings } from '../score.js';
import type {
  AgentInfo,
  Enrichment,
  EnrichmentStatus,
  ScanResult,
  ScannedSkill,
  Skill,
  Verdict,
} from '../types.js';

const TOOL_VERSION = '0.1.0';

export function computeExitCode(
  verdict: Verdict,
  options: { failOn?: string; strict?: boolean },
  incomplete = false
): number {
  // strict promotes REVIEW to FAIL for exit code purposes
  const threshold = options.strict ? 'REVIEW' : (options.failOn?.toUpperCase() ?? 'FAIL');
  const triggersExit1 = threshold === 'REVIEW' ? verdict !== 'PASS' : verdict === 'FAIL';
  if (triggersExit1) return 1;
  // incomplete scan with no failures → signal partial results
  if (incomplete) return 3;
  return 0;
}

export type ScanOptions = {
  json: boolean;
  summary: boolean;
  html: string | undefined;
  output: string | undefined;
  offline: boolean;
  strict: boolean;
  agent: string | undefined;
  failOn: string | undefined;
};

const DEFAULT_OPTIONS: ScanOptions = {
  json: false,
  summary: false,
  html: undefined,
  output: undefined,
  offline: false,
  strict: false,
  agent: undefined,
  failOn: undefined,
};

const SCAN_CONCURRENCY = 8;
const SUPPORTED_SCAN_AGENTS = new Set([
  'claude-code',
  'cursor',
  'copilot',
  'codex',
  'gemini',
  'cross-agent',
]);

export function selectScanEnrichmentSources(
  options: Pick<ScanOptions, 'json' | 'summary' | 'html'>
): EnrichmentSource[] {
  if (options.summary) return [];
  if (options.json || options.html !== undefined) return ['skillsSh', 'github', 'depsdev'];
  return ['skillsSh', 'depsdev'];
}

function renderScanPayload(
  result: ScanResult,
  options: Pick<ScanOptions, 'json' | 'summary'>
): string {
  if (options.json) {
    return `${renderJson(result)}\n`;
  }
  if (options.summary) {
    return renderSummaryCompact(result);
  }
  return renderTableToString(result);
}

function hasEnrichmentData(enrichment: Enrichment): boolean {
  return (
    enrichment.skillsSh !== undefined ||
    enrichment.github !== undefined ||
    enrichment.depsdev !== undefined
  );
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<R>,
  onComplete?: (result: R, item: T, index: number) => void
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      const item = items[index];
      if (item !== undefined) {
        const result = await mapper(item);
        results[index] = result;
        onComplete?.(result, item, index);
      }
    }
  }

  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

function scanProgressOutputKind(options: ScanOptions): ProgressOutputKind {
  if (options.json) return 'json';
  if (options.summary) return 'summary';
  if (options.output !== undefined || options.html !== undefined) return 'file';
  return 'pretty';
}

export async function runScan(opts: Partial<ScanOptions> = {}): Promise<void> {
  const options: ScanOptions = { ...DEFAULT_OPTIONS, ...opts };

  if (options.html !== undefined && options.output !== undefined) {
    process.stderr.write(
      '[skill-audit] cannot combine --html and --output; choose one destination\n'
    );
    process.exit(2);
    return; // unreachable in production; allows mocked exit in tests
  }

  if (options.agent !== undefined && !SUPPORTED_SCAN_AGENTS.has(options.agent)) {
    process.stderr.write(
      `[skill-audit] unsupported agent "${options.agent}". Supported agents: ${[...SUPPORTED_SCAN_AGENTS].join(', ')}\n`
    );
    process.exit(2);
    return; // unreachable in production; allows mocked exit in tests
  }

  const startedAt = new Date().toISOString();
  const start = Date.now();

  clearPlugins();
  initDefaultPlugins();

  const progress = createProgressReporter({
    mode: selectProgressMode({
      outputKind: scanProgressOutputKind(options),
      stdoutIsTTY: process.stdout.isTTY === true,
      stderrIsTTY: process.stderr.isTTY === true,
    }),
  });

  let skills: Skill[];
  try {
    skills = await discoverAll({
      ...(options.agent !== undefined ? { agent: options.agent } : {}),
      onProgress: progress.onDiscoveryProgress,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[skill-audit] ${msg}\n`);
    process.exit(2);
  }

  if (options.offline) {
    process.stderr.write('[skill-audit] offline mode — enrichment skipped\n');
  }

  if (skills.length === 0) {
    process.stdout.write(
      options.agent === undefined
        ? 'No skills found. Install some agent skills and try again.\n'
        : `No skills found for agent "${options.agent}". Install or enable skills for that agent and try again.\n`
    );
    return;
  }

  const ignoreList = await loadIgnoreList();

  const toScan = skills.filter((s) => !ignoreList.has(s.treeSha256));
  const ignoredSkills = skills.filter((s) => ignoreList.has(s.treeSha256));

  if (ignoredSkills.length > 0) {
    process.stderr.write(
      `[skill-audit] ignoring ${ignoredSkills.length} skill${ignoredSkills.length === 1 ? '' : 's'} (run with --all to include)\n`
    );
  }

  progress.startScan(toScan.length);

  const scannedSkills: ScannedSkill[] = [];
  const agentMap = new Map<string, number>();
  let incompleteCount = 0;
  let completedScans = 0;

  // Ignored skills appear in output with no findings and ignored: true
  for (const skill of ignoredSkills) {
    const summary = scoreFindings([], skill.treeSha256);
    scannedSkills.push({ ...skill, findings: [], enrichment: {}, summary, ignored: true });
    agentMap.set(skill.agentId, (agentMap.get(skill.agentId) ?? 0) + 1);
  }

  const scanOutcomes = await mapWithConcurrency(
    toScan,
    SCAN_CONCURRENCY,
    async (skill): Promise<{ skill: Skill; scannedSkill?: ScannedSkill; error?: string }> => {
      try {
        const findings = await runRules(skill.path, ALL_RULES);
        const summary = scoreFindings(findings, skill.treeSha256);
        return { skill, scannedSkill: { ...skill, findings, enrichment: {}, summary } };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { skill, error: msg };
      }
    },
    (_outcome, skill) => {
      completedScans++;
      progress.updateScan(completedScans, toScan.length, skill.name);
    }
  );

  for (const outcome of scanOutcomes) {
    if (outcome.scannedSkill !== undefined) {
      scannedSkills.push(outcome.scannedSkill);
      agentMap.set(outcome.skill.agentId, (agentMap.get(outcome.skill.agentId) ?? 0) + 1);
    } else {
      incompleteCount++;
      process.stderr.write(`[skill-audit] skipping "${outcome.skill.name}": ${outcome.error}\n`);
    }
  }

  progress.succeedScan(toScan.length);

  const enrichmentSources = selectScanEnrichmentSources(options);
  let enrichmentStatus: EnrichmentStatus = options.offline ? 'skipped-offline' : 'not-run';
  if (!options.offline && scannedSkills.length > 0 && enrichmentSources.length > 0) {
    progress.startEnrichment(enrichmentSources);
    try {
      const enrichments = await enrichAll(scannedSkills, { sources: enrichmentSources });
      let foundMetadata = false;
      for (let i = 0; i < scannedSkills.length; i++) {
        const s = scannedSkills[i];
        const e = enrichments[i];
        if (s !== undefined && e !== undefined) {
          scannedSkills[i] = { ...s, enrichment: e };
          if (hasEnrichmentData(e)) foundMetadata = true;
        }
      }
      enrichmentStatus = foundMetadata ? 'found' : 'no-metadata';
      progress.succeedEnrichment(enrichmentSources);
    } catch {
      enrichmentStatus = 'unavailable';
      progress.warnEnrichment();
    }
  }

  const durationMs = Date.now() - start;

  const agents: AgentInfo[] = [...agentMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, count]) => ({
      id,
      installed: true,
      skillsScanned: count,
    }));

  const sortedScannedSkills = sortScanSkills(scannedSkills);
  const activeSkills = sortedScannedSkills.filter((s) => !s.ignored);
  const compromised = activeSkills.filter((s) => s.summary.verdict === 'FAIL').length;
  const overallVerdict = activeSkills.some((s) => s.summary.verdict === 'FAIL')
    ? 'FAIL'
    : activeSkills.some((s) => s.summary.verdict === 'REVIEW')
      ? 'REVIEW'
      : 'PASS';

  const result: ScanResult = {
    schemaVersion: '1.0',
    scan: { startedAt, durationMs, toolVersion: TOOL_VERSION },
    agents,
    skills: sortedScannedSkills,
    summary: {
      skillsScanned: toScan.length,
      compromised,
      percentCompromised: calculateCompromisedPercent(compromised, toScan.length),
      verdict: overallVerdict,
    },
    enrichmentStatus,
  };

  if (options.html !== undefined) {
    const htmlOut = renderHtml(result);
    await writeFile(options.html, htmlOut, 'utf-8');
    process.stderr.write(`[skill-audit] HTML report written to ${options.html}\n`);
    process.stdout.write(renderScanPayload(result, options));
  } else {
    const payload = renderScanPayload(result, options);
    if (options.output !== undefined) {
      await writeFile(options.output, stripVTControlCharacters(payload), 'utf-8');
      process.stderr.write(`[skill-audit] report written to ${options.output}\n`);
    } else {
      process.stdout.write(payload);
    }
  }

  const exitOpts: { failOn?: string; strict?: boolean } = {};
  if (options.failOn !== undefined) exitOpts.failOn = options.failOn;
  if (options.strict) exitOpts.strict = options.strict;
  const exitCode = computeExitCode(overallVerdict, exitOpts, incompleteCount > 0);
  if (exitCode !== 0) {
    process.exitCode = exitCode;
  }
}

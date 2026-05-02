import { writeFile } from 'node:fs/promises';
import { stripVTControlCharacters } from 'node:util';
import { SUPPORTED_AGENT_IDS, formatSupportedAgentIds } from '../agent-names.js';
import { loadIgnoreList } from '../allowlist/ignore.js';
import { clearPlugins, discoverAll, initDefaultPlugins } from '../discovery/index.js';
import {
  ENRICHMENT_ENABLED,
  enrichAllWithOutcomes,
  skippedEnrichmentOutcomes,
  summarizeEnrichmentOutcomes,
} from '../enrich/index.js';
import type { EnrichmentSource } from '../enrich/index.js';
import { loadLlmRegistry } from '../llm/config.js';
import type { LocalLlmConfig } from '../llm/config.js';
import { LLM_REVIEW_PROMPT_VERSION, buildLlmReviewPayload } from '../llm/prompt.js';
import { reviewWithOpenAiCompatibleModel } from '../llm/review.js';
import type { LlmReviewFetch } from '../llm/review.js';
import { renderHtml } from '../output/html.js';
import { renderJson } from '../output/json.js';
import { sortScanSkills } from '../output/sort.js';
import { renderSummaryCompact } from '../output/summary.js';
import { renderTableToString } from '../output/table.js';
import { calculateCompromisedPercent } from '../percent.js';
import {
  type ProgressOutputKind,
  type ProgressReporter,
  createProgressReporter,
  selectProgressMode,
} from '../progress.js';
import { runRules } from '../rules/engine.js';
import { ALL_RULES } from '../rules/index.js';
import { withSecurityEducationContextFinding } from '../rules/security-education.js';
import { scoreFindings } from '../score.js';
import type {
  AgentInfo,
  EnrichmentSourceOutcome,
  EnrichmentStatus,
  LlmReviewResult,
  ScanResult,
  ScannedSkill,
  Skill,
  Verdict,
} from '../types.js';
import { VERSION } from '../version.js';

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
  includeMarketplaces: boolean;
  llm: string | string[] | undefined;
  llmFetchImpl: LlmReviewFetch | undefined;
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
  includeMarketplaces: false,
  llm: undefined,
  llmFetchImpl: undefined,
};

const SCAN_CONCURRENCY = 8;
const LLM_REVIEW_DETAILS_HINT =
  '[skill-audit] LLM review: details: rerun this scan with --json or --html report.html to inspect LLM-only finding details\n';
const SUPPORTED_SCAN_AGENTS: ReadonlySet<string> = new Set(SUPPORTED_AGENT_IDS);

export function selectScanEnrichmentSources(
  options: Pick<ScanOptions, 'json' | 'summary' | 'html'>
): EnrichmentSource[] {
  if (!ENRICHMENT_ENABLED) return [];
  if (options.summary) return [];
  if (options.json || options.html !== undefined) return ['skillsSh', 'github', 'depsdev'];
  return ['skillsSh', 'github', 'depsdev'];
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

function summarizeOutcomesBySource(
  outcomes: EnrichmentSourceOutcome[],
  sources: EnrichmentSource[]
): EnrichmentSourceOutcome[] {
  const rank: Record<EnrichmentSourceOutcome['status'], number> = {
    found: 0,
    'stale-cache': 1,
    unavailable: 2,
    'no-input': 3,
    'no-metadata': 4,
    'skipped-offline': 5,
  };
  return sources.map((source) => {
    const sourceOutcomes = outcomes.filter((o) => o.source === source);
    return (
      sourceOutcomes.sort((a, b) => rank[a.status] - rank[b.status])[0] ?? {
        source,
        status: 'no-metadata',
        reason: 'no metadata found',
      }
    );
  });
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

function parseLlmSelections(selection: string | string[]): string[] {
  const selections = Array.isArray(selection) ? selection : [selection];
  const names: string[] = [];
  for (const entry of selections) {
    for (const name of entry.split(',')) {
      const trimmed = name.trim();
      if (trimmed !== '') names.push(trimmed);
    }
  }
  return [...new Set(names)];
}

async function loadSelectedLlmConfigs(selection: string | string[]): Promise<LocalLlmConfig[]> {
  const selectedNames = parseLlmSelections(selection);
  if (selectedNames.length === 0) throw new Error('at least one local LLM name is required');

  const registry = await loadLlmRegistry();
  const enabledModels = registry.models.filter((model) => model.disabled !== true);
  const selectedConfigs =
    selectedNames.length === 1 && selectedNames[0] === 'all'
      ? enabledModels
      : selectedNames.map((name) => {
          const config = registry.models.find((model) => model.name === name);
          if (config === undefined) throw new Error(`local LLM "${name}" is not configured`);
          if (config.disabled === true) throw new Error(`local LLM "${name}" is disabled`);
          return config;
        });

  if (selectedConfigs.length === 0) throw new Error('no enabled local LLMs are configured');
  return [...selectedConfigs].sort((a, b) => a.name.localeCompare(b.name));
}

function llmStatusLine(result: LlmReviewResult): string {
  if (result.status === 'ok') {
    const marker = result.findings.length === 0 ? '✅' : '❌';
    return `${marker} ${result.modelName} ok (${result.findings.length} LLM-only finding${result.findings.length === 1 ? '' : 's'})`;
  }
  return `${result.modelName} ${result.status}`;
}

async function reviewSkillsWithLlm(
  skills: ScannedSkill[],
  configs: LocalLlmConfig[],
  fetchImpl: LlmReviewFetch | undefined,
  progress: ProgressReporter
): Promise<ScannedSkill[]> {
  const reviewed: ScannedSkill[] = [];
  const reviewableTotal = skills.filter((skill) => skill.ignored !== true).length;
  const contextTokens = configs
    .map((config) => config.contextTokens)
    .filter((value): value is number => value !== undefined)
    .sort((a, b) => a - b)[0];
  let completedReviews = 0;
  let hasLlmOnlyFindings = false;

  if (reviewableTotal > 0) progress.startLlmReview(reviewableTotal);
  for (const skill of skills) {
    if (skill.ignored === true) {
      reviewed.push(skill);
      continue;
    }
    const payload = await buildLlmReviewPayload(
      skill,
      contextTokens !== undefined ? { contextTokens } : {}
    );
    const results = (
      await Promise.all(
        configs.map((config) => reviewWithOpenAiCompatibleModel(config, payload, fetchImpl))
      )
    ).sort((a, b) => a.modelName.localeCompare(b.modelName));
    reviewed.push({ ...skill, llmReviews: results });
    completedReviews++;
    progress.updateLlmReview(completedReviews, reviewableTotal, skill.name);
    for (const result of results) {
      if (result.status === 'ok' && result.findings.length > 0) {
        hasLlmOnlyFindings = true;
      }
      process.stderr.write(
        `[skill-audit] LLM review ${completedReviews}/${reviewableTotal}: ${skill.name}: ${llmStatusLine(result)}\n`
      );
    }
  }
  if (reviewableTotal > 0) progress.succeedLlmReview(reviewableTotal);
  if (hasLlmOnlyFindings) {
    process.stderr.write(LLM_REVIEW_DETAILS_HINT);
  }
  return reviewed;
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
      `[skill-audit] unsupported agent "${options.agent}". Supported agents: ${formatSupportedAgentIds()}\n`
    );
    process.exit(2);
    return; // unreachable in production; allows mocked exit in tests
  }

  let selectedLlmConfigs: LocalLlmConfig[] = [];
  if (options.llm !== undefined) {
    try {
      selectedLlmConfigs = await loadSelectedLlmConfigs(options.llm);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[skill-audit] ${msg}\n`);
      process.exit(2);
      return; // unreachable in production; allows mocked exit in tests
    }
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
      ...(options.includeMarketplaces ? { includeMarketplaces: true } : {}),
      onProgress: progress.onDiscoveryProgress,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[skill-audit] ${msg}\n`);
    process.exit(2);
  }

  if (options.offline && ENRICHMENT_ENABLED) {
    process.stderr.write('[skill-audit] offline mode — enrichment skipped\n');
  }
  if (options.offline) {
    if (selectedLlmConfigs.length > 0) {
      process.stderr.write('[skill-audit] offline mode — LLM review skipped\n');
    }
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
        const findings = withSecurityEducationContextFinding(
          skill,
          await runRules(skill.path, ALL_RULES)
        );
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

  if (selectedLlmConfigs.length > 0 && !options.offline && scannedSkills.length > 0) {
    const modelSummary = selectedLlmConfigs
      .map((config) => `${config.name} (${config.model})`)
      .join(', ');
    process.stderr.write(
      `[skill-audit] LLM review: ${modelSummary}, prompt ${LLM_REVIEW_PROMPT_VERSION}\n`
    );
    const reviewedSkills = await reviewSkillsWithLlm(
      scannedSkills,
      selectedLlmConfigs,
      options.llmFetchImpl,
      progress
    );
    scannedSkills.splice(0, scannedSkills.length, ...reviewedSkills);
  }

  const enrichmentSources = selectScanEnrichmentSources(options);
  let enrichmentStatus: EnrichmentStatus =
    ENRICHMENT_ENABLED && options.offline ? 'skipped-offline' : 'not-run';
  let enrichmentOutcomes: EnrichmentSourceOutcome[] | undefined;
  if (ENRICHMENT_ENABLED && options.offline && enrichmentSources.length > 0) {
    enrichmentOutcomes = skippedEnrichmentOutcomes(enrichmentSources);
  }
  if (
    ENRICHMENT_ENABLED &&
    !options.offline &&
    scannedSkills.length > 0 &&
    enrichmentSources.length > 0
  ) {
    progress.startEnrichment(enrichmentSources);
    const enrichments = await enrichAllWithOutcomes(scannedSkills, { sources: enrichmentSources });
    const allOutcomes: EnrichmentSourceOutcome[] = [];
    for (let i = 0; i < scannedSkills.length; i++) {
      const s = scannedSkills[i];
      const e = enrichments[i];
      if (s !== undefined && e !== undefined) {
        scannedSkills[i] = {
          ...s,
          enrichment: e.enrichment,
          enrichmentOutcomes: e.outcomes,
        };
        allOutcomes.push(...e.outcomes);
      }
    }
    enrichmentOutcomes = summarizeOutcomesBySource(allOutcomes, enrichmentSources);
    enrichmentStatus = summarizeEnrichmentOutcomes(enrichmentOutcomes);
    progress.succeedEnrichment(enrichmentOutcomes);
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
    scan: { startedAt, durationMs, toolVersion: VERSION },
    agents,
    skills: sortedScannedSkills,
    summary: {
      skillsScanned: toScan.length,
      compromised,
      percentCompromised: calculateCompromisedPercent(compromised, toScan.length),
      verdict: overallVerdict,
    },
    enrichmentStatus,
    ...(enrichmentOutcomes !== undefined ? { enrichmentOutcomes } : {}),
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

import { writeFile } from 'node:fs/promises';
import { stripVTControlCharacters } from 'node:util';
import { formatSupportedAgentIds, SUPPORTED_AGENT_IDS } from '../agent-names.js';
import { getIgnoreListPath, loadIgnoreList } from '../allowlist/ignore.js';
import { clearPlugins, discoverAll, initDefaultPlugins } from '../discovery/index.js';
import type { LocalLlmConfig } from '../llm/config.js';
import type { LlmReviewFetch } from '../llm/review.js';
import {
  LLM_REVIEW_PROMPT_VERSION,
  loadSelectedLlmConfigs,
  reviewSkillsWithLlm,
} from '../llm/run.js';
import { skillAgentIds } from '../output/agents.js';
import { renderHtml } from '../output/html.js';
import { renderJson } from '../output/json.js';
import { renderSarif } from '../output/sarif.js';
import { sortScanSkills } from '../output/sort.js';
import { renderSummaryCompact } from '../output/summary.js';
import { renderTableToString } from '../output/table.js';
import { calculateCompromisedPercent } from '../percent.js';
import {
  createProgressReporter,
  type ProgressOutputKind,
  selectProgressMode,
} from '../progress.js';
import { collectScanTargetPaths, runRulesForSkill } from '../rules/engine.js';
import { ALL_RULES } from '../rules/index.js';
import { withSecurityEducationContextFinding } from '../rules/security-education.js';
import { scoreFindings } from '../score.js';
import type { AgentInfo, ScannedSkill, ScanResult, Skill, Verdict } from '../types.js';
import { VERSION } from '../version.js';
import { findSkillByNameOrId } from './skill-match.js';

const INCOMPLETE_SCAN_EXIT_CODE = 3;

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
  if (incomplete) return INCOMPLETE_SCAN_EXIT_CODE;
  return 0;
}

export type ScanOptions = {
  json: boolean;
  summary: boolean;
  html: string | undefined;
  output: string | undefined;
  // `true` makes SARIF the stdout payload. A path writes SARIF there beside the selected payload.
  sarif: string | true | undefined;
  offline: boolean;
  strict: boolean;
  agent: string | undefined;
  skill: string | undefined;
  failOn: string | undefined;
  includeMarketplaces: boolean;
  scanAllSupportingFiles: boolean;
  llm: string | string[] | undefined;
  llmFetchImpl: LlmReviewFetch | undefined;
};

const DEFAULT_OPTIONS: ScanOptions = {
  json: false,
  summary: false,
  html: undefined,
  output: undefined,
  sarif: undefined,
  offline: false,
  strict: false,
  agent: undefined,
  skill: undefined,
  failOn: undefined,
  includeMarketplaces: false,
  scanAllSupportingFiles: false,
  llm: undefined,
  llmFetchImpl: undefined,
};

const SCAN_CONCURRENCY = 8;
const SUPPORTED_SCAN_AGENTS: ReadonlySet<string> = new Set(SUPPORTED_AGENT_IDS);

function renderScanPayload(
  result: ScanResult,
  options: Pick<ScanOptions, 'json' | 'summary' | 'sarif'>
): string {
  if (options.sarif === true) {
    return `${renderSarif(result, scanProjectRoot())}\n`;
  }
  if (options.json) {
    return `${renderJson(result)}\n`;
  }
  if (options.summary) {
    return renderSummaryCompact(result);
  }
  return renderTableToString(result);
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

// The project directory that discovery searches. SKILL_AUDIT_CWD lets tests inject it.
function scanProjectRoot(): string {
  return process.env.SKILL_AUDIT_CWD ?? process.cwd();
}

/** Writes the selected payload to `--output`, or to stdout without it. */
async function writeScanPayload(payload: string, output: string | undefined): Promise<void> {
  if (output === undefined) {
    process.stdout.write(payload);
    return;
  }
  await writeFile(output, stripVTControlCharacters(payload), 'utf-8');
  process.stderr.write(`[skill-audit] report written to ${output}\n`);
}

async function writeSarifFile(path: string, log: string): Promise<void> {
  await writeFile(path, log, 'utf-8');
  process.stderr.write(`[skill-audit] SARIF report written to ${path}\n`);
}

function scanProgressOutputKind(options: ScanOptions): ProgressOutputKind {
  if (options.json || options.sarif === true) return 'json';
  if (options.summary) return 'summary';
  if (
    options.output !== undefined ||
    options.html !== undefined ||
    typeof options.sarif === 'string'
  ) {
    return 'file';
  }
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

  if (options.sarif === true && (options.json || options.summary)) {
    process.stderr.write(
      '[skill-audit] --sarif without a file prints SARIF to stdout; it cannot combine with --json or --summary. Give --sarif a file, or choose one stdout format\n'
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

  // A failed discovery plugin hides an unknown number of skills.
  let discoveryFailureCount = 0;
  let skills: Skill[];
  try {
    skills = await discoverAll({
      ...(options.agent !== undefined ? { agent: options.agent } : {}),
      ...(options.includeMarketplaces ? { includeMarketplaces: true } : {}),
      onProgress: (event) => {
        if (event.type === 'agent-failed') discoveryFailureCount++;
        progress.onDiscoveryProgress(event);
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[skill-audit] ${msg}\n`);
    process.exit(2);
  }

  if (options.skill !== undefined) {
    const target = findSkillByNameOrId(skills, options.skill);
    if (target === undefined) {
      process.stderr.write(
        `[skill-audit] no skill matching "${options.skill}" found. Run \`skill-audit list\` to see installed skills.\n`
      );
      process.exit(1);
      return;
    }
    skills = [target];
  }

  if (options.offline) {
    if (selectedLlmConfigs.length > 0) {
      process.stderr.write('[skill-audit] offline mode — LLM review skipped\n');
    }
  }

  if (skills.length === 0) {
    const notice =
      options.agent === undefined
        ? 'No skills found. Install some agent skills and try again.\n'
        : `No skills found for agent "${options.agent}". Install or enable skills for that agent and try again.\n`;

    if (options.sarif === undefined) {
      process.stdout.write(notice);
    } else {
      // An empty SARIF log lets an upload close the alerts of skills that a project removed.
      const emptySarif = `${renderSarif({ skills: [] }, scanProjectRoot())}\n`;
      if (options.sarif === true) {
        // The log is the payload, so the notice goes to stderr.
        await writeScanPayload(emptySarif, options.output);
        process.stderr.write(notice);
      } else {
        await writeSarifFile(options.sarif, emptySarif);
        process.stdout.write(notice);
      }
    }

    if (discoveryFailureCount > 0) process.exitCode = INCOMPLETE_SCAN_EXIT_CODE;
    return;
  }

  const ignoreList = await loadIgnoreList();

  const toScan = skills.filter((s) => !ignoreList.has(s.treeSha256));
  const ignoredSkills = skills.filter((s) => ignoreList.has(s.treeSha256));

  if (ignoredSkills.length > 0) {
    // No scan flag includes ignored skills, so the notice names the ignore list file.
    const [noun, pronoun] = ignoredSkills.length === 1 ? ['skill', 'it'] : ['skills', 'one'];
    process.stderr.write(
      `[skill-audit] ignoring ${ignoredSkills.length} ${noun} (to scan ${pronoun} again, remove its line from ${getIgnoreListPath()})\n`
    );
  }

  // Only a skill that this run reports can take a nested path away from its parent, so
  // --skill makes the selected skill cover all of its folder. Ignored skills still count,
  // because the ignore list approves their content by hash.
  const scanTargetPaths = collectScanTargetPaths(skills);

  progress.startScan(toScan.length);

  const scannedSkills: ScannedSkill[] = [];
  const agentMap = new Map<string, number>();
  // Failed discovery plugins and failed skill scans both make the result incomplete.
  let incompleteCount = discoveryFailureCount;
  let completedScans = 0;

  // Ignored skills appear in output with no findings and ignored: true
  for (const skill of ignoredSkills) {
    const summary = scoreFindings([], skill.treeSha256);
    scannedSkills.push({ ...skill, findings: [], summary, ignored: true });
    for (const agentId of skillAgentIds(skill)) {
      agentMap.set(agentId, (agentMap.get(agentId) ?? 0) + 1);
    }
  }

  const scanOutcomes = await mapWithConcurrency(
    toScan,
    SCAN_CONCURRENCY,
    async (skill): Promise<{ skill: Skill; scannedSkill?: ScannedSkill; error?: string }> => {
      try {
        const findings = withSecurityEducationContextFinding(
          skill,
          await runRulesForSkill(skill, ALL_RULES, {
            scanAllSupportingFiles: options.scanAllSupportingFiles,
            scanTargetPaths,
          })
        );
        const summary = scoreFindings(findings, skill.treeSha256);
        return { skill, scannedSkill: { ...skill, findings, summary } };
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
      for (const agentId of skillAgentIds(outcome.skill)) {
        agentMap.set(agentId, (agentMap.get(agentId) ?? 0) + 1);
      }
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
      progress,
      { scanTargetPaths }
    );
    scannedSkills.splice(0, scannedSkills.length, ...reviewedSkills);
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
  };

  if (typeof options.sarif === 'string') {
    await writeSarifFile(options.sarif, `${renderSarif(result, scanProjectRoot())}\n`);
  }

  if (options.html !== undefined) {
    const htmlOut = renderHtml(result);
    await writeFile(options.html, htmlOut, 'utf-8');
    process.stderr.write(`[skill-audit] HTML report written to ${options.html}\n`);
    process.stdout.write(renderScanPayload(result, options));
  } else {
    await writeScanPayload(renderScanPayload(result, options), options.output);
  }

  const exitOpts: { failOn?: string; strict?: boolean } = {};
  if (options.failOn !== undefined) exitOpts.failOn = options.failOn;
  if (options.strict) exitOpts.strict = options.strict;
  const exitCode = computeExitCode(overallVerdict, exitOpts, incompleteCount > 0);
  if (exitCode !== 0) {
    process.exitCode = exitCode;
  }
}

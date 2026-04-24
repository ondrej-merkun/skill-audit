import ora from 'ora';
import { loadIgnoreList } from '../allowlist/ignore.js';
import { clearPlugins, discoverAll, initDefaultPlugins } from '../discovery/index.js';
import { enrichAll } from '../enrich/index.js';
import { renderJson } from '../output/json.js';
import { renderSummary } from '../output/summary.js';
import { renderTable } from '../output/table.js';
import { runRules } from '../rules/engine.js';
import { ALL_RULES } from '../rules/index.js';
import { scoreFindings } from '../score.js';
import type { AgentInfo, ScanResult, ScannedSkill, Skill, Verdict } from '../types.js';

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
  offline: boolean;
  strict: boolean;
  agent: string | undefined;
  failOn: string | undefined;
};

const DEFAULT_OPTIONS: ScanOptions = {
  json: false,
  summary: false,
  offline: false,
  strict: false,
  agent: undefined,
  failOn: undefined,
};

export async function runScan(opts: Partial<ScanOptions> = {}): Promise<void> {
  const options: ScanOptions = { ...DEFAULT_OPTIONS, ...opts };
  const startedAt = new Date().toISOString();
  const start = Date.now();

  clearPlugins();
  initDefaultPlugins();

  const discoverSpinner = ora('Discovering skills…').start();
  let skills: Skill[];
  try {
    skills = await discoverAll();
  } catch (err) {
    discoverSpinner.fail('Discovery failed');
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[skillaudit] ${msg}\n`);
    process.exit(2);
  }

  discoverSpinner.succeed(`Found ${skills.length} skill${skills.length === 1 ? '' : 's'}`);

  if (options.agent !== undefined) {
    const agentId = options.agent;
    const before = skills.length;
    skills = skills.filter((s) => s.agentId === agentId);
    if (skills.length === 0) {
      process.stderr.write(
        `[skillaudit] no skills found for agent "${agentId}" (${before} total)\n`
      );
      process.exit(0);
    }
  }

  if (options.offline) {
    process.stderr.write('[skillaudit] offline mode — enrichment skipped\n');
  }

  if (skills.length === 0) {
    process.stdout.write('No skills found. Install some agent skills and try again.\n');
    return;
  }

  const ignoreList = await loadIgnoreList();

  const toScan = skills.filter((s) => !ignoreList.has(s.treeSha256));
  const ignoredSkills = skills.filter((s) => ignoreList.has(s.treeSha256));

  if (ignoredSkills.length > 0) {
    process.stderr.write(
      `[skillaudit] ignoring ${ignoredSkills.length} skill${ignoredSkills.length === 1 ? '' : 's'} (run with --all to include)\n`
    );
  }

  const scanSpinner = ora(
    `Scanning ${toScan.length} skill${toScan.length === 1 ? '' : 's'}…`
  ).start();

  const scannedSkills: ScannedSkill[] = [];
  const agentMap = new Map<string, number>();
  let incompleteCount = 0;

  // Ignored skills appear in output with no findings and ignored: true
  for (const skill of ignoredSkills) {
    const summary = scoreFindings([], skill.treeSha256);
    scannedSkills.push({ ...skill, findings: [], enrichment: {}, summary, ignored: true });
    agentMap.set(skill.agentId, (agentMap.get(skill.agentId) ?? 0) + 1);
  }

  for (const skill of toScan) {
    try {
      const findings = await runRules(skill.path, ALL_RULES);
      const summary = scoreFindings(findings, skill.treeSha256);
      scannedSkills.push({ ...skill, findings, enrichment: {}, summary });
    } catch (err) {
      incompleteCount++;
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[skillaudit] skipping "${skill.name}": ${msg}\n`);
    }
    agentMap.set(skill.agentId, (agentMap.get(skill.agentId) ?? 0) + 1);
  }

  scanSpinner.succeed('Scan complete');

  if (!options.offline && scannedSkills.length > 0) {
    const enrichSpinner = ora('Enriching…').start();
    try {
      const enrichments = await enrichAll(scannedSkills);
      for (let i = 0; i < scannedSkills.length; i++) {
        const s = scannedSkills[i];
        const e = enrichments[i];
        if (s !== undefined && e !== undefined) {
          scannedSkills[i] = { ...s, enrichment: e };
        }
      }
      enrichSpinner.succeed('Enrichment complete');
    } catch {
      enrichSpinner.warn('Enrichment failed (continuing)');
    }
  }

  const durationMs = Date.now() - start;

  const agents: AgentInfo[] = [...agentMap.entries()].map(([id, count]) => ({
    id,
    installed: true,
    skillsScanned: count,
  }));

  const activeSkills = scannedSkills.filter((s) => !s.ignored);
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
    skills: scannedSkills,
    summary: {
      skillsScanned: toScan.length,
      compromised,
      percentCompromised: toScan.length > 0 ? Math.round((compromised / toScan.length) * 100) : 0,
      verdict: overallVerdict,
    },
  };

  if (options.json) {
    process.stdout.write(`${renderJson(result)}\n`);
  } else if (options.summary) {
    renderSummary(result);
  } else {
    renderTable(result);
  }

  const exitOpts: { failOn?: string; strict?: boolean } = {};
  if (options.failOn !== undefined) exitOpts.failOn = options.failOn;
  if (options.strict) exitOpts.strict = options.strict;
  const exitCode = computeExitCode(overallVerdict, exitOpts, incompleteCount > 0);
  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}

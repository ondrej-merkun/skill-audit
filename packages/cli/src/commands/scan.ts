import ora from 'ora';
import { clearPlugins, discoverAll, initDefaultPlugins } from '../discovery/index.js';
import { renderJson } from '../output/json.js';
import { renderSummary } from '../output/summary.js';
import { renderTable } from '../output/table.js';
import { runRules } from '../rules/engine.js';
import { ALL_RULES } from '../rules/index.js';
import { scoreFindings } from '../score.js';
import type { AgentInfo, ScanResult, ScannedSkill, Skill } from '../types.js';

const TOOL_VERSION = '0.1.0';

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

  const scanSpinner = ora(
    `Scanning ${skills.length} skill${skills.length === 1 ? '' : 's'}…`
  ).start();

  const scannedSkills: ScannedSkill[] = [];
  const agentMap = new Map<string, number>();

  for (const skill of skills) {
    const findings = await runRules(skill.path, ALL_RULES);
    const summary = scoreFindings(findings, skill.treeSha256);
    scannedSkills.push({ ...skill, findings, enrichment: {}, summary });
    agentMap.set(skill.agentId, (agentMap.get(skill.agentId) ?? 0) + 1);
  }

  scanSpinner.succeed('Scan complete');

  const durationMs = Date.now() - start;

  const agents: AgentInfo[] = [...agentMap.entries()].map(([id, count]) => ({
    id,
    installed: true,
    skillsScanned: count,
  }));

  const compromised = scannedSkills.filter((s) => s.summary.verdict === 'FAIL').length;
  const overallVerdict = scannedSkills.some((s) => s.summary.verdict === 'FAIL')
    ? 'FAIL'
    : scannedSkills.some((s) => s.summary.verdict === 'REVIEW')
      ? 'REVIEW'
      : 'PASS';

  const result: ScanResult = {
    schemaVersion: '1.0',
    scan: { startedAt, durationMs, toolVersion: TOOL_VERSION },
    agents,
    skills: scannedSkills,
    summary: {
      skillsScanned: skills.length,
      compromised,
      percentCompromised: skills.length > 0 ? Math.round((compromised / skills.length) * 100) : 0,
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
}

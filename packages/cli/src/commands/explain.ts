import chalk from 'chalk';
import ora from 'ora';
import { clearPlugins, discoverAll, initDefaultPlugins } from '../discovery/index.js';
import { enrichSkill } from '../enrich/index.js';
import { renderJson } from '../output/json.js';
import { runRules } from '../rules/engine.js';
import { ALL_RULES } from '../rules/index.js';
import { scoreFindings } from '../score.js';
import type { Enrichment, Finding, ScannedSkill, Severity, Skill, Verdict } from '../types.js';

const SEVERITY_DOT: Record<Severity, string> = {
  critical: chalk.red('🔴 CRITICAL'),
  high: chalk.yellow('🟠 HIGH'),
  medium: chalk.yellow('🟡 MEDIUM'),
  low: chalk.blue('🔵 LOW'),
  info: chalk.gray('⚪ INFO'),
};

const VERDICT_BADGE: Record<Verdict, string> = {
  PASS: chalk.green('PASS ✅'),
  REVIEW: chalk.yellow('REVIEW ⚠️'),
  FAIL: chalk.red('FAIL ❌'),
};

export type ExplainOptions = {
  offline: boolean;
  json: boolean;
};

function shortenPath(p: string): string {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? '';
  return home ? p.replace(home, '~') : p;
}

function renderFinding(f: Finding): void {
  process.stdout.write(`\n  ${SEVERITY_DOT[f.severity]}  ${f.ruleId}\n`);
  process.stdout.write(`     ${chalk.dim(`${f.file}:${f.line}`)}\n`);
  for (const line of f.snippet.split('\n')) {
    process.stdout.write(`     ${chalk.dim('│')} ${line}\n`);
  }
  process.stdout.write(`     ${chalk.cyan('→')} ${f.message}\n`);
  if (f.fix) {
    process.stdout.write(`       ${chalk.dim(f.fix)}\n`);
  }
}

function renderEnrichment(e: Enrichment): void {
  const hasAny = e.skillsSh !== undefined || e.github !== undefined || e.depsdev !== undefined;
  if (!hasAny) return;

  process.stdout.write(`\n  ${chalk.bold('Enrichment')}\n`);
  process.stdout.write(`  ${'─'.repeat(40)}\n`);

  if (e.skillsSh !== undefined) {
    const s = e.skillsSh;
    process.stdout.write(
      `  ${chalk.dim('skills.sh:')}   Gen=${s.gen}  Socket=${s.socketAlerts} alerts  Snyk=${s.snyk}\n`
    );
  }
  if (e.github !== undefined) {
    const g = e.github;
    process.stdout.write(
      `  ${chalk.dim('github.com:')}  ${g.stars} stars, ${g.ageDays} days old, ${g.contributors} contributor${g.contributors === 1 ? '' : 's'}\n`
    );
  }
  if (e.depsdev !== undefined) {
    const d = e.depsdev;
    if (d.osvAdvisories > 0) {
      process.stdout.write(
        `  ${chalk.dim('deps.dev:')}    ${chalk.yellow(`${d.osvAdvisories} OSV advisory${d.osvAdvisories === 1 ? '' : 'ies'}`)}\n`
      );
    } else {
      const depsDetail =
        d.scorecardScore !== null ? `scorecard ${d.scorecardScore}` : '0 advisories';
      process.stdout.write(`  ${chalk.dim('deps.dev:')}    ${depsDetail}\n`);
    }
  }
}

function renderDetail(skill: ScannedSkill): void {
  const { summary } = skill;
  const shortPath = shortenPath(skill.path);

  process.stdout.write(`\n${chalk.bold(skill.name)}\n`);
  process.stdout.write(`${'─'.repeat(Math.max(skill.name.length + 2, 18))}\n`);
  process.stdout.write(`  ${chalk.dim('Agent:')}     ${skill.agentId}\n`);
  process.stdout.write(`  ${chalk.dim('Path:')}      ${shortPath}\n`);

  const mandatoryNote =
    summary.mandatoryFail.length > 0
      ? `   (${summary.mandatoryFail.length} mandatory-fail trigger${summary.mandatoryFail.length === 1 ? '' : 's'})`
      : '';
  process.stdout.write(
    `  ${chalk.dim('Verdict:')}   ${VERDICT_BADGE[summary.verdict]}   Score ${summary.score}/100${mandatoryNote}\n`
  );

  const findingsBySeverity = [...skill.findings].sort((a, b) => {
    const order: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];
    return order.indexOf(a.severity) - order.indexOf(b.severity);
  });

  if (findingsBySeverity.length === 0) {
    process.stdout.write(`\n  ${chalk.green('No issues found.')}\n`);
  } else {
    for (const f of findingsBySeverity) {
      renderFinding(f);
    }
  }

  renderEnrichment(skill.enrichment);

  process.stdout.write(`\n  ${chalk.bold('Next steps')}\n`);
  process.stdout.write(`  ${'─'.repeat(40)}\n`);
  if (summary.verdict === 'FAIL') {
    process.stdout.write(
      `  ${chalk.cyan('→')}  ${chalk.dim(`rm -rf ${shortPath}`)}     ${chalk.dim('# remove now')}\n`
    );
  }
  process.stdout.write(`  ${chalk.cyan('→')}  skillaudit scan --agent ${skill.agentId} --json\n`);
  process.stdout.write('\n');
}

export async function runExplain(
  nameOrId: string,
  opts: Partial<ExplainOptions> = {}
): Promise<void> {
  const options: ExplainOptions = { offline: false, json: false, ...opts };

  clearPlugins();
  initDefaultPlugins();

  const spinner = ora('Discovering skills…').start();
  let skills: Skill[];
  try {
    skills = await discoverAll();
  } catch (err) {
    spinner.fail('Discovery failed');
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[skillaudit] ${msg}\n`);
    process.exit(2);
  }
  spinner.stop();

  const target = skills.find(
    (s) =>
      s.name.toLowerCase() === nameOrId.toLowerCase() ||
      s.id === nameOrId ||
      s.name.toLowerCase().includes(nameOrId.toLowerCase())
  );

  if (target === undefined) {
    process.stderr.write(
      `[skillaudit] no skill matching "${nameOrId}" found. Run \`skillaudit list\` to see installed skills.\n`
    );
    process.exit(1);
  }

  const scanSpinner = ora(`Scanning ${target.name}…`).start();
  let findings: Finding[];
  try {
    findings = await runRules(target.path, ALL_RULES);
  } catch (err) {
    scanSpinner.fail('Scan failed');
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[skillaudit] ${msg}\n`);
    process.exit(2);
  }
  scanSpinner.succeed('Scan complete');

  const summary = scoreFindings(findings, target.treeSha256);

  let enrichment: Enrichment = {};
  if (!options.offline) {
    const enrichSpinner = ora('Enriching…').start();
    try {
      enrichment = await enrichSkill(target);
      enrichSpinner.succeed('Enrichment complete');
    } catch {
      enrichSpinner.warn('Enrichment failed (continuing)');
    }
  }

  const scannedSkill: ScannedSkill = { ...target, findings, enrichment, summary };

  if (options.json) {
    const startedAt = new Date().toISOString();
    const jsonOutput = renderJson({
      schemaVersion: '1.0',
      scan: { startedAt, durationMs: 0, toolVersion: '0.1.0' },
      agents: [{ id: target.agentId, installed: true, skillsScanned: 1 }],
      skills: [scannedSkill],
      summary: {
        skillsScanned: 1,
        compromised: summary.verdict === 'FAIL' ? 1 : 0,
        percentCompromised: summary.verdict === 'FAIL' ? 100 : 0,
        verdict: summary.verdict,
      },
    });
    process.stdout.write(`${jsonOutput}\n`);
    return;
  }

  renderDetail(scannedSkill);

  if (summary.verdict === 'FAIL') {
    process.exit(1);
  }
}

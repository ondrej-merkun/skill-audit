import chalk from 'chalk';
import { formatAgentName } from '../agent-names.js';
import { clearPlugins, discoverAll, initDefaultPlugins } from '../discovery/index.js';
import {
  ENRICHMENT_ENABLED,
  enrichSkillWithOutcomes,
  skippedEnrichmentOutcomes,
  summarizeEnrichmentOutcomes,
} from '../enrich/index.js';
import { renderJson } from '../output/json.js';
import {
  createProgressReporter,
  formatEnrichmentOutcome,
  selectProgressMode,
} from '../progress.js';
import { runRules } from '../rules/engine.js';
import { ALL_RULES } from '../rules/index.js';
import { withSecurityEducationContextFinding } from '../rules/security-education.js';
import { scoreFindings } from '../score.js';
import type {
  Enrichment,
  EnrichmentSourceOutcome,
  EnrichmentStatus,
  Finding,
  ScannedSkill,
  Severity,
  Skill,
  Verdict,
} from '../types.js';
import { VERSION } from '../version.js';

const SEVERITY_DOT: Record<Severity, string> = {
  critical: chalk.red('🔴 CRITICAL'),
  high: chalk.yellow('🟠 HIGH'),
  medium: chalk.yellow('🟡 MEDIUM'),
  low: chalk.blue('🔵 LOW'),
  info: chalk.gray('⚪ INFO'),
};

const VERDICT_MARKER: Record<Verdict, string> = {
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
  process.stdout.write(`     ${chalk.dim('Location:')} ${f.file}:${f.line}\n`);
  process.stdout.write(`     ${chalk.dim('Evidence:')}\n`);
  for (const line of f.snippet.split('\n')) {
    process.stdout.write(`     ${chalk.dim('│')} ${line}\n`);
  }
  process.stdout.write(`     ${chalk.dim('Issue:')} ${f.message}\n`);
  if (f.fix) {
    process.stdout.write(`     ${chalk.dim('Fix:')} ${f.fix}\n`);
  }
}

function renderEnrichment(
  e: Enrichment,
  status: EnrichmentStatus,
  outcomes?: EnrichmentSourceOutcome[]
): void {
  const hasAny = e.skillsSh !== undefined || e.github !== undefined || e.depsdev !== undefined;
  if (!hasAny && status === 'not-run' && outcomes === undefined) return;

  process.stdout.write(`\n  ${chalk.bold('Enrichment')}\n`);
  process.stdout.write(`  ${'─'.repeat(40)}\n`);

  if (!hasAny && status === 'skipped-offline') {
    process.stdout.write(`  ${chalk.dim('Enrichment skipped: offline mode is active.')}\n`);
    return;
  }

  if (!hasAny && outcomes !== undefined && outcomes.length > 0) {
    process.stdout.write(`  ${chalk.dim(outcomes.map(formatEnrichmentOutcome).join('  '))}\n`);
    return;
  }

  if (!hasAny) {
    const message =
      status === 'skipped-offline'
        ? 'Enrichment skipped: offline mode is active.'
        : status === 'unavailable'
          ? 'Enrichment unavailable: lookup failed or timed out.'
          : 'Enrichment: no metadata found.';
    process.stdout.write(`  ${chalk.dim(message)}\n`);
    return;
  }

  if (e.skillsSh !== undefined) {
    const s = e.skillsSh;
    process.stdout.write(
      `  ${chalk.dim('skills.sh:')}   Gen=${s.gen}  Socket=${s.socketAlerts} alerts  Snyk=${s.snyk}\n`
    );
  }
  if (e.github !== undefined) {
    const g = e.github;
    const contributorLabel =
      g.contributors === null
        ? 'contributors unknown'
        : `${g.contributors} contributor${g.contributors === 1 ? '' : 's'}`;
    process.stdout.write(
      `  ${chalk.dim('github.com:')}  ${g.stars} stars, ${g.ageDays} days old, ${contributorLabel}\n`
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

function renderDetail(skill: ScannedSkill, enrichmentStatus: EnrichmentStatus): void {
  const { summary } = skill;
  const shortPath = shortenPath(skill.path);

  process.stdout.write(`\n${chalk.bold(skill.name)}\n`);
  process.stdout.write(`${'─'.repeat(Math.max(skill.name.length + 2, 18))}\n`);
  process.stdout.write(`  ${chalk.dim('Agent:')}     ${formatAgentName(skill.agentId)}\n`);
  process.stdout.write(`  ${chalk.dim('Path:')}      ${shortPath}\n`);

  const mandatoryNote =
    summary.mandatoryFail.length > 0
      ? `   (${summary.mandatoryFail.length} mandatory-fail trigger${summary.mandatoryFail.length === 1 ? '' : 's'})`
      : '';
  process.stdout.write(
    `  ${chalk.dim('Verdict:')}   ${VERDICT_MARKER[summary.verdict]}   Score ${summary.score}/100${mandatoryNote}\n`
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

  renderEnrichment(skill.enrichment, enrichmentStatus, skill.enrichmentOutcomes);

  process.stdout.write(`\n  ${chalk.bold('Next steps')}\n`);
  process.stdout.write(`  ${'─'.repeat(40)}\n`);
  if (summary.verdict === 'FAIL') {
    process.stdout.write(
      `  ${chalk.cyan('→')}  ${chalk.dim(`rm -rf ${shortPath}`)}     ${chalk.dim('# remove now')}\n`
    );
  }
  process.stdout.write(`  ${chalk.cyan('→')}  skill-audit scan --agent ${skill.agentId} --json\n`);
  process.stdout.write('\n');
}

export async function runExplain(
  nameOrId: string,
  opts: Partial<ExplainOptions> = {}
): Promise<void> {
  const options: ExplainOptions = { offline: false, json: false, ...opts };

  clearPlugins();
  initDefaultPlugins();

  const progress = createProgressReporter({
    mode: selectProgressMode({
      outputKind: options.json ? 'json' : 'pretty',
      stdoutIsTTY: process.stdout.isTTY === true,
      stderrIsTTY: process.stderr.isTTY === true,
    }),
  });

  let skills: Skill[];
  try {
    skills = await discoverAll({ onProgress: progress.onDiscoveryProgress });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[skill-audit] ${msg}\n`);
    process.exit(2);
  }

  const target = skills.find(
    (s) =>
      s.name.toLowerCase() === nameOrId.toLowerCase() ||
      s.id === nameOrId ||
      s.name.toLowerCase().includes(nameOrId.toLowerCase())
  );

  if (target === undefined) {
    process.stderr.write(
      `[skill-audit] no skill matching "${nameOrId}" found. Run \`skill-audit list\` to see installed skills.\n`
    );
    process.exit(1);
  }

  progress.startScan(1);
  let findings: Finding[];
  try {
    findings = withSecurityEducationContextFinding(target, await runRules(target.path, ALL_RULES));
    progress.updateScan(1, 1, target.name);
  } catch (err) {
    progress.failScan();
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[skill-audit] ${msg}\n`);
    process.exit(2);
  }
  progress.succeedScan(1);

  const summary = scoreFindings(findings, target.treeSha256);

  let enrichment: Enrichment = {};
  let enrichmentStatus: EnrichmentStatus =
    ENRICHMENT_ENABLED && options.offline ? 'skipped-offline' : 'not-run';
  const enrichmentSources = ['skillsSh', 'github', 'depsdev'] as const;
  let enrichmentOutcomes: EnrichmentSourceOutcome[] | undefined =
    ENRICHMENT_ENABLED && options.offline
      ? skippedEnrichmentOutcomes([...enrichmentSources])
      : undefined;
  if (ENRICHMENT_ENABLED && !options.offline) {
    progress.startEnrichment([...enrichmentSources]);
    const result = await enrichSkillWithOutcomes(target, { sources: [...enrichmentSources] });
    enrichment = result.enrichment;
    enrichmentOutcomes = result.outcomes;
    enrichmentStatus = summarizeEnrichmentOutcomes(result.outcomes);
    progress.succeedEnrichment(result.outcomes);
  }

  const scannedSkill: ScannedSkill = {
    ...target,
    findings,
    enrichment,
    ...(enrichmentOutcomes !== undefined ? { enrichmentOutcomes } : {}),
    summary,
  };

  if (options.json) {
    const startedAt = new Date().toISOString();
    const jsonOutput = renderJson({
      schemaVersion: '1.0',
      scan: { startedAt, durationMs: 0, toolVersion: VERSION },
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

  renderDetail(scannedSkill, enrichmentStatus);

  if (summary.verdict === 'FAIL') {
    process.exit(1);
  }
}

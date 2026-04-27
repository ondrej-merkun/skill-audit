import chalk from 'chalk';
import { formatAgentName } from '../agent-names.js';
import { formatCompromisedPercent } from '../percent.js';
import { formatEnrichmentOutcome } from '../progress.js';
import type {
  AgentInfo,
  EnrichmentSourceOutcome,
  ScanResult,
  ScannedSkill,
  Severity,
} from '../types.js';
import { installStateLabel } from './install-state.js';
import { sortScanSkills } from './sort.js';

const C_CRITICAL = chalk.hex('#FF4444');
const C_HIGH = chalk.hex('#FF8C00');
const C_MEDIUM = chalk.hex('#FFD700');
const C_PASS = chalk.hex('#4EC9B0');
const C_GREY = chalk.hex('#8B8B8B');

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

function findingsStats(skills: ScannedSkill[]): {
  affectedSkills: number;
  crit: number;
  high: number;
  med: number;
  low: number;
  info: number;
} {
  const stats = {
    affectedSkills: 0,
    crit: 0,
    high: 0,
    med: 0,
    low: 0,
    info: 0,
  };

  for (const skill of skills) {
    if (skill.findings.length === 0) continue;
    stats.affectedSkills += 1;
    const highestSeverity = skill.findings.reduce<Severity>(
      (highest, finding) =>
        SEVERITY_RANK[finding.severity] < SEVERITY_RANK[highest] ? finding.severity : highest,
      skill.findings[0]?.severity ?? 'info'
    );

    if (highestSeverity === 'critical') stats.crit += 1;
    else if (highestSeverity === 'high') stats.high += 1;
    else if (highestSeverity === 'medium') stats.med += 1;
    else if (highestSeverity === 'low') stats.low += 1;
    else stats.info += 1;
  }

  return stats;
}

function severityBreakdown(stats: ReturnType<typeof findingsStats>): string {
  const parts = [
    C_CRITICAL(`${stats.crit} critical`),
    C_HIGH(`${stats.high} high`),
    C_MEDIUM(`${stats.med} medium`),
    `${stats.low} low`,
  ];
  if (stats.info > 0) parts.push(`${stats.info} info`);
  return parts.join(', ');
}

function compactSeverityBreakdown(stats: ReturnType<typeof findingsStats>): string {
  const parts = [
    C_CRITICAL(`${stats.crit} critical`),
    C_HIGH(`${stats.high} high`),
    C_MEDIUM(`${stats.med} medium`),
    `${stats.low} low`,
  ];
  if (stats.info > 0) parts.push(`${stats.info} info`);
  return parts.join(' · ');
}

function outcomeEnrichmentLine(outcomes: EnrichmentSourceOutcome[] | undefined): string | null {
  if (outcomes === undefined || outcomes.length === 0) return null;
  return outcomes.map((outcome) => formatEnrichmentOutcome(outcome)).join('  ');
}

function enrichmentLine(skills: ScannedSkill[]): string | null {
  const hasSkillsSh = skills.some((s) => s.enrichment.skillsSh != null);
  const hasGithub = skills.some((s) => s.enrichment.github != null);
  const hasDepsDev = skills.some((s) => s.enrichment.depsdev != null);
  if (!hasSkillsSh && !hasGithub && !hasDepsDev) return null;
  const parts: string[] = [];
  if (hasSkillsSh) parts.push(`skills.sh ${C_PASS('✓')}`);
  if (hasGithub) parts.push(`GitHub ${C_PASS('✓')}`);
  if (hasDepsDev) parts.push(`deps.dev ${C_PASS('✓')}`);
  return parts.join('  ');
}

function agentCountsLine(agents: AgentInfo[]): string {
  return [...agents]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((agent) => `${formatAgentName(agent.id)}: ${agent.skillsScanned}`)
    .join(', ');
}

function installStateCounts(skills: ScannedSkill[]): { installed: number; marketplace: number } {
  return skills.reduce(
    (counts, skill) => {
      if (installStateLabel(skill.installState) === 'marketplace') counts.marketplace += 1;
      else counts.installed += 1;
      return counts;
    },
    { installed: 0, marketplace: 0 }
  );
}

/**
 * Renders the detailed scan-summary footer (used by the TUI table and --summary).
 * orderedSkills may already be sorted by the caller; this function re-sorts with the shared
 * risk order so next-command suggestions always pick the worst skill.
 */
export function renderSummaryFooter(
  result: ScanResult,
  orderedSkills: ScannedSkill[],
  boxWidth = 82
): string {
  const riskOrderedSkills = sortScanSkills(orderedSkills);
  const { scan, summary } = result;
  const stats = findingsStats(riskOrderedSkills);
  const states = installStateCounts(riskOrderedSkills);
  const hasMarketplace = states.marketplace > 0;
  const label = (s: string): string => s.padEnd(26, '.');
  const durationFull = (scan.durationMs / 1000).toFixed(2);
  const lines: string[] = [];

  lines.push(`  ── Scan summary ${'─'.repeat(Math.max(0, boxWidth - 18))}`);
  lines.push(`  ${label('Skills scanned')} ${summary.skillsScanned}`);
  if (result.agents.length > 0) {
    lines.push(`  ${label('Agents scanned')} ${agentCountsLine(result.agents)}`);
  }
  if (hasMarketplace) {
    lines.push(
      `  ${label('Install state')} installed: ${states.installed}, marketplace: ${states.marketplace}`
    );
  }
  lines.push(`  ${label('Unique issues')} ${stats.affectedSkills}  (${severityBreakdown(stats)})`);

  const compromisedStr =
    summary.compromised > 0
      ? `${C_CRITICAL(String(summary.compromised))}   (${formatCompromisedPercent(summary.percentCompromised)}% of ${hasMarketplace ? 'scanned' : 'installed'})`
      : '0';
  lines.push(`  ${label('Compromised skills')} ${compromisedStr}`);

  const enrich =
    outcomeEnrichmentLine(result.enrichmentOutcomes) ?? enrichmentLine(riskOrderedSkills);
  if (enrich) {
    lines.push(`  ${label('Enrichment')} ${enrich}`);
  } else if (result.enrichmentStatus === 'no-metadata') {
    lines.push(`  ${label('Enrichment')} no metadata found`);
  } else if (result.enrichmentStatus === 'unavailable') {
    lines.push(`  ${label('Enrichment')} lookup failed or timed out`);
  }

  lines.push(`  ${label('Duration')} ${durationFull}s`);
  lines.push('');

  const firstFail = riskOrderedSkills.find((s) => s.summary.verdict === 'FAIL');
  const firstReview = riskOrderedSkills.find((s) => s.summary.verdict === 'REVIEW');
  const highlight = firstFail ?? firstReview;
  if (highlight) {
    lines.push(`  →  skill-audit explain ${highlight.name}    ${C_GREY('See full findings')}`);
  }
  lines.push(`  →  skill-audit ignore <skill>    ${C_GREY('Allowlist a false positive')}`);
  lines.push(`  →  skill-audit --html report.html    ${C_GREY('Generate shareable HTML')}`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Compact one-liner for --summary / CI mode.
 * Format: "47 skills · 8 compromised (17%) · FAIL"
 * Followed by severity breakdown and duration on separate lines.
 */
export function renderSummaryCompact(result: ScanResult): string {
  const { scan, summary, skills } = result;
  const stats = findingsStats(skills);
  const states = installStateCounts(skills);
  const hasMarketplace = states.marketplace > 0;
  const verdictColored =
    summary.verdict === 'FAIL'
      ? C_CRITICAL(summary.verdict)
      : summary.verdict === 'PASS'
        ? C_PASS(summary.verdict)
        : C_MEDIUM(summary.verdict);

  const compromisedPart =
    summary.compromised > 0
      ? `${C_CRITICAL(String(summary.compromised))} compromised (${formatCompromisedPercent(summary.percentCompromised)}%)`
      : '0 compromised';

  const lines = [
    `${summary.skillsScanned} skills · ${compromisedPart} · ${verdictColored}`,
    ...(hasMarketplace
      ? [`installed: ${states.installed} · marketplace: ${states.marketplace}`]
      : []),
    compactSeverityBreakdown(stats),
    `Scanned in ${(scan.durationMs / 1000).toFixed(2)}s`,
  ];
  return `${lines.join('\n')}\n`;
}

export function renderSummary(result: ScanResult): void {
  process.stdout.write(renderSummaryCompact(result));
}

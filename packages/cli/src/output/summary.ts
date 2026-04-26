import chalk from 'chalk';
import { formatCompromisedPercent } from '../percent.js';
import type { ScanResult, ScannedSkill } from '../types.js';
import { sortScanSkills } from './sort.js';

const C_CRITICAL = chalk.hex('#FF4444');
const C_HIGH = chalk.hex('#FF8C00');
const C_MEDIUM = chalk.hex('#FFD700');
const C_PASS = chalk.hex('#4EC9B0');
const C_GREY = chalk.hex('#8B8B8B');

function findingsStats(skills: ScannedSkill[]): {
  uniqueRules: number;
  crit: number;
  high: number;
  med: number;
  low: number;
} {
  const allFindings = skills.flatMap((s) => s.findings);
  return {
    uniqueRules: new Set(allFindings.map((f) => f.ruleId)).size,
    crit: allFindings.filter((f) => f.severity === 'critical').length,
    high: allFindings.filter((f) => f.severity === 'high').length,
    med: allFindings.filter((f) => f.severity === 'medium').length,
    low: allFindings.filter((f) => f.severity === 'low').length,
  };
}

function enrichmentLine(skills: ScannedSkill[]): string | null {
  const hasSkillsSh = skills.some((s) => s.enrichment.skillsSh != null);
  const hasGithub = skills.some((s) => s.enrichment.github != null);
  const hasDepsDev = skills.some((s) => s.enrichment.depsdev != null);
  if (!hasSkillsSh && !hasGithub && !hasDepsDev) return null;
  const parts: string[] = [];
  if (hasSkillsSh) parts.push(`skills.sh ${C_PASS('✓')}`);
  if (hasGithub) parts.push(`github ${C_PASS('✓')}`);
  if (hasDepsDev) parts.push(`deps.dev ${C_PASS('✓')}`);
  return parts.join('  ');
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
  const { uniqueRules, crit, high, med, low } = findingsStats(riskOrderedSkills);
  const label = (s: string): string => s.padEnd(26, '.');
  const durationFull = (scan.durationMs / 1000).toFixed(2);
  const lines: string[] = [];

  lines.push(`  ── Scan summary ${'─'.repeat(Math.max(0, boxWidth - 18))}`);
  lines.push(`  ${label('Skills scanned')} ${summary.skillsScanned}`);
  lines.push(
    `  ${label('Unique issues')} ${uniqueRules}  (${C_CRITICAL(`${crit} critical`)}, ${C_HIGH(`${high} high`)}, ${C_MEDIUM(`${med} medium`)}, ${low} low)`
  );

  const compromisedStr =
    summary.compromised > 0
      ? `${C_CRITICAL(String(summary.compromised))}   (${formatCompromisedPercent(summary.percentCompromised)}% of installed)`
      : '0';
  lines.push(`  ${label('Compromised skills')} ${compromisedStr}`);

  const enrich = enrichmentLine(riskOrderedSkills);
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
    lines.push(`  →  skillaudit explain ${highlight.name}    ${C_GREY('See full findings')}`);
  }
  lines.push(`  →  skillaudit ignore <skill>    ${C_GREY('Allowlist a false positive')}`);
  lines.push(`  →  skillaudit --html report.html    ${C_GREY('Generate shareable HTML')}`);
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
  const { crit, high, med, low } = findingsStats(skills);
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
    `${C_CRITICAL(`${crit} critical`)} · ${C_HIGH(`${high} high`)} · ${C_MEDIUM(`${med} medium`)} · ${low} low`,
    `Scanned in ${(scan.durationMs / 1000).toFixed(2)}s`,
  ];
  return `${lines.join('\n')}\n`;
}

export function renderSummary(result: ScanResult): void {
  process.stdout.write(renderSummaryCompact(result));
}

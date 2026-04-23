import chalk from 'chalk';
import Table from 'cli-table3';
import type { ScanResult, ScannedSkill, Verdict } from '../types.js';

const DOTS: Record<string, string> = {
  critical: chalk.red('●'),
  high: chalk.yellow('●'),
  medium: chalk.hex('#FFA500')('●'),
  low: chalk.blue('●'),
  info: chalk.gray('●'),
};

function colorVerdict(verdict: Verdict): string {
  if (verdict === 'PASS') return chalk.green(verdict);
  if (verdict === 'REVIEW') return chalk.yellow(verdict);
  return chalk.red(verdict);
}

function colorScore(score: number): string {
  if (score >= 85) return chalk.green(String(score));
  if (score >= 50) return chalk.yellow(String(score));
  return chalk.red(String(score));
}

function topIssue(skill: ScannedSkill): string {
  if (skill.findings.length === 0) return chalk.gray('—');
  // Pick the most severe finding
  const order = ['critical', 'high', 'medium', 'low', 'info'];
  const sorted = [...skill.findings].sort(
    (a, b) => order.indexOf(a.severity) - order.indexOf(b.severity)
  );
  const top = sorted[0];
  if (!top) return chalk.gray('—');
  return `${DOTS[top.severity] ?? '●'} ${top.ruleId}`;
}

function issueCount(skill: ScannedSkill): string {
  const { critical, high, medium, low } = skill.summary;
  const parts: string[] = [];
  if (critical > 0) parts.push(chalk.red(`${critical}C`));
  if (high > 0) parts.push(chalk.yellow(`${high}H`));
  if (medium > 0) parts.push(chalk.hex('#FFA500')(`${medium}M`));
  if (low > 0) parts.push(chalk.blue(`${low}L`));
  return parts.length > 0 ? parts.join(' ') : chalk.gray('clean');
}

export function renderTable(result: ScanResult): void {
  const table = new Table({
    head: [
      chalk.bold('Agent'),
      chalk.bold('Skill'),
      chalk.bold('Score'),
      chalk.bold('Verdict'),
      chalk.bold('Issues'),
      chalk.bold('Top Finding'),
    ],
    style: { compact: false },
    wordWrap: true,
  });

  for (const skill of result.skills) {
    table.push([
      skill.agentId,
      skill.name,
      colorScore(skill.summary.score),
      colorVerdict(skill.summary.verdict),
      issueCount(skill),
      topIssue(skill),
    ]);
  }

  console.log(table.toString());
  renderSummary(result);
}

function renderSummary(result: ScanResult): void {
  const { summary, scan } = result;
  const verdict = colorVerdict(summary.verdict);
  const pct =
    summary.compromised > 0 ? chalk.red(`${summary.percentCompromised}%`) : chalk.green('0%');

  console.log(
    `\n  ${verdict}  ${summary.skillsScanned} skills scanned · ` +
      `${pct} compromised (${summary.compromised}/${summary.skillsScanned}) · ` +
      `${scan.durationMs}ms`
  );
}

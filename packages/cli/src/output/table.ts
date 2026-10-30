import chalk from 'chalk';
import Table from 'cli-table3';
import type { ScannedSkill, ScanResult } from '../types.js';
import { skillAgentLabel } from './agents.js';
import { installStateLabel } from './install-state.js';
import { formatLlmReviewInline } from './llm.js';
import { sortScanSkills } from './sort.js';
import { skillSourceLabel } from './source.js';
import { renderSummaryFooter } from './summary.js';
import { topIssueForSkill } from './top-issue.js';

const C_CRITICAL = chalk.hex('#FF4444');
const C_HIGH = chalk.hex('#FF8C00');
const C_MEDIUM = chalk.hex('#FFD700');
const C_PASS = chalk.hex('#4EC9B0');
const C_GREY = chalk.hex('#8B8B8B');

const MAX_ROWS = 20;

// Borderless table chars — produces aligned columns with no box borders
const NO_BORDERS = {
  top: '',
  'top-mid': '',
  'top-left': '',
  'top-right': '',
  bottom: '',
  'bottom-mid': '',
  'bottom-left': '',
  'bottom-right': '',
  left: ' ',
  'left-mid': '',
  mid: '',
  'mid-mid': '',
  right: '',
  'right-mid': '',
  middle: ' ',
};

function verdictDot(skill: ScannedSkill): string {
  const { verdict, score } = skill.summary;
  if (verdict === 'FAIL') return '🔴';
  if (verdict === 'PASS') return '🟢';
  return score < 75 ? '🟠' : '🟡';
}

function colorVerdict(skill: ScannedSkill): string {
  const { verdict, score } = skill.summary;
  if (verdict === 'FAIL') return C_CRITICAL(verdict);
  if (verdict === 'PASS') return C_PASS(verdict);
  return score < 75 ? C_HIGH(verdict) : C_MEDIUM(verdict);
}

function colorScore(skill: ScannedSkill): string {
  const { verdict, score } = skill.summary;
  if (verdict === 'FAIL') return C_CRITICAL(String(score));
  if (verdict === 'PASS') return C_PASS(String(score));
  return score < 75 ? C_HIGH(String(score)) : C_MEDIUM(String(score));
}

function topIssue(skill: ScannedSkill): string {
  const issue = topIssueForSkill(skill);
  if (issue.kind === 'allowlisted') return C_PASS(issue.label);
  if (issue.kind === 'none') return C_GREY(issue.label);
  if (issue.location !== undefined) return `${issue.label} ${C_GREY(`(${issue.location})`)}`;
  return issue.label;
}

export function renderTableToString(result: ScanResult): string {
  const { skills, scan, agents, summary } = result;
  const showInstallStateColumn = skills.some(
    (skill) => installStateLabel(skill.installState) === 'marketplace'
  );
  const showLlmColumn = skills.some((skill) => skill.llmReviews !== undefined);
  const agentCount = agents.length;
  const durationS = (scan.durationMs / 1000).toFixed(1);
  const lines: string[] = [];

  // ── Header box ──────────────────────────────────────────────────────
  const headerContent = `  skill-audit  scanned ${summary.skillsScanned} skill${summary.skillsScanned !== 1 ? 's' : ''} across ${agentCount} agent${agentCount !== 1 ? 's' : ''} in ${durationS}s`;
  const boxWidth = Math.max(82, headerContent.length + 4);
  lines.push(`┌${'─'.repeat(boxWidth - 2)}┐`);
  lines.push(`│${headerContent}${' '.repeat(boxWidth - 2 - headerContent.length)}│`);
  lines.push(`└${'─'.repeat(boxWidth - 2)}┘`);
  lines.push('');

  if (skills.length === 0) {
    lines.push('  No skills found.');
    lines.push('');
    return lines.join('\n');
  }

  // ── Column header row ────────────────────────────────────────────────
  const head = [
    chalk.bold('AGENT'),
    chalk.bold('SKILL'),
    chalk.bold('SOURCE'),
    ...(showInstallStateColumn ? [chalk.bold('STATE')] : []),
    chalk.bold('VERDICT'),
    chalk.bold('SCORE'),
    ...(showLlmColumn ? [chalk.bold('LLM REVIEW')] : []),
    chalk.bold('TOP ISSUE'),
  ];

  // ── Rows ──────────────────────────────────────────────────────────────
  const ordered = sortScanSkills(skills);
  const shown = ordered.slice(0, MAX_ROWS);
  const extra = ordered.length - shown.length;

  const table = new Table({
    head,
    chars: NO_BORDERS,
    style: { compact: false, 'padding-left': 1, 'padding-right': 1, head: [], border: [] },
    wordWrap: false,
  });

  for (const skill of shown) {
    const row = [
      skillAgentLabel(skill),
      `${verdictDot(skill)} ${skill.name}`,
      skillSourceLabel(skill),
      ...(showInstallStateColumn ? [chalk.dim(installStateLabel(skill.installState))] : []),
      colorVerdict(skill),
      colorScore(skill),
      ...(showLlmColumn ? [formatLlmReviewInline(skill.llmReviews)] : []),
      topIssue(skill),
    ];
    table.push(row);
  }

  lines.push(table.toString());

  if (extra > 0) {
    lines.push(`  ${C_GREY(`...${extra} more row${extra !== 1 ? 's' : ''}`)}`);
  }

  lines.push('');
  lines.push(renderSummaryFooter(result, ordered, boxWidth));

  return lines.join('\n');
}

export function renderTable(result: ScanResult): void {
  process.stdout.write(renderTableToString(result));
}

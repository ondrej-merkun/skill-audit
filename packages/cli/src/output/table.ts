import chalk from 'chalk';
import Table from 'cli-table3';
import type { ScanResult, ScannedSkill } from '../types.js';
import { sortScanSkills } from './sort.js';
import { renderSummaryFooter } from './summary.js';

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
  if (skill.summary.allowlisted) return C_PASS('allowlisted ✓');
  if (skill.findings.length === 0) return C_GREY('—');

  const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  const sorted = [...skill.findings].sort(
    (a, b) => (order[a.severity] ?? 99) - (order[b.severity] ?? 99)
  );
  const top = sorted[0];
  if (!top) return C_GREY('—');

  const ruleLabel = top.ruleId.toLowerCase();
  if (top.line > 0) {
    const loc = top.file.replace(/^.*[\\/]/, ''); // basename only
    return `${ruleLabel} ${C_GREY(`(${loc}:${top.line})`)}`;
  }
  return ruleLabel;
}

function enrichmentDetails(skill: ScannedSkill): string {
  const parts: string[] = [];
  const skillsSh = skill.enrichment.skillsSh;
  if (skillsSh !== undefined) {
    parts.push(`Gen=${skillsSh.gen}`, `Socket=${skillsSh.socketAlerts}`, `Snyk=${skillsSh.snyk}`);
  }

  const depsdev = skill.enrichment.depsdev;
  if (depsdev !== undefined) {
    const advisoryLabel =
      depsdev.osvAdvisories === 0
        ? '0 OSV'
        : depsdev.osvAdvisories === 1
          ? '1 OSV advisory'
          : `${depsdev.osvAdvisories} OSV advisories`;
    parts.push(advisoryLabel);
  }

  return parts.length > 0 ? parts.join('  ') : C_GREY('-');
}

export function renderTableToString(result: ScanResult): string {
  const { skills, scan, agents, summary } = result;
  const agentCount = agents.length;
  const durationS = (scan.durationMs / 1000).toFixed(1);
  const lines: string[] = [];

  // ── Header box ──────────────────────────────────────────────────────
  const headerContent = `  skillaudit  scanned ${summary.skillsScanned} skill${summary.skillsScanned !== 1 ? 's' : ''} across ${agentCount} agent${agentCount !== 1 ? 's' : ''} in ${durationS}s`;
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
    chalk.bold('VERDICT'),
    chalk.bold('SCORE'),
    chalk.bold('ENRICHMENT'),
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
    table.push([
      skill.agentId,
      `${verdictDot(skill)} ${skill.name}`,
      colorVerdict(skill),
      colorScore(skill),
      enrichmentDetails(skill),
      topIssue(skill),
    ]);
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

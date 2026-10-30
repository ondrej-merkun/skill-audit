import chalk from 'chalk';
import { formatAgentName } from '../agent-names.js';
import { formatCompromisedPercent } from '../percent.js';
import type { AgentInfo, ScannedSkill, ScanResult, Severity } from '../types.js';
import { installStateLabel } from './install-state.js';
import { formatLlmComparisonSummary, formatLlmConsensusSummary } from './llm.js';
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
  boxWidth = 82,
  scanPath?: string
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
      ? `${C_CRITICAL(String(summary.compromised))}   (${formatCompromisedPercent(summary.percentCompromised)}% of ${hasMarketplace || scanPath !== undefined ? 'scanned' : 'installed'})`
      : '0';
  lines.push(`  ${label('Compromised skills')} ${compromisedStr}`);

  const llmSummary = formatLlmComparisonSummary(riskOrderedSkills);
  if (llmSummary !== null) {
    lines.push(`  ${label('LLM review')} ${llmSummary}`);
  }
  const llmConsensus = formatLlmConsensusSummary(riskOrderedSkills);
  if (llmConsensus !== null) {
    lines.push(`  ${label('LLM consensus')} ${llmConsensus}`);
  }

  lines.push(`  ${label('Duration')} ${durationFull}s`);
  lines.push('');

  const firstFail = riskOrderedSkills.find((s) => s.summary.verdict === 'FAIL');
  const firstReview = riskOrderedSkills.find((s) => s.summary.verdict === 'REVIEW');
  const highlight = firstFail ?? firstReview;
  const nextCommands =
    scanPath === undefined
      ? installedScanNextCommands(highlight)
      : pathScanNextCommands(scanPath, highlight);
  for (const { command, description } of nextCommands) {
    lines.push(`  →  ${command}    ${C_GREY(description)}`);
  }
  lines.push('');

  return lines.join('\n');
}

const LLM_ADD_NEXT_COMMAND: NextCommand = {
  command: 'skill-audit llm add local --base-url http://127.0.0.1:11434/v1 --model <model_name>',
  description: 'Configure local LLM review',
};

function installedScanNextCommands(highlight: ScannedSkill | undefined): NextCommand[] {
  const nextCommands: NextCommand[] = [];
  if (highlight) {
    nextCommands.push({
      command: `skill-audit explain ${highlight.name}`,
      description: 'See full findings',
    });
  }
  nextCommands.push(LLM_ADD_NEXT_COMMAND, {
    command: 'skill-audit --llm local',
    description: 'Add local LLM review',
  });
  if (highlight) {
    nextCommands.push(
      {
        command: `skill-audit scan --skill ${highlight.name} --llm local`,
        description: 'Review this skill with local LLM',
      },
      {
        command: `skill-audit explain ${highlight.name} --llm local`,
        description: 'Explain this skill with local LLM',
      }
    );
  }
  nextCommands.push(
    {
      command: 'skill-audit ignore <skill>',
      description: 'Allowlist a false positive',
    },
    {
      command: 'skill-audit --html report.html',
      description: 'Generate HTML report (contains full findings)',
    },
    {
      command: 'skill-audit --agent claude-code',
      description: 'Scan only Claude Code skills',
    }
  );
  return nextCommands;
}

// `explain`, `ignore`, and `--agent` look up installed skills, so they cannot find a path target.
function pathScanNextCommands(
  scanPath: string,
  highlight: ScannedSkill | undefined
): NextCommand[] {
  const scan = `skill-audit scan ${shellQuote(scanPath)}`;
  return [
    LLM_ADD_NEXT_COMMAND,
    { command: `${scan} --llm local`, description: 'Add local LLM review' },
    ...(highlight === undefined
      ? []
      : [
          {
            command: `${scan} --skill ${highlight.name} --llm local`,
            description: 'Review this skill with local LLM',
          },
        ]),
    {
      command: `${scan} --html report.html`,
      description: 'Generate HTML report (contains full findings)',
    },
  ];
}

// Quotes a path for a copy-pasted POSIX shell command, unless it has only safe characters.
function shellQuote(value: string): string {
  return /^[\w./@%+=:,-]+$/.test(value) ? value : `'${value.replaceAll("'", `'\\''`)}'`;
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

  const llmSummary = formatLlmComparisonSummary(skills);
  const llmConsensus = formatLlmConsensusSummary(skills);
  const lines = [
    `${summary.skillsScanned} skills · ${compromisedPart} · ${verdictColored}`,
    ...(hasMarketplace
      ? [`installed: ${states.installed} · marketplace: ${states.marketplace}`]
      : []),
    compactSeverityBreakdown(stats),
    ...(llmSummary !== null ? [`LLM review: ${llmSummary}`] : []),
    ...(llmConsensus !== null ? [`LLM consensus: ${llmConsensus}`] : []),
    `Scanned in ${(scan.durationMs / 1000).toFixed(2)}s`,
  ];
  return `${lines.join('\n')}\n`;
}

export function renderSummary(result: ScanResult): void {
  process.stdout.write(renderSummaryCompact(result));
}

type NextCommand = { command: string; description: string };

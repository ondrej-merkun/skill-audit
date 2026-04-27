import chalk from 'chalk';
import type { LlmReviewResult, LlmReviewStatus, ScannedSkill, Severity } from '../types.js';

const C_CRITICAL = chalk.hex('#FF4444');
const C_HIGH = chalk.hex('#FF8C00');
const C_MEDIUM = chalk.hex('#FFD700');
const C_GREY = chalk.hex('#8B8B8B');

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

const STATUS_RANK: Record<LlmReviewStatus, number> = {
  ok: 0,
  'invalid-response': 1,
  timeout: 2,
  unavailable: 3,
  'skipped-offline': 4,
  'not-run': 5,
};

export type LlmModelComparison = {
  modelName: string;
  provider: string;
  model: string;
  statuses: Record<LlmReviewStatus, number>;
  findings: number;
  severities: Record<Severity, number>;
  highestSeverity: Severity | null;
};

export type LlmConsensus = {
  skillName: string;
  file: string;
  category: string;
  severity: Severity;
  models: string[];
};

export function highestLlmSeverity(review: LlmReviewResult): Severity | null {
  if (review.findings.length === 0) return null;
  return review.findings.reduce<Severity>(
    (highest, finding) =>
      SEVERITY_RANK[finding.severity] < SEVERITY_RANK[highest] ? finding.severity : highest,
    review.findings[0]?.severity ?? 'info'
  );
}

function colorSeverity(severity: Severity): string {
  if (severity === 'critical') return C_CRITICAL(severity);
  if (severity === 'high') return C_HIGH(severity);
  if (severity === 'medium') return C_MEDIUM(severity);
  return severity;
}

export function formatLlmReviewInline(reviews: LlmReviewResult[] | undefined): string {
  if (reviews === undefined || reviews.length === 0) return C_GREY('—');
  return reviews
    .map((review) => {
      if (review.status !== 'ok') return `${review.modelName} ${review.status}`;
      const highest = highestLlmSeverity(review);
      if (highest === null) return `${review.modelName} ok (0)`;
      return `${review.modelName} ${colorSeverity(highest)} (${review.findings.length})`;
    })
    .join('  ');
}

export function collectLlmComparisons(skills: ScannedSkill[]): LlmModelComparison[] {
  const byModel = new Map<string, LlmModelComparison>();

  for (const skill of skills) {
    for (const review of skill.llmReviews ?? []) {
      const existing =
        byModel.get(review.modelName) ??
        ({
          modelName: review.modelName,
          provider: review.provider,
          model: review.model,
          statuses: {
            ok: 0,
            unavailable: 0,
            timeout: 0,
            'invalid-response': 0,
            'skipped-offline': 0,
            'not-run': 0,
          },
          findings: 0,
          severities: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
          highestSeverity: null,
        } satisfies LlmModelComparison);

      existing.statuses[review.status] += 1;
      for (const finding of review.findings) {
        existing.findings += 1;
        existing.severities[finding.severity] += 1;
        if (
          existing.highestSeverity === null ||
          SEVERITY_RANK[finding.severity] < SEVERITY_RANK[existing.highestSeverity]
        ) {
          existing.highestSeverity = finding.severity;
        }
      }
      byModel.set(review.modelName, existing);
    }
  }

  return [...byModel.values()].sort((a, b) => a.modelName.localeCompare(b.modelName));
}

export function collectLlmConsensus(skills: ScannedSkill[]): LlmConsensus[] {
  const groups = new Map<string, LlmConsensus>();

  for (const skill of skills) {
    for (const review of skill.llmReviews ?? []) {
      if (review.status !== 'ok') continue;
      for (const finding of review.findings) {
        const file = finding.file ?? 'unknown file';
        const key = `${skill.name}\0${file}\0${finding.category}\0${finding.severity}`;
        const group =
          groups.get(key) ??
          ({
            skillName: skill.name,
            file,
            category: finding.category,
            severity: finding.severity,
            models: [],
          } satisfies LlmConsensus);
        if (!group.models.includes(review.modelName)) {
          group.models.push(review.modelName);
          group.models.sort((a, b) => a.localeCompare(b));
        }
        groups.set(key, group);
      }
    }
  }

  return [...groups.values()]
    .filter((group) => group.models.length > 1)
    .sort((a, b) => {
      const severityDiff = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
      if (severityDiff !== 0) return severityDiff;
      return `${a.skillName}\0${a.file}\0${a.category}`.localeCompare(
        `${b.skillName}\0${b.file}\0${b.category}`
      );
    });
}

function dominantStatus(comparison: LlmModelComparison): LlmReviewStatus {
  return (Object.keys(comparison.statuses) as LlmReviewStatus[]).sort((a, b) => {
    const countDiff = comparison.statuses[b] - comparison.statuses[a];
    return countDiff !== 0 ? countDiff : STATUS_RANK[a] - STATUS_RANK[b];
  })[0];
}

export function formatLlmConsensusSummary(skills: ScannedSkill[]): string | null {
  const consensus = collectLlmConsensus(skills);
  if (consensus.length === 0) return null;
  const shown = consensus.slice(0, 2).map((group) => {
    const location =
      group.file === 'unknown file' ? group.skillName : `${group.skillName}/${group.file}`;
    return `${location} ${colorSeverity(group.severity)} (${group.models.length} models)`;
  });
  const extra = consensus.length - shown.length;
  return extra > 0 ? `${shown.join('  ')}  +${extra} more` : shown.join('  ');
}

export function formatLlmComparisonSummary(skills: ScannedSkill[]): string | null {
  const comparisons = collectLlmComparisons(skills);
  if (comparisons.length === 0) return null;
  return comparisons
    .map((comparison) => {
      const status = dominantStatus(comparison);
      if (comparison.findings === 0) return `${comparison.modelName} ${status} (0)`;
      const severity = comparison.highestSeverity ?? 'info';
      return `${comparison.modelName} ${status} ${colorSeverity(severity)}:${comparison.findings}`;
    })
    .join('  ');
}

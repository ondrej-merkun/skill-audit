import type { ProgressReporter } from '../progress.js';
import type { LlmReviewResult, ScannedSkill } from '../types.js';
import { loadLlmRegistry } from './config.js';
import type { LocalLlmConfig } from './config.js';
import { LLM_REVIEW_PROMPT_VERSION, buildLlmReviewPayload } from './prompt.js';
import { reviewWithOpenAiCompatibleModel } from './review.js';
import type { LlmReviewFetch } from './review.js';

export { LLM_REVIEW_PROMPT_VERSION };

export const LLM_REVIEW_DETAILS_HINT =
  '[skill-audit] LLM review: details: rerun this scan with --json or --html report.html to inspect LLM-only finding details\n';

export function parseLlmSelections(selection: string | string[]): string[] {
  const selections = Array.isArray(selection) ? selection : [selection];
  const names: string[] = [];
  for (const entry of selections) {
    for (const name of entry.split(',')) {
      const trimmed = name.trim();
      if (trimmed !== '') names.push(trimmed);
    }
  }
  return [...new Set(names)];
}

export async function loadSelectedLlmConfigs(
  selection: string | string[]
): Promise<LocalLlmConfig[]> {
  const selectedNames = parseLlmSelections(selection);
  if (selectedNames.length === 0) throw new Error('at least one local LLM name is required');

  const registry = await loadLlmRegistry();
  const enabledModels = registry.models.filter((model) => model.disabled !== true);
  const selectedConfigs =
    selectedNames.length === 1 && selectedNames[0] === 'all'
      ? enabledModels
      : selectedNames.map((name) => {
          const config = registry.models.find((model) => model.name === name);
          if (config === undefined) throw new Error(`local LLM "${name}" is not configured`);
          if (config.disabled === true) throw new Error(`local LLM "${name}" is disabled`);
          return config;
        });

  if (selectedConfigs.length === 0) throw new Error('no enabled local LLMs are configured');
  return [...selectedConfigs].sort((a, b) => a.name.localeCompare(b.name));
}

export function llmStatusLine(result: LlmReviewResult): string {
  if (result.status === 'ok') {
    return llmFindingsStatusLine(result.findings.length);
  }
  return `${result.modelName} ${result.status}`;
}

function llmFindingsStatusLine(findingsCount: number): string {
  const marker = findingsCount === 0 ? '✅' : '❌';
  return `${marker} ${findingsCount} LLM finding${findingsCount === 1 ? '' : 's'}`;
}

export async function reviewSkillsWithLlm(
  skills: ScannedSkill[],
  configs: LocalLlmConfig[],
  fetchImpl: LlmReviewFetch | undefined,
  progress: ProgressReporter,
  options: { showDetailsHint?: boolean } = {}
): Promise<ScannedSkill[]> {
  const reviewed: ScannedSkill[] = [];
  const reviewableTotal = skills.filter((skill) => skill.ignored !== true).length;
  const contextTokens = configs
    .map((config) => config.contextTokens)
    .filter((value): value is number => value !== undefined)
    .sort((a, b) => a - b)[0];
  let completedReviews = 0;
  let hasLlmOnlyFindings = false;

  if (reviewableTotal > 0) progress.startLlmReview(reviewableTotal);
  for (const skill of skills) {
    if (skill.ignored === true) {
      reviewed.push(skill);
      continue;
    }
    const payload = await buildLlmReviewPayload(
      skill,
      contextTokens !== undefined ? { contextTokens } : {}
    );
    const results = (
      await Promise.all(
        configs.map((config) => reviewWithOpenAiCompatibleModel(config, payload, fetchImpl))
      )
    ).sort((a, b) => a.modelName.localeCompare(b.modelName));
    reviewed.push({ ...skill, llmReviews: results });
    completedReviews++;
    progress.updateLlmReview(completedReviews, reviewableTotal, skill.name);
    const okFindingCount = results
      .filter((result) => result.status === 'ok')
      .reduce((total, result) => total + result.findings.length, 0);
    if (results.some((result) => result.status === 'ok')) {
      process.stderr.write(
        `[skill-audit] LLM review ${completedReviews}/${reviewableTotal}: ${skill.name}: ${llmFindingsStatusLine(okFindingCount)}\n`
      );
    }
    for (const result of results) {
      if (result.status === 'ok' && result.findings.length > 0) {
        hasLlmOnlyFindings = true;
      }
      if (result.status === 'ok') continue;
      process.stderr.write(
        `[skill-audit] LLM review ${completedReviews}/${reviewableTotal}: ${skill.name}: ${llmStatusLine(result)}\n`
      );
    }
  }
  if (reviewableTotal > 0) progress.succeedLlmReview(reviewableTotal);
  if (hasLlmOnlyFindings && options.showDetailsHint !== false) {
    process.stderr.write(LLM_REVIEW_DETAILS_HINT);
  }
  return reviewed;
}

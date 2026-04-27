import type {
  Enrichment,
  Finding,
  LlmReviewFinding,
  LlmReviewResult,
  ScanResult,
  ScannedSkill,
} from '../types.js';
import { installStateLabel } from './install-state.js';
import { sortScanSkills } from './sort.js';

function serializeFinding(f: Finding): object {
  return {
    rule_id: f.ruleId,
    severity: f.severity,
    category: f.category,
    file: f.file,
    line: f.line,
    column: f.column,
    snippet: f.snippet,
    message: f.message,
    fix: f.fix,
    cwe: f.cwe,
  };
}

function serializeEnrichment(e: Enrichment): object {
  const out: Record<string, object> = {};
  if (e.skillsSh !== undefined) {
    out.skills_sh = {
      gen: e.skillsSh.gen,
      socket_alerts: e.skillsSh.socketAlerts,
      snyk: e.skillsSh.snyk,
    };
  }
  if (e.github !== undefined) {
    out.github = {
      stars: e.github.stars,
      age_days: e.github.ageDays,
      contributors: e.github.contributors,
    };
  }
  if (e.depsdev !== undefined) {
    out.deps_dev = {
      osv_advisories: e.depsdev.osvAdvisories,
      scorecard_score: e.depsdev.scorecardScore,
    };
  }
  return out;
}

function serializeLlmFinding(f: LlmReviewFinding): object {
  return {
    severity: f.severity,
    category: f.category,
    confidence: f.confidence,
    rationale: f.rationale,
    ...(f.file !== undefined ? { file: f.file } : {}),
    ...(f.suggestedFix !== undefined ? { suggested_fix: f.suggestedFix } : {}),
  };
}

function serializeLlmReview(review: LlmReviewResult): object {
  return {
    model_name: review.modelName,
    provider: review.provider,
    model: review.model,
    status: review.status,
    prompt_version: review.promptVersion,
    findings: review.findings.map(serializeLlmFinding),
    ...(review.error !== undefined ? { error: review.error } : {}),
  };
}

function serializeSkill(s: ScannedSkill): object {
  return {
    id: s.id,
    agent_id: s.agentId,
    name: s.name,
    path: s.path,
    install_state: installStateLabel(s.installState),
    ...(s.alsoInstalledAt !== undefined && s.alsoInstalledAt.length > 0
      ? { also_installed_at: s.alsoInstalledAt }
      : {}),
    ...(s.modifiedAt !== undefined ? { modified_at: s.modifiedAt } : {}),
    tree_sha256: s.treeSha256,
    allowlisted: s.summary.allowlisted,
    ignored: s.ignored === true,
    findings: s.findings.map(serializeFinding),
    ...(s.llmReviews !== undefined ? { llm_reviews: s.llmReviews.map(serializeLlmReview) } : {}),
    enrichment: serializeEnrichment(s.enrichment),
    summary: {
      critical: s.summary.critical,
      high: s.summary.high,
      medium: s.summary.medium,
      low: s.summary.low,
      info: s.summary.info,
      score: s.summary.score,
      verdict: s.summary.verdict,
      mandatory_fail: s.summary.mandatoryFail,
    },
  };
}

export function renderJson(result: ScanResult): string {
  const output = {
    schema_version: result.schemaVersion,
    scan: {
      started_at: result.scan.startedAt,
      duration_ms: result.scan.durationMs,
      tool_version: result.scan.toolVersion,
    },
    agents: result.agents.map((a) => ({
      id: a.id,
      installed: a.installed,
      skills_scanned: a.skillsScanned,
    })),
    skills: sortScanSkills(result.skills).map(serializeSkill),
    summary: {
      skills_scanned: result.summary.skillsScanned,
      compromised: result.summary.compromised,
      percent_compromised: result.summary.percentCompromised,
      verdict: result.summary.verdict,
    },
  };
  return JSON.stringify(output, null, 2);
}

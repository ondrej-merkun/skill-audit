import allowlistData from './allowlist/anthropic-skills.json';
import type { Finding, Severity, SkillSummary, Verdict } from './types.js';

/** SHA-256 tree hashes of trusted/allowlisted skills (exact match demotes PI-* to info). */
const SHA256_TREE_RE = /^[0-9a-f]{64}$/;
const PLACEHOLDER_SHA = '0000000000000000000000000000000000000000000000000000000000000000';
const ALLOWLISTED_SHAS = new Set(
  allowlistData.entries
    .map((e) => e.sha256_tree)
    .filter((sha) => SHA256_TREE_RE.test(sha) && sha !== PLACEHOLDER_SHA)
);

/** Rules that individually force a FAIL verdict regardless of score. */
const MANDATORY_FAIL_STANDALONE = new Set([
  'NET-EXFIL-ENV',
  'NET-WEBHOOK-KNOWN',
  'SKILL-PASSWORD-ZIP',
  'PI-EXFIL-TRIGGER-CLAUSE',
  'OBFS-EVAL-ATOB',
]);

/** Rules that represent a pipe-to-shell pattern (used in compound check). */
const PIPE_TO_SHELL_RULES = new Set([
  'SKILL-CURL-BASH-IN-MD',
  'SKILL-FETCH-AND-EXEC',
  'CODEEXEC-JS-CHILDPROCESS-SHELL',
  'CODEEXEC-SHELL-BACKTICK',
]);

function countUniqueRulesBySeverity(findings: Finding[], severity: Severity): number {
  const ids = new Set<string>();
  for (const f of findings) {
    if (f.severity === severity) ids.add(f.ruleId);
  }
  return ids.size;
}

function verdictFromScore(score: number): Verdict {
  if (score >= 85) return 'PASS';
  if (score >= 50) return 'REVIEW';
  return 'FAIL';
}

/**
 * Returns the rule IDs that triggered a mandatory-fail override.
 * Empty array means no override applies.
 */
function getMandatoryFailIds(findings: Finding[]): string[] {
  const ruleIds = new Set(
    findings.filter((f) => f.ignoredForVerdict !== true).map((f) => f.ruleId)
  );
  const triggered = new Set<string>();

  for (const id of MANDATORY_FAIL_STANDALONE) {
    if (ruleIds.has(id)) triggered.add(id);
  }

  // DEPS-REMOTE-IMPORT combined with any pipe-to-shell rule
  if (ruleIds.has('DEPS-REMOTE-IMPORT')) {
    for (const pipeId of PIPE_TO_SHELL_RULES) {
      if (ruleIds.has(pipeId)) {
        triggered.add('DEPS-REMOTE-IMPORT');
        triggered.add(pipeId);
        break;
      }
    }
  }

  // FS-CREDSTORE combined with any NET-* rule
  if (ruleIds.has('FS-CREDSTORE')) {
    for (const id of ruleIds) {
      if (id.startsWith('NET-')) {
        triggered.add('FS-CREDSTORE');
        triggered.add(id);
        break;
      }
    }
  }

  return [...triggered];
}

/** Compute a SkillSummary from a list of findings using the spec §4 scoring formula. */
export function scoreFindings(findings: Finding[], treeSha256?: string): SkillSummary {
  const isAllowlisted = treeSha256 !== undefined && ALLOWLISTED_SHAS.has(treeSha256);

  // On allowlist match, demote all PI-* findings to info before scoring.
  const effectiveFindings = isAllowlisted
    ? findings.map(
        (f): Finding => (f.ruleId.startsWith('PI-') ? { ...f, severity: 'info' as const } : f)
      )
    : findings;

  const critical = countUniqueRulesBySeverity(effectiveFindings, 'critical');
  const high = countUniqueRulesBySeverity(effectiveFindings, 'high');
  const medium = countUniqueRulesBySeverity(effectiveFindings, 'medium');
  const low = countUniqueRulesBySeverity(effectiveFindings, 'low');
  const info = countUniqueRulesBySeverity(effectiveFindings, 'info');

  const score = Math.max(0, 100 - (25 * critical + 10 * high + 3 * medium + 1 * low));
  const mandatoryFail = getMandatoryFailIds(effectiveFindings);
  const verdict: Verdict = mandatoryFail.length > 0 ? 'FAIL' : verdictFromScore(score);

  return {
    critical,
    high,
    medium,
    low,
    info,
    score,
    verdict,
    mandatoryFail,
    allowlisted: isAllowlisted,
  };
}

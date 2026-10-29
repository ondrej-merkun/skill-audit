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

/**
 * Credential-store access rules (used in the prompt-injection compound checks).
 * Each one detects a direct read of stored secrets (CWE-522); only the store differs.
 */
const CREDENTIAL_STORE_RULES = new Set([
  'FS-CREDSTORE',
  'FS-BROWSER-CREDENTIALSTORE',
  'FS-KEYCHAIN-ACCESS',
]);

/**
 * High PI rules that force FAIL with a credential-store finding on the same line,
 * mapped to the credential-store rules that they pair with.
 */
const SAME_LINE_INJECTION_STORE_RULES = new Map<string, ReadonlySet<string>>([
  ['PI-JAILBREAK', CREDENTIAL_STORE_RULES],
  // FS-CREDSTORE paths include files that root admin work reads (/etc/passwd,
  // /etc/shadow, ~/.kube/config, ~/.ssh/authorized_keys), so "run as root" next
  // to one of them is not evidence of theft.
  ['PI-PRIV-ESCALATE-INSTRUCTION', new Set(['FS-BROWSER-CREDENTIALSTORE', 'FS-KEYCHAIN-ACCESS'])],
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
  const verdictFindings = findings.filter((f) => f.ignoredForVerdict !== true);
  const ruleIds = new Set(verdictFindings.map((f) => f.ruleId));
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

  // Critical PI-* combined with any credential-store rule: an injected instruction
  // that reads stored secrets. Severity is effective severity, so allowlist-demoted
  // PI-* findings (info) never qualify.
  const criticalInjection = verdictFindings.find(
    (f) => f.ruleId.startsWith('PI-') && f.severity === 'critical'
  );
  if (criticalInjection !== undefined) {
    for (const storeId of CREDENTIAL_STORE_RULES) {
      if (ruleIds.has(storeId)) {
        triggered.add(criticalInjection.ruleId);
        triggered.add(storeId);
        break;
      }
    }
  }

  // High PI-* combined with a credential-store read on the same line: the jailbreak
  // or escalation instruction names the secret itself. Admin and security-teaching
  // skills mention these on separate lines or in separate files, so those stay REVIEW.
  // Allowlist-demoted PI-* findings are info and never qualify.
  // ponytail: an attack split across lines or files stays REVIEW. PI-JAILBREAK has
  // no quote guard, so an unmasked teaching line that quotes a jailbreak together
  // with a credential path turns FAIL.
  for (const injection of verdictFindings) {
    const pairedStoreIds = SAME_LINE_INJECTION_STORE_RULES.get(injection.ruleId);
    if (pairedStoreIds === undefined || injection.severity === 'info') continue;

    const store = verdictFindings.find(
      (f) => pairedStoreIds.has(f.ruleId) && f.file === injection.file && f.line === injection.line
    );
    if (store !== undefined) {
      triggered.add(injection.ruleId);
      triggered.add(store.ruleId);
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

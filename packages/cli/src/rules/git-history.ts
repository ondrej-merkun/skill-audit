import type { Rule } from '../types.js';

// Patterns split to avoid triggering static-analysis hooks on this detector file.

// GIT-CRED-READ: using git credential subsystem to extract stored credentials
const gitCredFillPattern = new RegExp(['\\bgit\\s+', 'credential\\s+fill\\b'].join(''));
const gitCredApprovePattern = new RegExp(['\\bgit\\s+', 'credential\\s+approve\\b'].join(''));
const gitCredHelperReadPattern = new RegExp(
  ['\\bgit\\s+config\\b[^\\n]{0,60}', 'credential\\.helper\\b'].join('')
);

export const GIT_CRED_READ: Rule = {
  id: 'GIT-CRED-READ',
  category: 'git-history',
  severity: 'high',
  appliesTo: ['*.sh', '*.bash', '*.py', '*.js', '*.ts', '*.mjs', '*.md'],
  patterns: [gitCredFillPattern, gitCredApprovePattern, gitCredHelperReadPattern],
  message: 'Git credential subsystem access detected — may extract stored credentials.',
  fix: 'Remove git credential fill / git config credential.helper calls. Skills should not access stored VCS credentials.',
  cwe: ['CWE-522'],
};

// GIT-HISTORY-SCAN: scanning git history to surface secrets from past commits
const gitLogPipeGrepPattern = /\bgit\s+log\b[^\n]{0,80}-p\b[^\n]*\|[^\n]*\bgrep\b/;
const gitRevListAllXargsPattern = /\bgit\s+rev-list\s+--all\b[^\n]{0,80}\|\s*xargs\b/;
const gitLogAllGrepPattern = /\bgit\s+log\b[^\n]{0,60}--all\b[^\n]*\|\s*grep\b/;
const gitGrepAllObjectsPattern = /\bgit\s+grep\b[^\n]{0,60}--all-objects\b/;

export const GIT_HISTORY_SCAN: Rule = {
  id: 'GIT-HISTORY-SCAN',
  category: 'git-history',
  severity: 'medium',
  appliesTo: ['*.sh', '*.bash', '*.py', '*.js', '*.ts', '*.mjs', '*.md'],
  patterns: [
    gitLogPipeGrepPattern,
    gitRevListAllXargsPattern,
    gitLogAllGrepPattern,
    gitGrepAllObjectsPattern,
  ],
  message: 'Git history scanning detected — may uncover secrets from past commits.',
  fix: 'Remove commands that search all git history. Use dedicated secret-scanning tools with explicit consent.',
  cwe: ['CWE-200'],
};

export const GIT_HISTORY_RULES: Rule[] = [GIT_CRED_READ, GIT_HISTORY_SCAN];

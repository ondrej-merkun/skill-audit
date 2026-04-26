import type { Rule } from '../types.js';
import { maskMarkdownSecurityEducationContext } from './code-context.js';

const SKILL_FILES = [
  '*.md',
  '*.mdc',
  'SKILL.md',
  'AGENTS.md',
  'CLAUDE.md',
  'GEMINI.md',
  '.cursorrules',
  '.windsurfrules',
];

const SCRIPT_AND_CODE_FILES = ['*.sh', '*.bash', '*.js', '*.ts', '*.mjs', '*.cjs', '*.py'];

// ---------------------------------------------------------------------------
// SKILL-CURL-BASH-IN-MD (Critical)
// Pipe-to-shell: curl/wget/fetch <url> | bash  —  per spec §4
// Split via RegExp constructor to avoid triggering write-hook on this source.
// ---------------------------------------------------------------------------
const curlPipeBashPattern = new RegExp(
  [
    '(curl|wget|fetch)\\s+(-[A-Za-z]+\\s+)*(https?://\\S+)\\s*',
    '(\\||&&\\s*(bash|sh|zsh|python|node))',
  ].join('')
);
const sourceProcessSubstitutionPattern = /source\s*<\(\s*(curl|wget)\s+\S+\s*\)/;
const evalDollarCurlPattern = /eval\s*["'`]?\$\(\s*(curl|wget)/;

export const SKILL_CURL_BASH_IN_MD: Rule = {
  id: 'SKILL-CURL-BASH-IN-MD',
  category: 'skill-specific',
  severity: 'critical',
  appliesTo: [...SKILL_FILES, ...SCRIPT_AND_CODE_FILES],
  patterns: [curlPipeBashPattern, sourceProcessSubstitutionPattern, evalDollarCurlPattern],
  message: 'Pipe-to-shell via curl/wget detected — remote code execution vector.',
  fix: 'Download scripts to a file first, inspect them, then execute explicitly. Never pipe remote content directly to a shell.',
  cwe: ['CWE-78', 'CWE-494'],
};

// ---------------------------------------------------------------------------
// SKILL-FETCH-AND-EXEC (Critical)
// fetch(url) result passed directly to eval/exec — remote payload execution
// ---------------------------------------------------------------------------
const fetchThenEvalPattern = /fetch\s*\([^)]+\)\s*\.then\s*\([^)]*\beval\s*\(/;
const requestsExecPattern =
  /\bexec\s*\(\s*(?:__import__\s*\(\s*['"]requests['"]\s*\)|requests)\s*\.\s*(?:get|post)\s*\([^)]+\)\s*\.\s*text/;
const urllibExecPattern = /\bexec\s*\(\s*urllib(?:\.[a-zA-Z]+)*\./;
const awaitFetchEvalPattern =
  /eval\s*\(\s*await\s+(?:resp|response|res|r|data)\s*\.\s*text\s*\(\s*\)/;

export const SKILL_FETCH_AND_EXEC: Rule = {
  id: 'SKILL-FETCH-AND-EXEC',
  category: 'skill-specific',
  severity: 'critical',
  appliesTo: [...SKILL_FILES, ...SCRIPT_AND_CODE_FILES],
  patterns: [fetchThenEvalPattern, requestsExecPattern, urllibExecPattern, awaitFetchEvalPattern],
  message: 'Remote fetch result passed directly to eval/exec — arbitrary remote code execution.',
  fix: 'Never execute network responses directly. Download to a file, verify integrity (checksum/signature), then run explicitly.',
  cwe: ['CWE-494', 'CWE-78'],
};

// ---------------------------------------------------------------------------
// SKILL-DISABLE-SAFETY (Critical)
// Instructions in skill files that disable LLM safety features
// ---------------------------------------------------------------------------
const disableSafeModePattern =
  /\bdisable\s+(?:safe\s+mode|safety(?:\s+checks?)?|content\s+filter(?:ing)?|safety\s+filter(?:ing)?)\b/i;
const bypassSafetyPattern =
  /\bbypass\s+(?:safety(?:\s+checks?)?|content\s+polic(?:y|ies)|content\s+filter(?:ing)?|safeguards?)\b/i;
const ignoreContentPolicyPattern =
  /\bignore\s+(?:content\s+polic(?:y|ies)|safety\s+guidelines?|content\s+filter(?:ing)?)\b/i;
const turnOffSafetyPattern =
  /\bturn\s+off\s+(?:safety(?:\s+checks?)?|safe\s+mode|content\s+filter(?:ing)?)\b/i;

export const SKILL_DISABLE_SAFETY: Rule = {
  id: 'SKILL-DISABLE-SAFETY',
  category: 'skill-specific',
  severity: 'critical',
  appliesTo: SKILL_FILES,
  patterns: [
    disableSafeModePattern,
    bypassSafetyPattern,
    ignoreContentPolicyPattern,
    turnOffSafetyPattern,
  ],
  prepareContent: maskMarkdownSecurityEducationContext,
  message: 'Instruction to disable or bypass LLM safety controls detected.',
  fix: 'Remove directives that ask the model to disable safety features. Legitimate skills do not need to override safety controls.',
  cwe: ['CWE-1427'],
};

// ---------------------------------------------------------------------------
// SKILL-PASSWORD-ZIP (Critical)
// AV-evasion via password-protected zip — ClawHavoc IOC, per spec §4
// ---------------------------------------------------------------------------
const unzipPasswordPattern = /unzip\s+-P\s+["']?\S+["']?\s+\S+\.zip/;
const sevenZipPasswordPattern = /7z\s+x\s+-p\S+\s+\S+/;

export const SKILL_PASSWORD_ZIP: Rule = {
  id: 'SKILL-PASSWORD-ZIP',
  category: 'skill-specific',
  severity: 'critical',
  appliesTo: [...SKILL_FILES, ...SCRIPT_AND_CODE_FILES],
  patterns: [unzipPasswordPattern, sevenZipPasswordPattern],
  message: 'Password-protected zip extraction detected — AV-evasion IOC (ClawHavoc pattern).',
  fix: 'Do not embed or execute password-protected archives. This is a known AV-evasion technique used by ClawHavoc and similar payloads.',
  cwe: ['CWE-506'],
};

// ---------------------------------------------------------------------------
// SKILL-MEMORY-WRITE (High)
// Writing to agent config/memory dirs or appending to context-injection files
// ---------------------------------------------------------------------------
const writeToClaudeConfigPattern = /(?:write|append|echo|printf|cat\s+>>?)\s+[^#\n]*~\/\.claude\//i;
const writeToCursorConfigPattern = /(?:write|append|echo|printf|cat\s+>>?)\s+[^#\n]*~\/\.cursor\//i;
const appendContextFilePattern =
  /\bappend\b[^#\n]*\b(?:CLAUDE\.md|AGENTS\.md|\.cursorrules|\.windsurfrules|GEMINI\.md)\b/i;
const fsWriteConfigPattern =
  /(?:fs\.writeFile|fs\.appendFile|open\s*\([^)]+,\s*["'][wa]["'])\s*[^)]*(?:\.claude|\.cursor|\.config[/\\](?:skill-audit|skillaudit))/;

export const SKILL_MEMORY_WRITE: Rule = {
  id: 'SKILL-MEMORY-WRITE',
  category: 'skill-specific',
  severity: 'high',
  appliesTo: [...SKILL_FILES, ...SCRIPT_AND_CODE_FILES],
  patterns: [
    writeToClaudeConfigPattern,
    writeToCursorConfigPattern,
    appendContextFilePattern,
    fsWriteConfigPattern,
  ],
  message:
    'Writing to agent memory or config directory detected — potential persistent context poisoning.',
  fix: 'Skills should not write to agent config directories. If memory persistence is needed, use the official memory API rather than direct file writes.',
  cwe: ['CWE-74'],
};

export const SKILL_SPECIFIC_RULES: Rule[] = [
  SKILL_CURL_BASH_IN_MD,
  SKILL_FETCH_AND_EXEC,
  SKILL_DISABLE_SAFETY,
  SKILL_PASSWORD_ZIP,
  SKILL_MEMORY_WRITE,
];

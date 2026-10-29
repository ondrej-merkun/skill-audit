import type { Rule } from '../types.js';
import {
  maskMarkdownSecurityEducationContext,
  maskSecurityEducationExampleContext,
} from './code-context.js';

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

// Argument slots use bounded character classes, because the engine preflight skips
// any quantified group that contains a quantifier. The bounds keep matching linear
// on long runs of command text.
const MAX_DOWNLOAD_ARGS_CHARS = 80;
const MAX_SUDO_FLAGS_CHARS = 20;
const MAX_INTERPRETER_DIR_CHARS = 40;
const curlPipeBashPattern = new RegExp(
  [
    // Download command, then its URL. Arguments before the URL can hold quotes and
    // values, such as --retry 3, but not a pipe, chain, or new line.
    `\\b(curl|wget|fetch)\\s[^|&;\\n]{0,${MAX_DOWNLOAD_ARGS_CHARS}}`,
    // A quoted URL runs to its closing quote, so a | inside the quotes is not a pipe.
    // An unquoted URL ends at the first |.
    `(?:(?<quote>["'])https?://[^\\s"']+\\k<quote>|(?<!["'])https?://[^\\s"'|]+)`,
    // Optional flags after the URL, such as -fsSL or -qO-.
    `(\\s[-A-Za-z \\t]{0,${MAX_DOWNLOAD_ARGS_CHARS}})?`,
    // Pipe or chain into an interpreter, with optional sudo flags and directory,
    // such as | sudo -E bash or | /bin/bash.
    `(\\||&&)\\s*(sudo\\s[-A-Za-z \\t]{0,${MAX_SUDO_FLAGS_CHARS}})?`,
    `(/[\\w./-]{0,${MAX_INTERPRETER_DIR_CHARS}}/)?`,
    // python -c/-m and node -e/-p do not match: they run an inline program and read
    // stdin as data, as in curl ... | python3 -m json.tool.
    '(bash|sh|zsh|python3?(?!\\s+-[cm]\\b)|node(?!\\s+-[ep]\\b))\\b',
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
  prepareContent: maskSecurityEducationExampleContext,
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
// Any urllib call inside exec(), such as exec(urllib.request.urlopen(url).read()).
const urllibExecPattern = /\bexec\s*\(\s*urllib\./;
const awaitFetchEvalPattern =
  /eval\s*\(\s*await\s+(?:resp|response|res|r|data)\s*\.\s*text\s*\(\s*\)/;

export const SKILL_FETCH_AND_EXEC: Rule = {
  id: 'SKILL-FETCH-AND-EXEC',
  category: 'skill-specific',
  severity: 'critical',
  appliesTo: [...SKILL_FILES, ...SCRIPT_AND_CODE_FILES],
  patterns: [fetchThenEvalPattern, requestsExecPattern, urllibExecPattern, awaitFetchEvalPattern],
  prepareContent: maskSecurityEducationExampleContext,
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
  prepareContent: maskSecurityEducationExampleContext,
  message: 'Password-protected zip extraction detected — AV-evasion IOC (ClawHavoc pattern).',
  fix: 'Do not embed or execute password-protected archives. This is a known AV-evasion technique used by ClawHavoc and similar payloads.',
  cwe: ['CWE-506'],
};

// ---------------------------------------------------------------------------
// SKILL-MEMORY-WRITE (High)
// Writing to agent config/memory dirs or appending to context-injection files
// ---------------------------------------------------------------------------
const claudeContextTarget = String.raw`~[/\\]\.claude[/\\](?:CLAUDE(?:\.local)?\.md\b|settings(?:\.local)?\.json\b|(?:commands|agents|skills)[/\\]|plugins[/\\][^#\n]+[/\\](?:commands|agents|skills)[/\\])`;
const agentContextWriteTarget = String.raw`(?:${claudeContextTarget}|~[/\\]\.cursor[/\\]|~[/\\]\.codex[/\\](?:AGENTS(?:\.override)?\.md|config\.toml)\b|(?:^|[\s"'=:(>/])\.codex[/\\]config\.toml\b|~[/\\]\.gemini[/\\](?:settings\.json\b|agents[/\\])|~[/\\]\.agents[/\\]skills[/\\]|(?:^|[\s"'=:(>/])(?:CLAUDE|AGENTS|GEMINI)\.md\b|(?:^|[\s"'=:(>/])AGENTS\.override\.md\b|\.cursorrules\b|\.windsurfrules\b|\.config[/\\]skill-audit\b)`;
const writeOperation = String.raw`(?:(?:[Ww]rite|[Aa]ppend|[Ee]cho|[Pp]rintf)\b|[Cc]at\s+>>?|[Tt]ee(?:\s+-a)?\b)`;
const fsWriteOperation = [
  String.raw`fs\.(?:writeFile|appendFile)(?:Sync)?\s*\([^#\n]*${agentContextWriteTarget}`,
  String.raw`open\s*\([^#\n]*${agentContextWriteTarget}[^#\n]*,\s*["'][wa]`,
].join('|');
const notNegatedLine = String.raw`(?![^#\n]*\b(?:[Mm]ust\s+[Nn][Oo][Tt]|[Dd]o\s+[Nn]ot|[Nn]ever)\b)`;
// The line start has no separate indentation quantifier: [^#\n]* already spans
// it, and two adjacent quantifiers over the same spaces backtrack quadratically
// on long whitespace lines, such as a minified bundle after context masking.
const writeToAgentContextPattern = new RegExp(
  String.raw`(?:^|\n)${notNegatedLine}[^#\n]*(?<finding>(?:${writeOperation}[^#\n]*${agentContextWriteTarget}|${agentContextWriteTarget}[^#\n]*\b(?:[Ww]rite|[Aa]ppend)\b))`
);
const fsWriteAgentContextPattern = new RegExp(
  String.raw`(?:^|\n)${notNegatedLine}[^#\n]*(?<finding>(?:${fsWriteOperation}))`
);

export const SKILL_MEMORY_WRITE: Rule = {
  id: 'SKILL-MEMORY-WRITE',
  category: 'skill-specific',
  severity: 'high',
  appliesTo: [...SKILL_FILES, ...SCRIPT_AND_CODE_FILES],
  patterns: [writeToAgentContextPattern, fsWriteAgentContextPattern],
  prepareContent: maskSecurityEducationExampleContext,
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

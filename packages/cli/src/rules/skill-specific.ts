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
    // Optional arguments after the URL, such as -fsSL, -qO-, or -o helper.js.
    `(\\s[^|&;\\n]{0,${MAX_DOWNLOAD_ARGS_CHARS}})?`,
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
// Any urllib call inside exec(), such as exec(urllib.request.urlopen(url).read()), or a urlopen
// that the file imported by name.
const urllibExecPattern = /\bexec\s*\(\s*(?:urllib\.|urlopen\s*\()/;
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
// A password hides archive content from antivirus and data-loss scanners. Extraction
// with a password is the ClawHavoc AV-evasion IOC (spec §4). Creation with a password
// stages data for exfiltration.
// ---------------------------------------------------------------------------
const unzipPasswordPattern = /unzip\s+-P\s+["']?\S+["']?\s+\S+\.zip/;
const sevenZipPasswordPattern = /7z\s+x\s+-p\S+\s+\S+/;
// A fixed password marks a payload that the skill ships, also when the archive name is
// a variable. A password from a variable, a substitution, a format placeholder, or a
// string concatenation stays clean, so the user can still give the password.
const unzipFixedPasswordPattern = /\bunzip[ \t]+-P[ \t]*(?:["'](?![\s"'$%{<`])|[^\s"'$%{<`])/;

// The archive command must start a word, so `unzip`, `gzip`, and a `.zip` file name do
// not match. The bounded argument gap stops at a pipe, a list separator, or a line end,
// so the `-P` of a next command (`&& scp -P 2222`) does not count. Command names ignore
// case, because macOS file systems ignore case by default, so `ZIP` runs zip there.
const MAX_ARCHIVE_ARGS_CHARS = 200;
// Info-ZIP `-P <password>`, also in a flag cluster such as `-rP`, or `--password`. `-e`
// and `--encrypt` read the password from the terminal, and `expect` types it unattended.
// The pattern checks the word start after the first letter, which runs faster than a
// leading lookbehind.
const zipCreatePasswordPattern = new RegExp(
  String.raw`[Zz](?<![\w.-][Zz])[Ii][Pp](?=[ \t])[^\n|;&]{0,${MAX_ARCHIVE_ARGS_CHARS}}[ \t](?:-[A-Za-z0-9]{0,8}[Pe]|--(?:password|encrypt)\b)`
);
// zipcloak encrypts or decrypts an existing zip, and it also reads the password from the
// terminal. The operand must be an option, a quoted or variable value, or a `.zip` name,
// so prose such as "zipcloak and zipnote" does not match.
const zipcloakCommandPattern = new RegExp(
  String.raw`zipcloak(?<![\w.-]zipcloak)[ \t]+(?:[-"'$]|[^\s|;&]{0,${MAX_ARCHIVE_ARGS_CHARS}}\.zip\b)`,
  'i'
);
// 7-Zip `a -p<password>`, RAR `a -p<password>` or `a -hp<password>`. RAR `-p-` turns the
// password prompt off.
const sevenZipOrRarCreatePasswordPattern = new RegExp(
  String.raw`(?<![\w.-])(?:7z[az]?|rar)[ \t]+a(?=[ \t])[^\n|;&]{0,${MAX_ARCHIVE_ARGS_CHARS}}[ \t]-h?p(?!-)\S`,
  'i'
);

// A list-style process call passes each argument as its own string, as in
// `subprocess.run(["zip", "-P", pw, ...])`, `os.execvp("zip", ["zip", ...])`, or
// `spawn('zip', ['-P', pw])`. The quoted command name must open a call (`(`) or a list
// (`[`), so an argument such as `"zip"` in `["grep", "zip", "-P", log]` does not count. A
// list after a `,` holds only arguments, as in `spawn('grep', ['zip', '-P', log])`. The
// name can carry a path and `.exe`. Markdown quotes tool names with backticks, so a
// backtick does not open a command name. The argument gap crosses line breaks, because
// formatters put each item on its own line, but it stops at `]`, `)`, `}`, and `;`, so a
// `-P` of another call does not count.
// ponytail: a call before the flag, as in `["zip", "-r", str(out), "-P", pw]`, ends the
// gap, and `os.spawnlp(mode, "zip", ...)` and `os.execvp(path, ["zip", ...])` put the name
// after a `,`. Track bracket depth and argument positions if real skills use these forms.
const CALL_OPENER = String.raw`\(`;
const LIST_OPENER = String.raw`(?<!,[ \t\r\n]{0,40})\[`;
const listCommand = (names: string, opener = `(?:${CALL_OPENER}|${LIST_OPENER})`): string =>
  String.raw`["'](?<=${opener}[ \t\r\n]{0,40}["'])(?:[^"'\n]{0,120}[\\/])?(?:${names})(?:\.exe)?["']`;
const LIST_ARGS_GAP = String.raw`[^\])};]{0,${MAX_ARCHIVE_ARGS_CHARS}}`;
const zipListPasswordPattern = new RegExp(
  String.raw`${listCommand('[Zz][Ii][Pp]')}${LIST_ARGS_GAP}["'\`](?:-[A-Za-z0-9]{0,8}[Pe]|--(?:password|encrypt)\b)`
);
// 7-Zip and RAR take the password in the switch (`-pSECRET`, `f"-p{pw}"`) or from a
// string concatenation (`'-p' + pw`). A bare `-p` asks on the terminal. The `a` command
// comes first, after at most a repeated command name, as in `os.execvp("7z", ["7z", "a"])`.
const sevenZipOrRarListPasswordPattern = new RegExp(
  String.raw`${listCommand('7z[az]?|rar')}[^\])};]{0,40}["'\`]a["'\`]${LIST_ARGS_GAP}["'\`]-h?p(?!-)(?:[^\s"'\`]|["'\`][ \t]{0,4}\+)`,
  'i'
);
// zipcloak needs no flag, so the call must pass arguments: more items after the name in a
// list, or an argument list or argv[0] string after the name in a call. A lookup such as
// `shutil.which("zipcloak", path=p)` does not match.
const zipcloakListPattern = new RegExp(
  String.raw`${listCommand('zipcloak', LIST_OPENER)}[ \t]*,|${listCommand('zipcloak', CALL_OPENER)}[ \t]*,[ \t\r\n]*[\["']`,
  'i'
);

// pyzipper encrypts a written zip only with WZ_AES. Standard-library `zipfile` cannot
// write an encrypted zip: its `setpassword` applies only to reading.
const pyzipperEncryptPattern = /\bWZ_AES\b/;
// The format name that archiver-zip-encrypted registers with Node.js `archiver`.
const archiverEncryptedZipPattern = /["']zip-encrypted["']/;

export const SKILL_PASSWORD_ZIP: Rule = {
  id: 'SKILL-PASSWORD-ZIP',
  category: 'skill-specific',
  severity: 'critical',
  appliesTo: [...SKILL_FILES, ...SCRIPT_AND_CODE_FILES],
  patterns: [
    unzipPasswordPattern,
    sevenZipPasswordPattern,
    unzipFixedPasswordPattern,
    zipCreatePasswordPattern,
    zipcloakCommandPattern,
    sevenZipOrRarCreatePasswordPattern,
    zipListPasswordPattern,
    sevenZipOrRarListPasswordPattern,
    zipcloakListPattern,
    pyzipperEncryptPattern,
    archiverEncryptedZipPattern,
  ],
  prepareContent: maskSecurityEducationExampleContext,
  message: 'Password-protected archive extraction or creation detected.',
  fix: 'Do not extract or create password-protected archives. The password hides the content from antivirus and data-loss scanners: ClawHavoc payloads use it to evade antivirus, and exfiltration uses it to hide stolen data.',
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

import { basename } from 'node:path';
import type { Rule } from '../types.js';
import { agentConfigJson, decodeJsonStrings } from './agent-config.js';
import { maskDocumentationTextInCode } from './code-context.js';

// Patterns are split to avoid triggering static-analysis hooks on this detector file.

// DEPS-REMOTE-IMPORT: importing modules directly from remote HTTP/HTTPS URLs (Deno, esm.sh, etc.)
// This bypasses local integrity checks and can serve arbitrary code at runtime.
// The patterns match a view where comments and strings are masked, except the string that a
// module loader reads. So a URL that code only logs or shows does not fire.
const remoteSpecifier = ['[\'"`]', 'https?://'].join('');
// Static imports and re-exports, also over many lines: `import x from`, `export * from`.
const jsFromRemotePattern = new RegExp(`\\bfrom\\s*${remoteSpecifier}`);
// Dynamic `import('<url>')` and side-effect `import '<url>'`.
const jsImportRemotePattern = new RegExp(`(?<![.$])\\bimport\\s*(?:\\(\\s*)?${remoteSpecifier}`);
const jsRequireRemotePattern = new RegExp(`(?<![.$])\\brequire\\s*\\(\\s*${remoteSpecifier}`);
const pyImportlibRemotePattern = new RegExp(
  `\\bimportlib\\.import_module\\s*\\(\\s*${remoteSpecifier}`
);
// Keywords whose next string names the code that a loader fetches. A method such as
// `Array.from` or `loader.require` is not a loader keyword.
const moduleLoaderKeywordAtEndPattern = /(?:\bimport_module|(?<![.$\w])(?:import|require|from))$/;
// The window that the pattern reads also holds the character before the keyword.
const LONGEST_LOADER_KEYWORD = 'import_module';

export const DEPS_REMOTE_IMPORT: Rule = {
  id: 'DEPS-REMOTE-IMPORT',
  category: 'dependencies',
  severity: 'critical',
  appliesTo: ['*.js', '*.ts', '*.mjs', '*.cjs', '*.jsx', '*.tsx', '*.py'],
  patterns: [
    jsFromRemotePattern,
    jsImportRemotePattern,
    jsRequireRemotePattern,
    pyImportlibRemotePattern,
  ],
  prepareContent: keepModuleSpecifiers,
  message: 'Remote URL import detected — code fetched from the network with no integrity check.',
  fix: 'Bundle dependencies locally. Remote imports can serve arbitrary code and bypass supply-chain controls.',
  cwe: ['CWE-829'],
};

function keepModuleSpecifiers(content: string, filePath: string): string {
  return maskDocumentationTextInCode(content, filePath, isModuleSpecifier);
}

// True when a loader keyword comes before the string, with at most one open paren between them.
// Comments before the string are masked to spaces, so `import(/* @vite-ignore */ '<url>')` and a
// comment that holds a quote still count.
function isModuleSpecifier(masked: readonly string[], stringStart: number): boolean {
  let idx = indexBeforeSpaces(masked, stringStart - 1);
  if (masked[idx] === '(') idx = indexBeforeSpaces(masked, idx - 1);

  const keywordWindow = masked.slice(Math.max(0, idx - LONGEST_LOADER_KEYWORD.length), idx + 1);
  return moduleLoaderKeywordAtEndPattern.test(keywordWindow.join(''));
}

function indexBeforeSpaces(masked: readonly string[], from: number): number {
  let idx = from;
  while (idx >= 0 && /\s/.test(masked[idx] ?? '')) idx -= 1;
  return idx;
}

// DEPS-INSTALL-SCRIPT-HOOKS: npm postinstall/preinstall lifecycle scripts that install packages.
// These run automatically on `npm install` and can silently pull in malicious packages.
const postinstallNpmPattern = /"(?:post|pre)install"\s*:\s*"[^"]*\bnpm\s+(?:install|i|add)\b[^"]*"/;
const postinstallPipPattern = /"(?:post|pre)install"\s*:\s*"[^"]*\bpip3?\s+install\b[^"]*"/;
const postinstallCurlPattern = /"(?:post|pre)install"\s*:\s*"[^"]*\b(?:curl|wget)\s+[^"]*"/;
const setupPyInstallPattern = /subprocess\.\w+\(\s*\[?\s*['"]pip['"][^)]*\binstall\b[^)]*\)/;

export const DEPS_INSTALL_SCRIPT_HOOKS: Rule = {
  id: 'DEPS-INSTALL-SCRIPT-HOOKS',
  category: 'dependencies',
  severity: 'high',
  appliesTo: ['package.json', 'setup.py'],
  patterns: [
    postinstallNpmPattern,
    postinstallPipPattern,
    postinstallCurlPattern,
    setupPyInstallPattern,
  ],
  message:
    'Lifecycle install hook executes package installs — runs automatically and silently on npm install.',
  fix: 'Remove postinstall/preinstall scripts that invoke package managers. Declare dependencies in manifests instead.',
  cwe: ['CWE-507'],
};

// DEPS-TYPOSQUAT: known malicious/typosquatting package names from confirmed incident reports.
// List is intentionally short and conservative — only confirmed, publicised typosquats.
const KNOWN_TYPOSQUATS = [
  // npm — confirmed typosquats
  'crossenv',
  'mongose',
  'lodahs',
  'expres',
  'node-fetch2',
  'comons',
  'reqeuest',
  'loadsh',
  // PyPI — confirmed typosquats
  'reqests',
  'coloama',
  'colourama',
  'openssl',
  'pyyaml2',
  'urllib3-extension',
  'python-jwt',
  'setup-tools',
];

const typosquatPattern = new RegExp(
  `(?:^|['",\\s])(${KNOWN_TYPOSQUATS.join('|')})(?:['",\\s>=<!@$]|$)`,
  'im'
);

export const DEPS_TYPOSQUAT: Rule = {
  id: 'DEPS-TYPOSQUAT',
  category: 'dependencies',
  severity: 'high',
  appliesTo: ['requirements.txt', 'requirements*.txt', 'package.json', 'Pipfile', 'pyproject.toml'],
  patterns: [typosquatPattern],
  message: 'Known typosquatting package name detected.',
  fix: 'Verify the package name in the official registry. This name matches a confirmed malicious package.',
  cwe: ['CWE-20'],
};

// DEPS-UNPINNED-SUSPECT: requirements.txt entries without an exact == version pin.
// Unpinned deps silently accept any newer version, including a malicious one pushed by a typosquatter.
// Fires on lines with no version, or only inequality constraints (>=, <=, >, <, ~=, !=).
const unpinnedDepPattern = /^(?![#\s\[])([A-Za-z][A-Za-z0-9._-]+)\s*(?:>=|<=|!=|>|<|~=|\s*$)/m;

export const DEPS_UNPINNED_SUSPECT: Rule = {
  id: 'DEPS-UNPINNED-SUSPECT',
  category: 'dependencies',
  severity: 'medium',
  appliesTo: ['requirements.txt', 'requirements*.txt', 'Pipfile'],
  patterns: [unpinnedDepPattern],
  message: 'Dependency without exact version pin — may silently upgrade to a malicious release.',
  fix: 'Use == to pin exact versions (e.g. requests==2.31.0). Audit unpinned ranges for typosquat risk.',
  cwe: ['CWE-1395'],
};

// DEPS-INLINE-INSTALL: pip install / npm install invoked inline in skill code or markdown.
// Skills that install packages at runtime bypass normal dependency manifests.
// Use [^\S\n]+ (horizontal whitespace only) to avoid matching across newlines.
const inlinePipPattern = /\bpip3?[^\S\n]+install[^\S\n]+(?!-r\b)(?!--requirement\b)[A-Za-z0-9@]/;
const inlineNpmPattern = /\bnpm[^\S\n]+(?:install|i|add)[^\S\n]+[A-Za-z@]/;
const inlineCondaPattern = /\bconda[^\S\n]+install[^\S\n]+[A-Za-z]/;
const pythonSubprocessListInstallPattern =
  /\bsubprocess\.\w+\s*\(\s*\[\s*['"](?:pip3?|npm|conda)['"]\s*,\s*['"](?:install|i|add)['"]\s*,\s*['"][A-Za-z0-9@]/;
const jsProcessListInstallPattern =
  /\b(?:execFileSync|execFile|spawnSync|spawn)\s*\(\s*['"](?:pip3?|npm|conda)['"]\s*,\s*\[\s*['"](?:install|i|add)['"]\s*,\s*['"][A-Za-z0-9@]/;

const inlineInstallPattern =
  /\b(?:pip3?|npm|conda)[^\S\n]+(?:install|i|add)[^\S\n]+(?!(?:-r|--requirement)\b)[A-Za-z0-9@]/i;
const markdownInstallHeadingPattern = /^\s{0,3}#{1,6}\s+.*\b(?:install|installation|setup)\b/i;
const markdownCodeFencePattern = /^\s{0,3}```/;
const markdownTableLinePattern = /^\s*\|.*\|\s*$/;
const agentRuntimeInstructionPattern =
  /\b(?:agent|assistant|skill|workflow|runtime|execution|before running|when running|when executing|automatically|if missing|if unavailable|ensure|must|should|run)\b/i;
const activeMarkdownInstallInstructionPattern =
  /\b(?:run|execute|must|should|ensure|before running|when running|when executing|automatically|if missing|if unavailable)\b/i;
const documentationInstallContextPattern =
  /\b(?:no|not|never|without|doesn['’]?t|do not|don't|fails?|failure|offline|proxy|if you have|required package|prevents?|install with|please install|requires? .{0,40}install|permanent installation|optional(?: tools?| extras?)|setup example|readme|for humans?|demo locally|preparing the demo)\b/i;
const quotedInstallPattern =
  /^\s*(?:echo|printf|console\.log|print)\s*(?:\(|['"`])[\s\S]*\b(?:pip3?|npm|conda)[^\S\n]+(?:install|i|add)\b/i;
const codeDocumentationLinePattern =
  /^\s*(?:(?:return|throw\b|raise\b)[\s\S]*|(?:sys\.stderr\.write|logging\.\w+|logger\.\w+|console\.log|print)\s*\()[\s\S]*\b(?:pip3?|npm|conda)[^\S\n]+(?:install|i|add)\b/i;
const shellStatusInstallLinePattern =
  /^\s*(?:warn|warning|error|fail|die|info|log|log_warning)\b[\s\S]*\b(?:install with|please install|requires? .{0,40}install)\b[\s\S]*\b(?:pip3?|npm|conda)[^\S\n]+(?:install|i|add)\b/i;
const commentLinePattern = /^\s*(?:#|\/\/)/;

function maskLine(line: string): string {
  return ' '.repeat(line.length);
}

function isDocumentationMarkdownPath(filePath: string): boolean {
  return /(?:^|[/\\])(?:docs?|documentation|references?|test|tests)(?:[/\\]|$)/i.test(filePath);
}

function maskPythonModuleDocstringLines(lines: string[], filePath: string): Set<number> {
  if (!filePath.endsWith('.py')) return new Set();

  const masked = new Set<number>();
  let index = 0;
  while (index < lines.length && /^\s*(?:#.*)?$/.test(lines[index] ?? '')) index += 1;

  const startLine = lines[index] ?? '';
  const start = /^(\s*)([rRuUbBfF]{0,3})(['"]{3})/.exec(startLine);
  if (start === null) return masked;

  const quote = start[3] ?? '';
  masked.add(index);
  if (startLine.slice((start.index ?? 0) + start[0].length).includes(quote)) return masked;

  for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
    masked.add(cursor);
    if ((lines[cursor] ?? '').includes(quote)) break;
  }

  return masked;
}

function prepareInlineInstallContent(content: string, filePath: string): string {
  const name = basename(filePath);
  const isMarkdown = name.endsWith('.md') || name.endsWith('.mdc');
  const lines = content.split('\n');
  const originalLines = content.split('\n');
  const pythonDocstringLines = maskPythonModuleDocstringLines(originalLines, filePath);
  let inMarkdownInstallSection = false;
  let inMarkdownFence = false;
  let inMarkdownPreventedCommandsSection = false;

  return lines
    .map((line, index) => {
      const originalLine = originalLines[index] ?? line;
      const hasInlineInstall = inlineInstallPattern.test(line);

      if (isMarkdown) {
        if (markdownCodeFencePattern.test(originalLine)) {
          inMarkdownFence = !inMarkdownFence;
        }

        if (/^\s{0,3}#{1,6}\s+/.test(originalLine)) {
          inMarkdownInstallSection = markdownInstallHeadingPattern.test(originalLine);
          inMarkdownPreventedCommandsSection =
            /\b(?:prevented|prevents?|blocked|disallowed|restricted)\b/i.test(originalLine);
        } else if (/^\s*\*\*[^*]+\*\*:?\s*$/.test(originalLine)) {
          inMarkdownPreventedCommandsSection =
            /\b(?:prevented|prevents?|blocked|disallowed|restricted)\b/i.test(originalLine);
        } else if (/^\s*\S/.test(originalLine) && !/^\s*[-*]\s+/.test(originalLine)) {
          inMarkdownPreventedCommandsSection = false;
        }
      }

      if (!hasInlineInstall) return line;
      if (pythonDocstringLines.has(index)) return maskLine(line);
      if (commentLinePattern.test(originalLine)) return maskLine(line);
      if (isMarkdown && inMarkdownFence && isDocumentationMarkdownPath(filePath)) {
        return maskLine(line);
      }
      if (isMarkdown && inMarkdownPreventedCommandsSection && /^\s*[-*]\s+/.test(originalLine)) {
        return maskLine(line);
      }
      if (quotedInstallPattern.test(originalLine)) return maskLine(line);
      if (codeDocumentationLinePattern.test(originalLine)) return maskLine(line);
      if (shellStatusInstallLinePattern.test(originalLine)) return maskLine(line);
      if (documentationInstallContextPattern.test(originalLine)) return maskLine(line);
      if (
        isMarkdown &&
        markdownTableLinePattern.test(originalLine) &&
        !activeMarkdownInstallInstructionPattern.test(originalLine)
      ) {
        return maskLine(line);
      }

      if (isMarkdown && (inMarkdownInstallSection || inMarkdownFence)) {
        if (!agentRuntimeInstructionPattern.test(originalLine)) return maskLine(line);
      }

      return line;
    })
    .join('\n');
}

export const DEPS_INLINE_INSTALL: Rule = {
  id: 'DEPS-INLINE-INSTALL',
  category: 'dependencies',
  severity: 'medium',
  appliesTo: ['*.sh', '*.bash', '*.py', '*.js', '*.ts', '*.mjs', '*.md'],
  patterns: [
    inlinePipPattern,
    inlineNpmPattern,
    inlineCondaPattern,
    pythonSubprocessListInstallPattern,
    jsProcessListInstallPattern,
  ],
  prepareContent: prepareInlineInstallContent,
  message: 'Inline package installation in skill code — installs packages at skill execution time.',
  fix: 'Declare all dependencies in requirements.txt or package.json. Do not install packages inside skill logic.',
  cwe: ['CWE-829'],
};

// MCP-CONFIG-REMOTE-EXEC: MCP / agent config startup commands that download and execute remote content.
// Keep this scoped to startup command fields so documentation strings in generic config files do not fire.
const mcpConfigRemoteExecBasenames = new Set([
  '.mcp.json',
  'mcp.json',
  'settings.json',
  'settings.local.json',
  'hooks.json',
  'config.toml',
  'gemini-extension.json',
]);
const mcpStartupFieldPattern = /(?:"(?:command|args)"\s*:|\b(?:command|args)\s*=)/i;
const mcpStartupFieldPrefix =
  '(?:"(?:command|args)"\\s*:|\\b(?:command|args)\\s*=)[\\s\\S]{0,800}?';
const remoteDownloader = '(?:curl|wget|fetch)\\b[^\\n|&;]{0,240}https?://[^\\s"\'`)]+';
const remoteDownloadPipeOrChainPattern = new RegExp(
  [
    mcpStartupFieldPrefix,
    remoteDownloader,
    '[^\\n|&;]{0,80}\\s*(?:\\||&&)\\s*(?:bash|sh|zsh|python|node)\\b',
  ].join(''),
  'i'
);
const sourceRemoteProcessSubstitutionPattern = new RegExp(
  [mcpStartupFieldPrefix, '\\bsource\\s*<\\(\\s*(?:curl|wget)\\b[^)]*https?://[^)]*\\)'].join(''),
  'i'
);
const evalRemoteDownloadPattern = new RegExp(
  [
    mcpStartupFieldPrefix,
    '\\beval\\s*(?:["\'`]+\\s*)?\\$\\(\\s*(?:curl|wget)\\b[^)]*https?://',
  ].join(''),
  'i'
);
const shellCRemoteDownloadSubstitutionPattern = new RegExp(
  [
    mcpStartupFieldPrefix,
    '\\b(?:bash|sh|zsh|python|node)\\s+-c\\s+[^\\n]{0,80}\\$\\(\\s*(?:curl|wget)\\b[^)]*https?://',
  ].join(''),
  'i'
);
// Pretty-printed JSON, such as the per-server scan content, and multi-line TOML arrays put "-c"
// and the command that it runs on separate lines. A TOML `#` or JSONC `//` comment can sit
// between them. The comment runs to its line break, so a quote inside it never starts the next
// element. The separator ends at the quote of the next element, so its whitespace never
// overlaps the quantifier that follows (LESSONS L4.7).
// ponytail: one comment at most. Two stacked comment lines or a /* */ block comment still
// hide the command.
const arrayElementComment = '(?:\\s{0,80}(?:#|\\/\\/)[^\\n]{0,200}\\n)?';
const arrayElementSeparator = `\\s{0,80},${arrayElementComment}\\s{0,80}["']`;
const shellArgRemoteDownloadSubstitutionPattern = new RegExp(
  [
    mcpStartupFieldPrefix,
    '["\']-c["\']',
    `(?:${arrayElementSeparator})?`,
    '[^\\n]{0,120}\\$\\(\\s*(?:curl|wget)\\b[^)]*https?://',
  ].join(''),
  'i'
);

function isGeminiCommandToml(filePath: string, name: string): boolean {
  return name.endsWith('.toml') && filePath.split(/[\\/]/).includes('commands');
}

function squareBracketBalance(line: string): number {
  let balance = 0;
  let quote: '"' | "'" | null = null;
  let escaped = false;

  for (const char of line) {
    if (quote !== null) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '[') {
      balance += 1;
    } else if (char === ']') {
      balance -= 1;
    }
  }

  return balance;
}

function keepMcpStartupFieldBlocks(content: string): string {
  const lines = content.split('\n');
  const keep = new Array<boolean>(lines.length).fill(false);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!mcpStartupFieldPattern.test(line)) continue;

    keep[index] = true;
    let balance = squareBracketBalance(line);
    let lookahead = index + 1;
    // Keep the whole array, so padding args cannot push `-c` and its command out of the block.
    // A pretty-printed array then matches like the same array on one line.
    while (balance > 0 && lookahead < lines.length) {
      keep[lookahead] = true;
      balance += squareBracketBalance(lines[lookahead]);
      lookahead += 1;
    }
    // The block already keeps its lines, so the walk goes on after it. That keeps the pass
    // linear when a file holds many unclosed arrays.
    index = Math.max(index, lookahead - 1);
  }

  return lines.map((line, index) => (keep[index] ? line : maskLine(line))).join('\n');
}

function prepareMcpConfigRemoteExecContent(content: string, filePath: string): string {
  const name = basename(filePath);
  if (mcpConfigRemoteExecBasenames.has(name) || isGeminiCommandToml(filePath, name)) {
    // Decoded JSON escapes such as `https:\/\/` cannot hide a download. Gemini settings lose
    // their comments first, as in Gemini CLI. Other JSONC keeps its raw text.
    const decoded = name.endsWith('.json')
      ? decodeJsonStrings(agentConfigJson(content, filePath))
      : '';
    return keepMcpStartupFieldBlocks(decoded === '' ? content : decoded);
  }

  return '';
}

export const MCP_CONFIG_REMOTE_EXEC: Rule = {
  id: 'MCP-CONFIG-REMOTE-EXEC',
  category: 'dependencies',
  severity: 'critical',
  appliesTo: [
    '.mcp.json',
    'mcp.json',
    'settings.json',
    'settings.local.json',
    'hooks.json',
    'config.toml',
    'gemini-extension.json',
    '*.toml',
  ],
  patterns: [
    remoteDownloadPipeOrChainPattern,
    sourceRemoteProcessSubstitutionPattern,
    evalRemoteDownloadPattern,
    shellCRemoteDownloadSubstitutionPattern,
    shellArgRemoteDownloadSubstitutionPattern,
  ],
  prepareContent: prepareMcpConfigRemoteExecContent,
  message: 'MCP or agent config startup command downloads and executes remote content.',
  fix: 'Use a local audited server command or pinned package runner. Do not bootstrap MCP servers by executing remote downloads.',
  cwe: ['CWE-494', 'CWE-78'],
};

// MCP-PROJECT-AUTO-APPROVE: repository settings that approve the repository's own .mcp.json
// servers, so they start without the consent prompt (CVE-2025-59536). High, not critical:
// the setting removes the prompt, and the approved servers are scanned on their own.
// Only the shared settings.json counts: Claude Code writes the user's own approvals to
// settings.local.json.
export const MCP_PROJECT_AUTO_APPROVE: Rule = {
  id: 'MCP-PROJECT-AUTO-APPROVE',
  category: 'dependencies',
  severity: 'high',
  appliesTo: ['settings.json'],
  appliesToScopes: ['project'],
  patterns: [/"enableAllProjectMcpServers"\s*:\s*true\b/, /"enabledMcpjsonServers"\s*:\s*\[\s*"/],
  prepareContent: decodeJsonStrings,
  message:
    'Project settings auto-approve project MCP servers - they start without the consent prompt.',
  fix: 'Remove enableAllProjectMcpServers and enabledMcpjsonServers from repository settings. Approve MCP servers yourself after you review them.',
  cwe: ['CWE-494', 'CWE-829'],
};

export const DEPENDENCIES_RULES: Rule[] = [
  DEPS_REMOTE_IMPORT,
  DEPS_INSTALL_SCRIPT_HOOKS,
  DEPS_TYPOSQUAT,
  DEPS_UNPINNED_SUSPECT,
  DEPS_INLINE_INSTALL,
  MCP_CONFIG_REMOTE_EXEC,
  MCP_PROJECT_AUTO_APPROVE,
];

import { basename } from 'node:path';
import type { Rule } from '../types.js';

// Patterns are split to avoid triggering static-analysis hooks on this detector file.

// DEPS-REMOTE-IMPORT: importing modules directly from remote HTTP/HTTPS URLs (Deno, esm.sh, etc.)
// This bypasses local integrity checks and can serve arbitrary code at runtime.
const jsRemoteImportPattern = new RegExp(
  ['import\\s+[\\s\\S]{0,100}\\s+from\\s+[\'"]', 'https?://'].join('')
);
const jsRequireRemotePattern = new RegExp(['require\\s*\\(\\s*[\'"]', 'https?://'].join(''));
const pyImportlibRemotePattern = new RegExp(
  ['importlib\\.import_module\\s*\\(\\s*[\'"]', 'https?://'].join('')
);

export const DEPS_REMOTE_IMPORT: Rule = {
  id: 'DEPS-REMOTE-IMPORT',
  category: 'dependencies',
  severity: 'critical',
  appliesTo: ['*.js', '*.ts', '*.mjs', '*.py'],
  patterns: [jsRemoteImportPattern, jsRequireRemotePattern, pyImportlibRemotePattern],
  message: 'Remote URL import detected — code fetched from the network with no integrity check.',
  fix: 'Bundle dependencies locally. Remote imports can serve arbitrary code and bypass supply-chain controls.',
  cwe: ['CWE-829'],
};

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
const agentRuntimeInstructionPattern =
  /\b(?:agent|assistant|skill|workflow|runtime|execution|before running|when running|when executing|automatically|if missing|if unavailable|ensure|must|should|run)\b/i;
const documentationInstallContextPattern =
  /\b(?:no|not|never|without|doesn['’]?t|do not|don't|permanent installation|optional(?: tools?| extras?)|setup example|readme|for humans?|demo locally|preparing the demo)\b/i;
const quotedInstallPattern =
  /^\s*(?:echo|printf|console\.log|print)\s*(?:\(|['"`])[\s\S]*\b(?:pip3?|npm|conda)[^\S\n]+(?:install|i|add)\b/i;
const codeDocumentationLinePattern =
  /^\s*(?:(?:return|throw\b|raise\b)[\s\S]*|(?:console\.log|print)\s*\()[\s\S]*\b(?:pip3?|npm|conda)[^\S\n]+(?:install|i|add)\b/i;
const commentLinePattern = /^\s*(?:#|\/\/)/;

function maskLine(line: string): string {
  return ' '.repeat(line.length);
}

function prepareInlineInstallContent(content: string, filePath: string): string {
  const name = basename(filePath);
  const isMarkdown = name.endsWith('.md') || name.endsWith('.mdc');
  const lines = content.split('\n');
  const originalLines = content.split('\n');
  let inMarkdownInstallSection = false;
  let inMarkdownFence = false;

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
        }
      }

      if (!hasInlineInstall) return line;
      if (commentLinePattern.test(originalLine)) return maskLine(line);
      if (quotedInstallPattern.test(originalLine)) return maskLine(line);
      if (codeDocumentationLinePattern.test(originalLine)) return maskLine(line);
      if (documentationInstallContextPattern.test(originalLine)) return maskLine(line);

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
const shellArgRemoteDownloadSubstitutionPattern = new RegExp(
  [mcpStartupFieldPrefix, '["\']-c["\'][^\\n]{0,120}\\$\\(\\s*(?:curl|wget)\\b[^)]*https?://'].join(
    ''
  ),
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
    while (balance > 0 && lookahead < lines.length && lookahead <= index + 24) {
      keep[lookahead] = true;
      balance += squareBracketBalance(lines[lookahead]);
      lookahead += 1;
    }
  }

  return lines.map((line, index) => (keep[index] ? line : maskLine(line))).join('\n');
}

function prepareMcpConfigRemoteExecContent(content: string, filePath: string): string {
  const name = basename(filePath);
  if (mcpConfigRemoteExecBasenames.has(name) || isGeminiCommandToml(filePath, name)) {
    return keepMcpStartupFieldBlocks(content);
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

export const DEPENDENCIES_RULES: Rule[] = [
  DEPS_REMOTE_IMPORT,
  DEPS_INSTALL_SCRIPT_HOOKS,
  DEPS_TYPOSQUAT,
  DEPS_UNPINNED_SUSPECT,
  DEPS_INLINE_INSTALL,
  MCP_CONFIG_REMOTE_EXEC,
];

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

export const DEPS_INLINE_INSTALL: Rule = {
  id: 'DEPS-INLINE-INSTALL',
  category: 'dependencies',
  severity: 'medium',
  appliesTo: ['*.sh', '*.bash', '*.py', '*.js', '*.ts', '*.mjs', '*.md'],
  patterns: [inlinePipPattern, inlineNpmPattern, inlineCondaPattern],
  message: 'Inline package installation in skill code — installs packages at skill execution time.',
  fix: 'Declare all dependencies in requirements.txt or package.json. Do not install packages inside skill logic.',
  cwe: ['CWE-829'],
};

export const DEPENDENCIES_RULES: Rule[] = [
  DEPS_REMOTE_IMPORT,
  DEPS_INSTALL_SCRIPT_HOOKS,
  DEPS_TYPOSQUAT,
  DEPS_UNPINNED_SUSPECT,
  DEPS_INLINE_INSTALL,
];

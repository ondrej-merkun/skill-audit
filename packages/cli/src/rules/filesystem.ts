import type { Rule } from '../types.js';
import {
  maskDocumentationExampleContext,
  maskSecurityEducationExampleContext,
} from './code-context.js';

// Patterns using RegExp constructor to avoid triggering static-analysis hooks on this detector file.

// FS-CREDSTORE: path-literal access to known credential stores — per spec §4
const sshKeyPattern = /~\/\.ssh\/(id_[rd]sa|id_ecdsa|id_ed25519|authorized_keys)/;
const awsCredPattern = /~\/\.aws\/(credentials|config)/;
const gitConfigCredPattern = /~\/\.config\/(gh\/hosts\.yml|git\/credentials)/;
const dotfileCredsPattern = /~\/\.(netrc|npmrc|pypirc|git-credentials)/;
const dockerKubePattern = /~\/\.(docker\/config\.json|kube\/config)/;
const libKeychainPattern = /~\/Library\/Keychains\//;
// Split to avoid triggering scanners on this detector file itself.
const etcPasswdPattern = new RegExp(['\\/', 'etc\\/(passwd|shadow)'].join(''));

export const FS_CREDSTORE: Rule = {
  id: 'FS-CREDSTORE',
  category: 'filesystem',
  severity: 'critical',
  appliesTo: ['*.py', '*.sh', '*.bash', '*.js', '*.ts', '*.mjs', '*.md'],
  patterns: [
    sshKeyPattern,
    awsCredPattern,
    gitConfigCredPattern,
    dotfileCredsPattern,
    dockerKubePattern,
    libKeychainPattern,
    etcPasswdPattern,
  ],
  prepareContent: maskDocumentationExampleContext,
  message: 'Access to a known credential store path detected.',
  fix: 'Remove references to ~/.ssh, ~/.aws/credentials, ~/.kube/config and other credential stores.',
  cwe: ['CWE-522'],
};

// FS-BROWSER-CREDENTIALSTORE: exact browser credential/cookie store paths.
const browserStoreHomePrefix = '(?:~|\\$HOME|\\$\\{HOME\\})\\/';
const browserStoreTerminator = '(?![A-Za-z0-9._/-]| [A-Za-z0-9._-])';
const chromiumConfigRoot =
  '(?:Library\\/Application Support\\/(?:Google\\/Chrome|Chromium)|\\.config\\/(?:google-chrome|chromium))';
const chromiumBrowserStorePattern = new RegExp(
  [
    browserStoreHomePrefix,
    chromiumConfigRoot,
    '\\/',
    '(?:(?:Default|Profile [0-9]+|Guest Profile)\\/(?:Login Data|(?:Network\\/)?Cookies)|Local State)',
    browserStoreTerminator,
  ].join('')
);
const firefoxBrowserStorePattern = new RegExp(
  [
    browserStoreHomePrefix,
    '(?:Library\\/Application Support\\/Firefox\\/Profiles|\\.mozilla\\/firefox)',
    '\\/[^\\/\\s]+\\/(?:key4\\.db|logins\\.json|cookies\\.sqlite)',
    browserStoreTerminator,
  ].join('')
);
const safariBrowserStorePattern = new RegExp(
  [
    browserStoreHomePrefix,
    'Library\\/(?:Cookies\\/Cookies\\.binarycookies|Containers\\/com\\.apple\\.Safari\\/Data\\/Library\\/(?:Cookies\\/Cookies\\.binarycookies|Safari\\/LocalStorage)|Safari\\/LocalStorage)',
    browserStoreTerminator,
  ].join('')
);

export const FS_BROWSER_CREDENTIALSTORE: Rule = {
  id: 'FS-BROWSER-CREDENTIALSTORE',
  category: 'filesystem',
  severity: 'critical',
  appliesTo: ['*.py', '*.sh', '*.bash', '*.js', '*.ts', '*.mjs', '*.md'],
  patterns: [chromiumBrowserStorePattern, firefoxBrowserStorePattern, safariBrowserStorePattern],
  prepareContent: maskSecurityEducationExampleContext,
  message: 'Access to a browser credential or cookie store path detected.',
  fix: 'Remove references to browser Login Data, Cookies, Local State, Firefox profile databases, or Safari cookie/storage paths.',
  cwe: ['CWE-522'],
};

// FS-KEYCHAIN-ACCESS: programmatic access to macOS Keychain or system credential managers
const securityCliPattern = /\bsecurity\s+find-(?:generic|internet)-password\b/;
const pythonKeyringPattern = /\bkeyring\.get_password\s*\(/;
const nodeKeytarPattern = /\bkeytar\.getPassword\s*\(/;

export const FS_KEYCHAIN_ACCESS: Rule = {
  id: 'FS-KEYCHAIN-ACCESS',
  category: 'filesystem',
  severity: 'critical',
  appliesTo: ['*.py', '*.sh', '*.bash', '*.js', '*.ts', '*.mjs'],
  patterns: [securityCliPattern, pythonKeyringPattern, nodeKeytarPattern],
  prepareContent: maskSecurityEducationExampleContext,
  message: 'Programmatic access to macOS Keychain or system credential store detected.',
  fix: 'Skills must not read from system credential stores. Remove keychain access calls.',
  cwe: ['CWE-522'],
};

// FS-DOTENV-READ: explicit .env file reads or dotenv library loading
const pyLoadDotenvPattern = /\bload_dotenv\s*\(/;
const pyOpenDotenvPattern = /open\s*\(\s*['"]\s*\.env['"]/;
const jsReadDotenvPattern = /readFileSync\s*\(\s*['"]\s*\.env['"]/;
const shellCatDotenvPattern = /\bcat\s+\.env\b/;
// Require + .config() call on dotenv — split to avoid scanner self-match.
const nodeRequireDotenvPattern = new RegExp(
  ['require\\s*\\(\\s*[\'"]dotenv[\'"]\\s*\\)', '\\.config\\s*\\('].join('')
);

export const FS_DOTENV_READ: Rule = {
  id: 'FS-DOTENV-READ',
  category: 'filesystem',
  severity: 'high',
  appliesTo: ['*.py', '*.sh', '*.bash', '*.js', '*.ts', '*.mjs'],
  patterns: [
    pyLoadDotenvPattern,
    pyOpenDotenvPattern,
    jsReadDotenvPattern,
    shellCatDotenvPattern,
    nodeRequireDotenvPattern,
  ],
  prepareContent: maskSecurityEducationExampleContext,
  message: 'Explicit .env file read — skill may be harvesting project secrets.',
  fix: 'Skills must not read .env files. Remove dotenv loading and .env file reads.',
  cwe: ['CWE-200'],
};

// FS-BOUNDARY-ESCAPE: path traversal or access to protected system paths
// Two or more ../ traversal sequences indicating escape attempts.
const pathTraversalPattern = /(?:\.\.\/){2,}/;
// /proc/<pid>/environ — process environment harvesting. Split to avoid self-match.
const procEnvironPattern = new RegExp(['\\/proc\\/', '(?:self|[0-9]+)\\/environ'].join(''));
// /etc/sudoers — privilege escalation indicator. Split to avoid self-match.
const etcSudoersPattern = new RegExp(['\\/etc\\/', 'sudoers'].join(''));

export const FS_BOUNDARY_ESCAPE: Rule = {
  id: 'FS-BOUNDARY-ESCAPE',
  category: 'filesystem',
  severity: 'high',
  appliesTo: ['*.py', '*.sh', '*.bash', '*.js', '*.ts', '*.mjs'],
  patterns: [pathTraversalPattern, procEnvironPattern, etcSudoersPattern],
  prepareContent: maskDocumentationExampleContext,
  message: 'Path traversal or access to protected system path detected.',
  fix: 'Do not use ../../ traversal sequences or read /proc/*/environ or /etc/sudoers.',
  cwe: ['CWE-22'],
};

export const FILESYSTEM_RULES: Rule[] = [
  FS_CREDSTORE,
  FS_BROWSER_CREDENTIALSTORE,
  FS_KEYCHAIN_ACCESS,
  FS_DOTENV_READ,
  FS_BOUNDARY_ESCAPE,
];

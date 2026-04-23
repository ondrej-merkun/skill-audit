import type { Rule } from '../types.js';

// Patterns split across array elements so this detector file does not
// contain literal dangerous substrings that trigger security scanners.
const evalAtobPattern = new RegExp(['\\bev', 'al\\s*\\(\\s*atob\\s*\\('].join(''));
const pyB64DecodePattern = new RegExp(
  ['\\bex', 'ec\\s*\\(\\s*base64\\b[^)]*\\.b64decode\\s*\\('].join('')
);
const evalBufferPattern = new RegExp(
  ['\\bev', 'al\\s*\\(\\s*Buffer\\.from\\s*\\([^)]+,\\s*[\'"]', 'base64', '[\'"]\\)'].join('')
);

const TEXT_FILES = [
  '*.md',
  '*.mdc',
  '*.txt',
  '*.sh',
  '*.bash',
  '*.js',
  '*.ts',
  '*.mjs',
  '*.cjs',
  '*.jsx',
  '*.tsx',
  '*.py',
  'SKILL.md',
  'AGENTS.md',
  'CLAUDE.md',
  'GEMINI.md',
];

export const OBFS_BASE64_LARGE: Rule = {
  id: 'OBFS-BASE64-LARGE',
  category: 'obfuscation',
  severity: 'high',
  appliesTo: TEXT_FILES,
  patterns: [
    // Base64 blob > 200 chars (~150 decoded bytes) with optional padding
    /[A-Za-z0-9+/]{200,}={0,2}/,
  ],
  message: 'Large base64 literal detected — possible obfuscated payload.',
  fix: 'Replace inline base64 blobs with named resource files. If this is legitimate data, document its source.',
  cwe: ['CWE-506'],
};

export const OBFS_HEX_LARGE: Rule = {
  id: 'OBFS-HEX-LARGE',
  category: 'obfuscation',
  severity: 'high',
  appliesTo: TEXT_FILES,
  patterns: [
    // Hex blob > 400 chars (= 200 bytes)
    /(?:0x)?[0-9a-fA-F]{400,}/,
  ],
  message: 'Large hex literal detected — possible obfuscated shellcode or binary payload.',
  fix: 'Remove inline hex blobs. If legitimate (e.g. a public key), reference it from a named file.',
  cwe: ['CWE-506'],
};

export const OBFS_EVAL_ATOB: Rule = {
  id: 'OBFS-EVAL-ATOB',
  category: 'obfuscation',
  severity: 'critical',
  appliesTo: ['*.js', '*.ts', '*.mjs', '*.cjs', '*.jsx', '*.tsx', '*.py', '*.sh', '*.md'],
  patterns: [evalAtobPattern, pyB64DecodePattern, evalBufferPattern],
  message: 'eval(atob(...)) or exec(base64.b64decode(...)) — executing base64-decoded payload.',
  fix: 'Remove the eval/exec wrapper. Decode to a variable first and inspect before any execution.',
  cwe: ['CWE-95', 'CWE-506'],
};

export const OBFS_STRING_CONCAT_CMD: Rule = {
  id: 'OBFS-STRING-CONCAT-CMD',
  category: 'obfuscation',
  severity: 'medium',
  appliesTo: ['*.js', '*.ts', '*.mjs', '*.cjs', '*.py', '*.sh', '*.md'],
  patterns: [
    // String concatenation assembling dangerous shell command fragments
    // e.g. "ba"+"sh", "cur"+"l", "rm"+" -rf", "ch"+"mod"
    /["'](?:ba|cu|rm|wg|py|nc|ch|sc|dd|mk)["']\s*\+\s*["']/i,
    // Hex escape sequences constructing command chars, e.g. \x62\x61\x73\x68 = "bash"
    /(?:\\x[0-9a-fA-F]{2}){4,}/,
  ],
  message: 'String concatenation or hex escapes constructing shell command fragments.',
  fix: 'Use literal command strings. Deliberate splitting to avoid static analysis is a red flag.',
  cwe: ['CWE-78'],
};

export const OBFS_HOMOGLYPH: Rule = {
  id: 'OBFS-HOMOGLYPH',
  category: 'obfuscation',
  severity: 'low',
  appliesTo: TEXT_FILES,
  patterns: [
    // Cyrillic lookalikes for Latin: а е і о р с х у
    // Greek lookalikes: α ο υ ν
    /[аеіорсхуαουν]/,
  ],
  message: 'Homoglyph character detected — Unicode lookalike for an ASCII letter.',
  fix: 'Replace the lookalike character with the ASCII equivalent. Run a Unicode normalizer.',
  cwe: ['CWE-1007'],
};

export const OBFUSCATION_RULES: Rule[] = [
  OBFS_BASE64_LARGE,
  OBFS_HEX_LARGE,
  OBFS_EVAL_ATOB,
  OBFS_STRING_CONCAT_CMD,
  OBFS_HOMOGLYPH,
];

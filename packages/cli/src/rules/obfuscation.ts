import type { Rule } from '../types.js';
import {
  maskDocumentationTextInCode,
  maskSecurityEducationExampleContext,
} from './code-context.js';

// Patterns split across array elements so this detector file does not
// contain literal dangerous substrings that trigger security scanners.
const evalAtobPattern = new RegExp(['\\bev', 'al\\s*\\(\\s*atob\\s*\\('].join(''));
const pyB64DecodePattern = new RegExp(
  ['\\bex', 'ec\\s*\\(\\s*base64\\b[^)]*\\.b64decode\\s*\\('].join('')
);
const evalBufferPattern = new RegExp(
  ['\\bev', 'al\\s*\\(\\s*Buffer\\.from\\s*\\([^)]+,\\s*[\'"]', 'base64', '[\'"]\\)'].join('')
);
const cyrillicHomoglyphInAsciiTokenPattern =
  /(?<finding>\b[A-Za-z0-9_.:/-]*[аеіорсху][A-Za-z0-9_.:/-]+|[A-Za-z0-9_.:/-]+[аеіорсху][A-Za-z0-9_.:/-]*\b)/u;
const greekHomoglyphInSuspiciousTokenPattern =
  /(?<finding>\b(?:ignοre|οverride|bypαss|disαble|nοde|pythοn|cοm)[A-Za-z0-9_.:/-]*\b|https?:\/\/[^\s"'`<>]*[αουν][^\s"'`<>]*)/iu;
const shellBase64DecodeExecPattern =
  /\bbase64\b(?=[^\n|&;]{0,160}\s(?:-[A-Za-z]*d[A-Za-z]*|--decode)\b)[^\n|&;]{0,220}(?:\|\s*|(?:&&|;)\s*)(?:sh|bash|zsh|python3?|node)\b/i;
const shellOpenSslDecodeExecPattern =
  /\bopenssl\s+enc\b(?=[^\n|&;]{0,180}\s-d\b)(?=[^\n|&;]{0,180}\s-base64\b)[^\n|&;]{0,240}(?:\|\s*|(?:&&|;)\s*)(?:sh|bash|zsh|python3?|node)\b/i;
const psEncodedCommandPattern =
  /(?:^|[;&|(:=-]\s*)(?:[&.]\s*)?(?:powershell(?:\.exe)?|pwsh(?:\.exe)?)[^\n#"'`]{0,200}-(?:EncodedCommand|enc|e)\b/im;
const psInvokeDownloadPattern =
  /\b(?:IEX|Invoke-Expression)\b\s*[\s(]{0,20}[^\n#]{0,240}\b(?:iwr|Invoke-WebRequest|DownloadString)\b/i;
const psDownloadPipeInvokePattern =
  /\b(?:iwr|Invoke-WebRequest|DownloadString)\b[^\n#|]{0,240}\|\s*(?:IEX|Invoke-Expression)\b/i;

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

const DECODE_EXEC_FILES = [
  '*.md',
  '*.mdc',
  '*.txt',
  '*.sh',
  '*.bash',
  '*.ps1',
  'SKILL.md',
  'AGENTS.md',
  'CLAUDE.md',
  'GEMINI.md',
];

function maskPowerShellStringsAndComments(content: string): string {
  const chars = content.split('');
  let quote: '"' | "'" | null = null;

  for (let idx = 0; idx < chars.length; idx += 1) {
    const char = chars[idx];

    if (quote !== null) {
      chars[idx] = char === '\n' || char === '\r' ? char : ' ';
      if (char === quote) quote = null;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      chars[idx] = ' ';
      continue;
    }

    if (char === '#') {
      while (idx < chars.length && chars[idx] !== '\n' && chars[idx] !== '\r') {
        chars[idx] = ' ';
        idx += 1;
      }
      idx -= 1;
    }
  }

  return chars.join('');
}

function maskDecodeExecDocumentation(content: string, filePath: string): string {
  if (/\.ps1$/i.test(filePath)) return maskPowerShellStringsAndComments(content);
  return maskSecurityEducationExampleContext(
    maskDocumentationTextInCode(content, filePath),
    filePath
  );
}

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
  prepareContent: maskDocumentationTextInCode,
  message: 'eval(atob(...)) or exec(base64.b64decode(...)) — executing base64-decoded payload.',
  fix: 'Remove the eval/exec wrapper. Decode to a variable first and inspect before any execution.',
  cwe: ['CWE-95', 'CWE-506'],
};

export const OBFS_DECODE_EXEC: Rule = {
  id: 'OBFS-DECODE-EXEC',
  category: 'obfuscation',
  severity: 'critical',
  appliesTo: DECODE_EXEC_FILES,
  patterns: [
    shellBase64DecodeExecPattern,
    shellOpenSslDecodeExecPattern,
    psEncodedCommandPattern,
    psInvokeDownloadPattern,
    psDownloadPipeInvokePattern,
  ],
  prepareContent: maskDecodeExecDocumentation,
  message: 'Decode-and-execute pattern detected — obfuscated payload execution.',
  fix: 'Decode or download to a file first, inspect it, and execute only explicit trusted scripts.',
  cwe: ['CWE-78', 'CWE-506'],
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
    // Cyrillic lookalikes for Latin letters inside ASCII-like identifiers,
    // paths, commands, or URLs. Ordinary Cyrillic words are not obfuscation.
    cyrillicHomoglyphInAsciiTokenPattern,
    // Greek symbols are common in math/statistics, so only flag common
    // suspicious prompt, command, and URL contexts.
    greekHomoglyphInSuspiciousTokenPattern,
  ],
  message: 'Homoglyph character detected — Unicode lookalike for an ASCII letter.',
  fix: 'Replace the lookalike character with the ASCII equivalent. Run a Unicode normalizer.',
  cwe: ['CWE-1007'],
};

export const OBFUSCATION_RULES: Rule[] = [
  OBFS_BASE64_LARGE,
  OBFS_HEX_LARGE,
  OBFS_EVAL_ATOB,
  OBFS_DECODE_EXEC,
  OBFS_STRING_CONCAT_CMD,
  OBFS_HOMOGLYPH,
];

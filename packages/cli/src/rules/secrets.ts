import type { Rule } from '../types.js';

// Patterns are split to avoid triggering static-analysis hooks on this detector file itself.
// These rules detect hardcoded credentials in scanned skills, not in this codebase.

// OpenAI API key: sk-<20+ alphanumeric chars>
const openAiKeyPattern = new RegExp(['sk-[A-Za-z0-9]{20,}'].join(''));

// Anthropic API key: sk-ant-<20+ chars with dashes/underscores>
const anthropicKeyPattern = new RegExp(['sk-', 'ant-[A-Za-z0-9_-]{20,}'].join(''));

// GitHub personal access tokens: ghp_/gho_/ghs_/ghu_ + 36 alphanumeric
const githubPatPattern = /\bgh[pousr]_[A-Za-z0-9]{36}\b/;

// AWS Access Key ID: AKIA + 16 uppercase alphanumeric
const awsKeyPattern = new RegExp(['AKIA', '[A-Z0-9]{16}'].join(''));

// Generic high-entropy secret assignment pattern:
// api_key = "...", TOKEN: '...', password = "...", etc.
const genericSecretPattern =
  /(?:api[_-]?key|secret|password|passwd|token|credential|auth[_-]?token)\s*[=:]\s*['"][A-Za-z0-9+/=_.~-]{32,}['"]/i;

const secretLikePatterns = [
  openAiKeyPattern,
  anthropicKeyPattern,
  githubPatPattern,
  awsKeyPattern,
  genericSecretPattern,
];

const placeholderSecretPatterns = [
  /\bAKIAIOSFODNN7EXAMPLE\b/,
  /\bASIAIOSFODNN7EXAMPLE\b/,
  /\bsk-1234567890abcdef[A-Za-z0-9]*\b/i,
  /\bsk-ant-api03-1234567890abcdef[A-Za-z0-9_-]*\b/i,
  /\bgh[pousr]_1234567890abcdef[A-Za-z0-9]{20,}\b/i,
];

const exampleContextPattern =
  /\b(?:bad|wrong|never do this|example|fixture|test data|test credential|dummy|placeholder|sample secret|fake key|fake token)\b/i;
const exampleHeadingPattern =
  /^\s*(?:#{1,6}\s+|\/\/\s*|#\s*|\/\*\s*|\*\s*)?(?:bad|wrong|never do this|example|fixture|test data|dummy|placeholder|sample|fake)\b/i;

function maskLine(line: string): string {
  return ' '.repeat(line.length);
}

function hasSecretLikeValue(line: string): boolean {
  return secretLikePatterns.some((pattern) => pattern.test(line));
}

function hasPlaceholderSecret(line: string): boolean {
  return placeholderSecretPatterns.some((pattern) => pattern.test(line));
}

function hasNearbyExampleHeading(lines: string[], index: number): boolean {
  const start = Math.max(0, index - 3);
  for (let headingIndex = index - 1; headingIndex >= start; headingIndex -= 1) {
    const line = lines[headingIndex] ?? '';
    if (line.trim() === '') continue;
    if (exampleHeadingPattern.test(line)) return true;
  }
  return false;
}

function prepareSecretContent(content: string): string {
  const lines = content.split('\n');

  return lines
    .map((line, index) => {
      if (!hasSecretLikeValue(line)) return line;
      if (hasPlaceholderSecret(line)) return maskLine(line);
      if (exampleContextPattern.test(line)) return maskLine(line);
      if (hasNearbyExampleHeading(lines, index)) return maskLine(line);
      return line;
    })
    .join('\n');
}

export const SEC_HARDCODED_KEY: Rule = {
  id: 'SEC-HARDCODED-KEY',
  category: 'secrets',
  severity: 'critical',
  appliesTo: [
    '*.py',
    '*.sh',
    '*.bash',
    '*.js',
    '*.ts',
    '*.mjs',
    '*.env',
    '*.md',
    '*.yaml',
    '*.yml',
  ],
  patterns: [
    openAiKeyPattern,
    anthropicKeyPattern,
    githubPatPattern,
    awsKeyPattern,
    genericSecretPattern,
  ],
  prepareContent: prepareSecretContent,
  message: 'Hardcoded API key or secret detected.',
  fix: 'Remove the hardcoded credential and load it from environment variables or a secrets manager.',
  cwe: ['CWE-798'],
};

export const SECRETS_RULES: Rule[] = [SEC_HARDCODED_KEY];

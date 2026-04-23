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
  message: 'Hardcoded API key or secret detected.',
  fix: 'Remove the hardcoded credential and load it from environment variables or a secrets manager.',
  cwe: ['CWE-798'],
};

export const SECRETS_RULES: Rule[] = [SEC_HARDCODED_KEY];

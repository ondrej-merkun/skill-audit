/**
 * Content views for agent hook, settings, and MCP config JSON.
 *
 * Both views keep every character offset of the original file, so a finding
 * reports the real line of the JSON value that matched. Invalid JSON yields an
 * empty view: the agent cannot load that file either.
 */

import { basename, dirname } from 'node:path';

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

// A blanked comment keeps its whitespace, so line breaks inside it stay.
const NON_WHITESPACE = /\S/g;

// Gemini CLI reads settings.json with JSON.parse(stripJsonComments(content)). Its other JSON
// files and the config files of the other agents are plain JSON.
const GEMINI_CONFIG_DIR = '.gemini';
const GEMINI_SETTINGS_FILENAME = 'settings.json';

/**
 * Keeps only the command values of an agent config file, decoded from JSON
 * escapes and placed at their original offsets. Everything else becomes spaces.
 * The path selects the dialect: a Gemini settings file can hold comments.
 */
export function extractAgentConfigCommands(content: string, path: string): string {
  const json = agentConfigJson(content, path);
  const parsed = parseJson(json);
  if (parsed === undefined) return '';

  const commands = new Set(collectCommandValues(parsed));
  return rewriteJsonTokens(json, {
    stringLiteral: (value) => (commands.has(value) ? value : ''),
    structure: (text) => ' '.repeat(text.length),
  });
}

/** Lists the command values of an agent config file. Invalid JSON has none. */
export function agentConfigCommandValues(content: string): string[] {
  const parsed = parseJson(content);
  return parsed === undefined ? [] : collectCommandValues(parsed);
}

/**
 * Decodes the escapes in every JSON string literal in place, so patterns see
 * `"ANTHROPIC_BASE_URL": "https://..."` even when the file writes `https:\/\/`.
 * Decoded quotes become `'`, so quoted text inside a value cannot look like a key.
 */
export function decodeJsonStrings(content: string): string {
  if (parseJson(content) === undefined) return '';

  return rewriteJsonTokens(content, {
    stringLiteral: (value) => `"${value.replaceAll('"', "'")}"`,
    structure: (text) => text,
  });
}

/** Returns the JSON text that the agent parses: Gemini settings lose their comments first. */
export function agentConfigJson(content: string, path: string): string {
  return isGeminiSettings(path) ? blankJsonComments(content) : content;
}

/**
 * Replaces the `//` and `/* *\/` comments outside JSON strings with spaces, as Gemini CLI does
 * before it parses settings.json. Line breaks stay, so offsets and line numbers do not move.
 * Trailing commas stay too: Gemini CLI rejects them.
 *
 * A character loop, like Gemini CLI's strip-json-comments: a regular expression that steps
 * through a string literal one character at a time overflows V8's backtrack stack on a
 * multi-megabyte value, and Gemini CLI loads such a file.
 */
export function blankJsonComments(content: string): string {
  let blanked = '';
  let copiedUpTo = 0;
  let index = 0;

  while (index < content.length) {
    if (content[index] === '"') {
      index = jsonStringEnd(content, index);
      continue;
    }

    const commentEnd = jsonCommentEnd(content, index);
    if (commentEnd === undefined) {
      index += 1;
      continue;
    }

    const comment = content.slice(index, commentEnd);
    blanked += content.slice(copiedUpTo, index) + comment.replace(NON_WHITESPACE, ' ');
    copiedUpTo = commentEnd;
    index = commentEnd;
  }

  return blanked + content.slice(copiedUpTo);
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

// Returns the offset after the string literal that starts at `start`. An unclosed string runs to
// the end of the file, as in strip-json-comments.
export function jsonStringEnd(content: string, start: number): number {
  for (let index = start + 1; index < content.length; index += 1) {
    if (content[index] === '\\') index += 1;
    else if (content[index] === '"') return index + 1;
  }
  return content.length;
}

// Returns the offset after the comment that starts at `start`, or undefined when no comment
// starts there. A line comment keeps its line break. An unclosed block comment runs to the end.
function jsonCommentEnd(content: string, start: number): number | undefined {
  if (content.startsWith('//', start)) {
    const lineBreak = content.indexOf('\n', start);
    return lineBreak === -1 ? content.length : lineBreak;
  }
  if (content.startsWith('/*', start)) {
    const close = content.indexOf('*/', start + 2);
    return close === -1 ? content.length : close + 2;
  }
  return undefined;
}

function isGeminiSettings(path: string): boolean {
  return (
    basename(path) === GEMINI_SETTINGS_FILENAME && basename(dirname(path)) === GEMINI_CONFIG_DIR
  );
}

function parseJson(content: string): unknown {
  try {
    return JSON.parse(content) as unknown;
  } catch {
    return undefined;
  }
}

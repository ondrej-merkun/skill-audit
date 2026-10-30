import { readFileSync } from 'node:fs';
import { basename, join, relative, sep } from 'node:path';
import {
  AGENT_CONFIG_FILENAMES,
  agentConfigCommandValues,
  agentConfigJson,
} from './agent-config.js';

const SKILL_MD = 'SKILL.md';
const MARKDOWN_FENCE_PATTERN = /^\s*(?:```|~~~)/;
// Words that tell the agent to run a path that comes after them in the same sentence.
const RUN_VERB_PATTERN =
  /\b(?:run|runs|running|execute|executes|executing|exec|invoke|invokes|invoking|launch|launches|launching)\b/i;
const SENTENCE_END_PATTERN = /[.!?](?=\s|$)/;
// A program that runs the path right after it, with its options: `bash -e docs/setup.sh`,
// `source docs/env.sh`, `. docs/env.sh`, `python3 references/install.py`.
const INTERPRETER_BEFORE_PATH_PATTERN =
  /(?:^|[\s;&|(`])(?:\.|source|exec|sudo|bash|sh|zsh|dash|ksh|fish|python[\d.]*|node|deno|bun|bunx|npx|tsx|ts-node|uv|uvx|ruby|perl|php|pwsh|powershell|osascript)(?:\s+-[\w=.-]+)*\s+["'`]?$/i;
// The start of a command in fenced code, so the path is the program: `./docs/setup.sh`.
const LINE_START_COMMAND_PATTERN = /^\s*(?:[$>]\s+)?$/;
const AFTER_COMMAND_SEPARATOR_PATTERN = /(?:&&|\|\||[;|&(])\s*$/;
// The part of a word before the path: `./`, `$SKILL_DIR/`, or `${CLAUDE_PLUGIN_ROOT}/`.
const PATH_PREFIX_PATTERN = /[^\s;&|(`"']*$/;
// A path starts after a space, a quote, a bracket, `=`, or the `/` of a dir that names it.
const PATH_START_BOUNDARY = /[\s"'`(=/<[]/;
// A path ends at a space, a quote, a bracket, a separator, or a full stop that ends a sentence.
const PATH_END_BOUNDARY = /^(?:$|[\s"'`);&|,:>\]]|\.(?:\s|$))/;
// The text before a path that the run checks read. The bound keeps a long line with many
// mentions of one path linear.
const MAX_RUN_CONTEXT_CHARS = 200;

/**
 * Returns a check for the files under `root` that the agent runs: a file that SKILL.md tells the
 * agent to run, and a file that a command in an agent config file of the walk names, such as the
 * hook command `bash "${CLAUDE_PLUGIN_ROOT}"/docs/check.sh`. A file that SKILL.md only points at
 * as reading material (`See examples/loader.js`) is not a run target.
 */
export function runTargetCheck(root: string, files: string[]): (filePath: string) => boolean {
  const commands = files
    .filter((file) => AGENT_CONFIG_FILENAMES.has(basename(file)))
    .flatMap(agentConfigFileCommands);
  const skillMdPath = join(root, SKILL_MD);
  const skillMd = skillMdTextOf(files.includes(skillMdPath) ? readTextOrEmpty(skillMdPath) : '');

  return (filePath) => {
    const relPath = relative(root, filePath).split(sep).join('/');
    return namesOf(relPath).some(
      (name) =>
        commands.some((command) => pathOccurrences(command, name).length > 0) ||
        skillMdRunsPath(skillMd, name)
    );
  };
}

/**
 * True when SKILL.md tells the agent to run `path`: a run verb comes before it in the same
 * sentence (`Run docs/setup.sh first`), a program runs it (`bash references/install.sh`), or it
 * starts a command in fenced code (`./examples/setup.sh --init`).
 * ponytail: a negation does not count, so `Never run examples/attack.sh` makes the sample
 * operative. The check fails closed: it may show a sample, but it does not hide a payload.
 */
function skillMdRunsPath(skillMd: SkillMdText, path: string): boolean {
  return pathOccurrences(skillMd.text, path).some((index) => {
    const line = lineIndexOf(skillMd.lineStarts, index);
    const lineStart = skillMd.lineStarts[line] ?? 0;
    const before = skillMd.text.slice(Math.max(lineStart, index - MAX_RUN_CONTEXT_CHARS), index);
    const sentenceBefore = before.split(SENTENCE_END_PATTERN).at(-1) ?? '';
    const commandBefore = before.replace(PATH_PREFIX_PATTERN, '');
    const startsLine =
      index - lineStart <= MAX_RUN_CONTEXT_CHARS && LINE_START_COMMAND_PATTERN.test(commandBefore);
    const startsCommand = startsLine || AFTER_COMMAND_SEPARATOR_PATTERN.test(commandBefore);

    return (
      RUN_VERB_PATTERN.test(sentenceBefore) ||
      INTERPRETER_BEFORE_PATH_PATTERN.test(commandBefore) ||
      (skillMd.isFencedLine[line] === true && startsCommand)
    );
  });
}

/**
 * The names that a text can use for a file: its path from the root, and each shorter path that
 * still has a dir. A hook names a plugin script from the plugin root
 * (`${CLAUDE_PLUGIN_ROOT}/docs/check.sh`), which can be below the scanned root.
 */
function namesOf(relPath: string): string[] {
  const segments = relPath.split('/');
  const shorterPaths = segments.slice(1, -1).map((_, index) => segments.slice(index + 1).join('/'));
  return [relPath, ...shorterPaths];
}

/** The start index of each place where `text` names `path` as a whole path. */
function pathOccurrences(text: string, path: string): number[] {
  const indices: number[] = [];
  for (let index = text.indexOf(path); index >= 0; index = text.indexOf(path, index + 1)) {
    const charBefore = text[index - 1] ?? ' ';
    const textAfter = text.slice(index + path.length, index + path.length + 2);
    if (PATH_START_BOUNDARY.test(charBefore) && PATH_END_BOUNDARY.test(textAfter)) {
      indices.push(index);
    }
  }
  return indices;
}

function skillMdTextOf(text: string): SkillMdText {
  const lineStarts = [0];
  for (let index = text.indexOf('\n'); index >= 0; index = text.indexOf('\n', index + 1)) {
    lineStarts.push(index + 1);
  }

  let inFence = false;
  const isFencedLine = text.split('\n').map((line) => {
    const isFence = MARKDOWN_FENCE_PATTERN.test(line);
    if (isFence) inFence = !inFence;
    return inFence && !isFence;
  });

  return { text, lineStarts, isFencedLine };
}

/** The 0-based line that holds a character offset, by binary search over the line starts. */
function lineIndexOf(lineStarts: number[], index: number): number {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if ((lineStarts[mid] ?? 0) <= index) low = mid;
    else high = mid - 1;
  }
  return low;
}

function agentConfigFileCommands(configPath: string): string[] {
  return agentConfigCommandValues(agentConfigJson(readTextOrEmpty(configPath), configPath));
}

/** An unreadable file has no text. The rule engine skips it the same way. */
function readTextOrEmpty(path: string): string {
  try {
    return readFileSync(path, 'utf-8');
  } catch {
    return '';
  }
}

// SKILL.md text, the offset where each line starts, and whether each line is in fenced code.
type SkillMdText = { text: string; lineStarts: number[]; isFencedLine: boolean[] };

import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import { basename, extname, join } from 'node:path';
import JSON5 from 'json5';
import { enterDirOnce, isRegularFile, readDirFollowingLinks } from '../fs-walk.js';
import type { Skill } from '../types.js';
import { mcpServerScanMetadata } from './agent-config.js';
import { discoverSkillDirs } from './shared-agent-skills.js';
import { computeTreeSha256 } from './tree-hash.js';

// Shared discovery helpers for the OpenCode, Amp, and OpenClaw plugins.

// Plugin and tool code that the agents load. Each file keeps its own name, so the
// JavaScript and TypeScript rules apply to it.
const CODE_FILE_EXTENSIONS = new Set(['.js', '.ts', '.mjs', '.cjs']);
const MARKDOWN_EXTENSION = '.md';
const SKILL_ID_HEX_LENGTH = 16;

/** One target per regular file, named by its file name. Missing and special files are skipped. */
export async function fileSkills(
  agentId: string,
  paths: string[],
  format: Skill['format'],
  scope: Skill['scope']
): Promise<Skill[]> {
  const skills: Skill[] = [];

  for (const path of paths) {
    if (!(await isRegularFile(path))) continue;
    skills.push(await pathSkill(agentId, path, basename(path), format, scope));
  }

  return skills;
}

/**
 * One target per markdown file in `dir`, named without `.md`. With `recursive`, the files
 * of every subdirectory count too.
 */
export async function markdownSkills(
  agentId: string,
  dir: string,
  format: Skill['format'],
  scope: Skill['scope'],
  recursive = true
): Promise<Skill[]> {
  const skills: Skill[] = [];

  for (const path of await markdownFilesUnder(dir, recursive)) {
    const name = basename(path, MARKDOWN_EXTENSION);
    skills.push(await pathSkill(agentId, path, name, format, scope));
  }

  return skills;
}

/**
 * Plugin code in a plugin directory. Each code file at the top is one target, and each
 * subdirectory is one target that the rule engine walks as a package. OpenClaw loads only
 * the directories in its hooks and extensions directories, so it passes `includeFiles: false`.
 * ponytail: a package directory is scanned whole, `node_modules` included.
 */
export async function pluginCodeSkills(
  agentId: string,
  dir: string,
  scope: Skill['scope'],
  includeFiles = true
): Promise<Skill[]> {
  const skills: Skill[] = [];

  for (const entry of await readDirFollowingLinks(dir)) {
    const path = join(dir, entry.name);
    const isCodeFile = entry.kind === 'file' && CODE_FILE_EXTENSIONS.has(extname(entry.name));
    if (entry.kind === 'dir' || (includeFiles && isCodeFile)) {
      skills.push(await pathSkill(agentId, path, entry.name, 'agent-config', scope));
    }
  }

  return skills.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * The Claude Code and cross-agent skill directories that OpenCode and Amp read in the project:
 * `.claude/skills` from the working directory up to the git root, and `.agents/skills` in the
 * parents. The shared walker covers `.agents/skills` in the working directory itself.
 */
export async function compatibleProjectSkills(
  agentId: string,
  projectDirs: string[]
): Promise<Skill[]> {
  const skills: Skill[] = [];

  for (const [index, dir] of projectDirs.entries()) {
    skills.push(...(await discoverSkillDirs(agentId, join(dir, '.claude', 'skills'), 'project')));
    if (index > 0) {
      skills.push(...(await discoverSkillDirs(agentId, join(dir, '.agents', 'skills'), 'project')));
    }
  }

  return skills;
}

/**
 * One target per MCP server. Each target scans only its own definition as a one-server
 * `.mcp.json` document, like the MCP servers of the other agents.
 * ponytail: the definition is re-serialized, so findings count lines in that document,
 * not in the config file.
 */
export function mcpServerSkills(
  agentId: string,
  configPath: string,
  servers: Record<string, unknown>,
  scope: Skill['scope'],
  // The key of the server map, when one config file holds more than one map.
  mapKey?: string
): Skill[] {
  const idPrefix = mapKey === undefined ? configPath : `${configPath}:${mapKey}`;

  return Object.entries(servers)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, definition]) => ({
      id: makeId(agentId, `${idPrefix}:${name}`),
      agentId,
      name,
      path: configPath,
      manifestPath: configPath,
      format: 'mcp-server' as const,
      scope,
      treeSha256: '',
      metadata: mcpServerScanMetadata(name, definition),
    }));
}

/**
 * Parses a config file as JSON5, or returns undefined for a missing, unreadable, or invalid
 * file. OpenClaw reads its config with the json5 package. OpenCode and Amp read JSONC, which
 * JSON5 also accepts: comments and trailing commas.
 * ponytail: JSON5 also accepts unquoted keys and single quotes, so a JSONC file that OpenCode
 * or Amp rejects can still list servers. Such a file shows extra targets, never fewer.
 */
export async function readJson5Config(path: string): Promise<unknown> {
  // A FIFO at a config path would block the read forever, so only a regular file is read.
  if (!(await isRegularFile(path))) return undefined;

  try {
    return JSON5.parse(await readFile(path, 'utf8'));
  } catch {
    return undefined;
  }
}

export function homeDir(): string {
  return process.env.HOME ?? process.env.USERPROFILE ?? os.homedir();
}

// SKILL_AUDIT_CWD lets tests inject a project directory without process.chdir().
export function projectDir(): string {
  return process.env.SKILL_AUDIT_CWD ?? process.cwd();
}

export function xdgConfigDir(): string {
  return process.env.XDG_CONFIG_HOME ?? join(homeDir(), '.config');
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function pathSkill(
  agentId: string,
  path: string,
  name: string,
  format: Skill['format'],
  scope: Skill['scope']
): Promise<Skill> {
  return {
    id: makeId(agentId, path),
    agentId,
    name,
    path,
    manifestPath: path,
    format,
    scope,
    treeSha256: await computeTreeSha256(path),
  };
}

async function markdownFilesUnder(root: string, recursive: boolean): Promise<string[]> {
  const files: string[] = [];
  const visitedRealDirs = new Set<string>();

  async function visit(dir: string): Promise<void> {
    if (!(await enterDirOnce(visitedRealDirs, dir))) return;

    for (const entry of await readDirFollowingLinks(dir)) {
      const path = join(dir, entry.name);
      if (entry.kind === 'dir' && recursive) await visit(path);
      else if (entry.kind === 'file' && entry.name.endsWith(MARKDOWN_EXTENSION)) files.push(path);
    }
  }

  await visit(root);
  return files.sort((a, b) => a.localeCompare(b));
}

// Same id scheme as the other plugins: a stable hash of the agent id and the path.
function makeId(agentId: string, input: string): string {
  return createHash('sha256')
    .update(`${agentId}:${input}`)
    .digest('hex')
    .slice(0, SKILL_ID_HEX_LENGTH);
}

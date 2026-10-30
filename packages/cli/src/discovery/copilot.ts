import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import { join, relative, sep } from 'node:path';
import { enterDirOnce, isRegularFile, readDirFollowingLinks } from '../fs-walk.js';
import { jsonStringEnd } from '../rules/agent-config.js';
import type { AgentDiscovery, DiscoverSkillsOptions, Skill } from '../types.js';
import { discoverAgentConfigFiles, mcpServerScanMetadata } from './agent-config.js';
import { discoverSharedAgentSkills } from './shared-agent-skills.js';
import { computeTreeSha256 } from './tree-hash.js';

const AGENT_ID = 'copilot';

const INSTRUCTIONS_SUFFIXES = ['.instructions.md'];
const PROMPT_SUFFIXES = ['.prompt.md'];
// A custom agent is any .md file in an agents folder. Its name drops `.agent.md` or `.md`.
const AGENT_SUFFIXES = ['.agent.md', '.md'];

// The line breaks and whitespace of VS Code's JSON scanner (src/vs/base/common/json.ts).
// JSON.parse rejects every whitespace character here except space, tab, CR, and LF.
const VS_CODE_LINE_BREAKS = new Set(['\n', '\r', ' ', ' ']);
const EN_QUAD_TO_ZERO_WIDTH_SPACE = Array.from({ length: 12 }, (_, offset) =>
  String.fromCharCode(0x2000 + offset)
);
const VS_CODE_WHITESPACE = new Set([
  ...VS_CODE_LINE_BREAKS,
  ...[' ', '\t', '\v', '\f', ' ', ' ', ' ', ' ', '　', '﻿'],
  ...EN_QUAD_TO_ZERO_WIDTH_SPACE,
]);

function getHomeDir(): string {
  return process.env.HOME ?? process.env.USERPROFILE ?? os.homedir();
}

function getCwd(): string {
  return process.env.SKILL_AUDIT_CWD ?? process.cwd();
}

function makeId(input: string): string {
  return createHash('sha256').update(`${AGENT_ID}:${input}`).digest('hex').slice(0, 16);
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function discoverSkillsDir(dir: string, scope: Skill['scope']): Promise<Skill[]> {
  const skillDirs = (await readDirFollowingLinks(dir)).filter((e) => e.kind === 'dir');
  const results: Skill[] = [];

  for (const entry of skillDirs) {
    const skillDir = join(dir, entry.name);
    const manifestPath = join(skillDir, 'SKILL.md');
    if (!(await isRegularFile(manifestPath))) continue;
    results.push({
      id: makeId(skillDir),
      agentId: AGENT_ID,
      name: entry.name,
      path: skillDir,
      manifestPath,
      format: 'SKILL.md',
      scope,
      treeSha256: await computeTreeSha256(skillDir),
    });
  }

  return results;
}

async function discoverSingleFile(
  filePath: string,
  name: string,
  scope: Skill['scope']
): Promise<Skill[]> {
  if (!(await isRegularFile(filePath))) return [];
  return [
    {
      id: makeId(filePath),
      agentId: AGENT_ID,
      name,
      path: filePath,
      manifestPath: filePath,
      format: 'agents-md',
      scope,
      treeSha256: await computeTreeSha256(filePath),
    },
  ];
}

// Instruction files, prompt files, and custom agents.
async function discoverCustomizationFiles(home: string, cwd: string): Promise<Skill[]> {
  const groups = await Promise.all([
    discoverMarkdownFiles(
      join(home, '.copilot', 'instructions'),
      INSTRUCTIONS_SUFFIXES,
      'agents-md',
      'user'
    ),
    discoverMarkdownFiles(
      join(cwd, '.github', 'instructions'),
      INSTRUCTIONS_SUFFIXES,
      'agents-md',
      'project'
    ),
    // VS Code keeps user prompt files in its profile storage, which has no fixed path.
    discoverMarkdownFiles(join(cwd, '.github', 'prompts'), PROMPT_SUFFIXES, 'prompt-md', 'project'),
    discoverMarkdownFiles(join(home, '.copilot', 'agents'), AGENT_SUFFIXES, 'agents-md', 'user'),
    discoverMarkdownFiles(join(cwd, '.github', 'agents'), AGENT_SUFFIXES, 'agents-md', 'project'),
  ]);
  return groups.flat();
}

/**
 * MCP servers from the Copilot CLI and VS Code config files.
 *
 * ponytail: Copilot CLI also reads .mcp.json. Claude Code discovery reports its servers, and MCP
 * entries do not dedupe across agents, so a Copilot copy would list each server twice. Without
 * Claude Code installed, or with `--agent copilot`, those servers go unscanned. Dedupe MCP
 * entries across agents to add .mcp.json here.
 */
async function discoverCopilotMcpServers(home: string, cwd: string): Promise<Skill[]> {
  const groups = await Promise.all([
    discoverMcpServers(
      join(home, '.copilot', 'mcp-config.json'),
      'user',
      (config) => config.mcpServers
    ),
    discoverMcpServers(join(cwd, '.github', 'mcp.json'), 'project', repositoryMcpServers),
    discoverMcpServers(
      join(cwd, '.vscode', 'mcp.json'),
      'project',
      (config) => config.servers,
      vsCodeJson
    ),
  ]);
  return groups.flat();
}

/**
 * Emits each file at any depth below `dir` whose name ends with one of the suffixes. Copilot
 * reads instruction, prompt, and agent folders recursively, so a file in a subfolder is named
 * by its relative path, such as `frontend/react`.
 */
async function discoverMarkdownFiles(
  dir: string,
  suffixes: string[],
  format: Skill['format'],
  scope: Skill['scope']
): Promise<Skill[]> {
  const skills: Skill[] = [];

  for (const filePath of await walkFiles(dir)) {
    const suffix = suffixes.find((candidate) => filePath.endsWith(candidate));
    if (suffix === undefined) continue;

    const name = relative(dir, filePath).slice(0, -suffix.length).split(sep).join('/');
    skills.push({
      id: makeId(filePath),
      agentId: AGENT_ID,
      name,
      path: filePath,
      manifestPath: filePath,
      format,
      scope,
      treeSha256: await computeTreeSha256(filePath),
    });
  }

  return skills;
}

/**
 * Emits one entry per MCP server in a config file. Each entry scans only its own definition,
 * as a one-server .mcp.json document, so the MCP rules apply. `serversOf` returns the object
 * that maps server names to definitions.
 */
async function discoverMcpServers(
  configPath: string,
  scope: Skill['scope'],
  serversOf: (config: Record<string, unknown>) => unknown,
  toJson: (raw: string) => string = (raw) => raw
): Promise<Skill[]> {
  if (!(await isRegularFile(configPath))) return [];

  let config: unknown;
  try {
    config = JSON.parse(toJson(await readFile(configPath, 'utf8')));
  } catch {
    return [];
  }

  const servers = isRecord(config) ? serversOf(config) : undefined;
  if (!isRecord(servers)) return [];

  // A value that is not an object, such as a top-level `$schema` string, is not a server.
  return Object.entries(servers)
    .filter(([, definition]) => isRecord(definition))
    .map(([name, definition]) => ({
      id: makeId(`${configPath}:${name}`),
      agentId: AGENT_ID,
      name,
      path: configPath,
      manifestPath: configPath,
      format: 'mcp-server' as const,
      scope,
      treeSha256: '',
      metadata: mcpServerScanMetadata(name, definition),
    }));
}

// Copilot loads every *.json file in a hooks directory, so each one is scanned as hooks.json.
async function discoverHookFiles(
  dir: string,
  displayDir: string,
  scope: Skill['scope']
): Promise<Skill[]> {
  const hookFiles = (await readDirFollowingLinks(dir)).filter(
    (e) => e.kind === 'file' && e.name.endsWith('.json')
  );

  return discoverAgentConfigFiles({
    agentId: AGENT_ID,
    dir,
    displayDir,
    fileNames: hookFiles.map((e) => e.name),
    scope,
    metadata: { ruleScanFilename: 'hooks.json' },
  });
}

// Copilot CLI reads servers at the top level of a repository file that has no `mcpServers`.
function repositoryMcpServers(config: Record<string, unknown>): unknown {
  return config.mcpServers ?? config;
}

/**
 * Rewrites .vscode/mcp.json, which VS Code reads like its settings files, into text that
 * JSON.parse reads. Comments, trailing commas, and the whitespace that VS Code's JSON scanner
 * accepts but JSON.parse rejects become spaces. A character loop, like blankJsonComments,
 * because a padded file can hold a multi-megabyte string value.
 *
 * ponytail: VS Code also loads the valid parts of a file with other syntax errors. Such a file
 * still fails JSON.parse here, and its servers are not reported.
 */
function vsCodeJson(raw: string): string {
  const parts: string[] = [];
  let copiedUpTo = 0;
  // The index in `parts` of a comma that only comments and whitespace follow so far.
  let pendingComma: number | undefined;
  let index = 0;

  while (index < raw.length) {
    const char = raw[index] ?? '';
    if (char === '"') {
      pendingComma = undefined;
      index = jsonStringEnd(raw, index);
      continue;
    }

    const triviaEnd = vsCodeTriviaEnd(raw, index);
    if (triviaEnd > index) {
      parts.push(raw.slice(copiedUpTo, index), ' ');
      copiedUpTo = triviaEnd;
      index = triviaEnd;
      continue;
    }

    if ((char === '}' || char === ']') && pendingComma !== undefined) parts[pendingComma] = ' ';
    pendingComma = undefined;
    if (char === ',') {
      parts.push(raw.slice(copiedUpTo, index), ',');
      pendingComma = parts.length - 1;
      copiedUpTo = index + 1;
    }
    index += 1;
  }

  parts.push(raw.slice(copiedUpTo));
  return parts.join('');
}

/** Returns the end of the comments and whitespace that start at `index`, or `index` if none. */
function vsCodeTriviaEnd(raw: string, index: number): number {
  let end = index;

  while (end < raw.length) {
    const char = raw[end] ?? '';
    const next = raw[end + 1];
    if (VS_CODE_WHITESPACE.has(char)) {
      end += 1;
    } else if (char === '/' && next === '/') {
      // The line break that ends the comment is whitespace, so the next step reads it.
      end += 2;
      while (end < raw.length && !VS_CODE_LINE_BREAKS.has(raw[end] ?? '')) end += 1;
    } else if (char === '/' && next === '*') {
      const close = raw.indexOf('*/', end + 2);
      end = close === -1 ? raw.length : close + 2;
    } else {
      break;
    }
  }

  return end;
}

/** Lists the files at any depth below `root`, following links and stopping at loops. */
async function walkFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  const visitedRealDirs = new Set<string>();

  async function walk(dir: string): Promise<void> {
    if (!(await enterDirOnce(visitedRealDirs, dir))) return;

    for (const entry of await readDirFollowingLinks(dir)) {
      const fullPath = join(dir, entry.name);
      if (entry.kind === 'dir') await walk(fullPath);
      else files.push(fullPath);
    }
  }

  await walk(root);
  return files.sort((a, b) => a.localeCompare(b));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const copilotDiscovery: AgentDiscovery = {
  id: AGENT_ID,
  displayName: 'GitHub Copilot',

  async isInstalled(): Promise<boolean> {
    return pathExists(join(getHomeDir(), '.copilot'));
  },

  async discoverSkills(_options: DiscoverSkillsOptions = {}): Promise<Skill[]> {
    const home = getHomeDir();
    const cwd = getCwd();
    const skills: Skill[] = [];

    // User-scoped: ~/.copilot/skills/*/SKILL.md
    skills.push(...(await discoverSkillsDir(join(home, '.copilot', 'skills'), 'user')));

    // Project-scoped: .github/skills/*/SKILL.md
    skills.push(...(await discoverSkillsDir(join(cwd, '.github', 'skills'), 'project')));

    // Instructions: ~/.copilot/copilot-instructions.md and .github/copilot-instructions.md
    skills.push(
      ...(await discoverSingleFile(
        join(home, '.copilot', 'copilot-instructions.md'),
        'copilot-instructions',
        'user'
      ))
    );
    skills.push(
      ...(await discoverSingleFile(
        join(cwd, '.github', 'copilot-instructions.md'),
        'copilot-instructions',
        'project'
      ))
    );
    skills.push(...(await discoverCustomizationFiles(home, cwd)));
    skills.push(...(await discoverCopilotMcpServers(home, cwd)));

    // Shared: ~/.agents/skills/*/SKILL.md and .agents/skills/*/SKILL.md
    skills.push(...(await discoverSharedAgentSkills(AGENT_ID)));

    // Hooks: hook directories plus the inline `hooks` block of the settings files
    skills.push(
      ...(await discoverHookFiles(join(home, '.copilot', 'hooks'), '~/.copilot/hooks', 'user'))
    );
    skills.push(
      ...(await discoverHookFiles(join(cwd, '.github', 'hooks'), '.github/hooks', 'project'))
    );
    skills.push(
      ...(await discoverAgentConfigFiles({
        agentId: AGENT_ID,
        dir: join(home, '.copilot'),
        displayDir: '~/.copilot',
        fileNames: ['settings.json'],
        scope: 'user',
      }))
    );
    skills.push(
      ...(await discoverAgentConfigFiles({
        agentId: AGENT_ID,
        dir: join(cwd, '.github', 'copilot'),
        displayDir: '.github/copilot',
        fileNames: ['settings.json', 'settings.local.json'],
        scope: 'project',
      }))
    );

    return skills;
  },
};

export default copilotDiscovery;

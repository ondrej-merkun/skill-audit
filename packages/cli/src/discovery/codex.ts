import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import os from 'node:os';
import { basename, dirname, join, relative } from 'node:path';
import type { AgentDiscovery, Skill } from '../types.js';
import { computeTreeSha256 } from './tree-hash.js';

const AGENT_ID = 'codex';

function getCodexHome(): string {
  return (
    process.env.CODEX_HOME ??
    join(process.env.HOME ?? process.env.USERPROFILE ?? os.homedir(), '.codex')
  );
}

function getCwd(): string {
  return process.env.SKILLAUDIT_CWD ?? process.cwd();
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

async function walkFiles(root: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(dir: string): Promise<void> {
    let entries: Array<{ isDirectory(): boolean; isFile(): boolean; name: string }>;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }

  await walk(root);
  files.sort((a, b) => a.localeCompare(b));
  return files;
}

function pathSegments(root: string, filePath: string): string[] {
  return relative(root, filePath)
    .split(/[\\/]+/)
    .filter(Boolean);
}

async function skillFromDir(
  dirPath: string,
  format: Skill['format'],
  scope: Skill['scope'],
  manifestFile: string
): Promise<Skill> {
  return {
    id: makeId(dirPath),
    agentId: AGENT_ID,
    name: basename(dirPath),
    path: dirPath,
    manifestPath: join(dirPath, manifestFile),
    format,
    scope,
    treeSha256: await computeTreeSha256(dirPath),
  };
}

async function skillFromFile(
  filePath: string,
  name: string,
  format: Skill['format'],
  scope: Skill['scope'],
  trusted?: boolean
): Promise<Skill> {
  return {
    id: makeId(filePath),
    agentId: AGENT_ID,
    name,
    path: filePath,
    manifestPath: filePath,
    format,
    scope,
    treeSha256: await computeTreeSha256(filePath),
    ...(trusted === undefined ? {} : { trusted }),
  };
}

async function discoverAgentFiles(codexHome: string): Promise<Skill[]> {
  const filenames = ['AGENTS.md', 'AGENTS.override.md'];
  const skills: Skill[] = [];

  for (const filename of filenames) {
    const filePath = join(codexHome, filename);
    if (!(await pathExists(filePath))) continue;
    skills.push(await skillFromFile(filePath, filename, 'agents-md', 'user'));
  }

  return skills;
}

async function discoverSkillDirs(dir: string, scope: Skill['scope']): Promise<Skill[]> {
  const files = await walkFiles(dir);
  const manifests = files.filter((file) => basename(file) === 'SKILL.md');
  return Promise.all(
    manifests.map((manifest) => skillFromDir(dirname(manifest), 'SKILL.md', scope, 'SKILL.md'))
  );
}

async function discoverPluginTree(dir: string, scope: Skill['scope']): Promise<Skill[]> {
  const files = await walkFiles(dir);
  const skills: Skill[] = [];

  for (const file of files) {
    const name = basename(file);
    const segments = pathSegments(dir, file);

    if (name === 'SKILL.md') {
      skills.push(await skillFromDir(dirname(file), 'SKILL.md', scope, 'SKILL.md'));
    } else if (name === 'plugin.json') {
      skills.push(await skillFromDir(dirname(file), 'plugin.json', scope, 'plugin.json'));
    } else if (name.endsWith('.md') && segments.includes('commands')) {
      skills.push(await skillFromFile(file, basename(file, '.md'), 'prompt-md', scope));
    }
  }

  return skills;
}

async function discoverPromptFiles(dir: string): Promise<Skill[]> {
  let entries: Array<{ isFile(): boolean; name: string }>;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  return Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map((entry) => {
        const filePath = join(dir, entry.name);
        return skillFromFile(filePath, basename(entry.name, '.md'), 'prompt-md', 'user');
      })
  );
}

function parseTomlTableName(rawName: string): string {
  const trimmed = rawName.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseMcpServerNames(toml: string): string[] {
  const names = new Set<string>();

  for (const line of toml.split(/\r?\n/)) {
    const match = line.match(/^\s*\[mcp_servers\.([^\]]+)\]\s*(?:#.*)?$/);
    if (match?.[1]) names.add(parseTomlTableName(match[1]));
  }

  return [...names].sort((a, b) => a.localeCompare(b));
}

async function discoverMcpToml(configPath: string, scope: Skill['scope']): Promise<Skill[]> {
  let raw: string;
  try {
    raw = await readFile(configPath, 'utf8');
  } catch {
    return [];
  }

  return parseMcpServerNames(raw).map((name) => ({
    id: makeId(`${configPath}:${name}`),
    agentId: AGENT_ID,
    name,
    path: configPath,
    manifestPath: configPath,
    format: 'mcp-toml' as const,
    scope,
    treeSha256: '',
  }));
}

async function discoverUntrustedProjectConfig(configPath: string): Promise<Skill[]> {
  if (!(await pathExists(configPath))) return [];
  return [await skillFromFile(configPath, '.codex/config.toml', 'mcp-toml', 'project', false)];
}

const codexDiscovery: AgentDiscovery = {
  id: AGENT_ID,
  displayName: 'OpenAI Codex',

  async isInstalled(): Promise<boolean> {
    return pathExists(getCodexHome());
  },

  async discoverSkills(): Promise<Skill[]> {
    const codexHome = getCodexHome();
    const cwd = getCwd();
    const skills: Skill[] = [];

    skills.push(...(await discoverAgentFiles(codexHome)));
    skills.push(...(await discoverMcpToml(join(codexHome, 'config.toml'), 'user')));
    skills.push(...(await discoverSkillDirs(join(codexHome, 'skills'), 'user')));
    skills.push(...(await discoverPluginTree(join(codexHome, 'plugins'), 'user')));
    skills.push(...(await discoverPromptFiles(join(codexHome, 'prompts'))));
    skills.push(...(await discoverUntrustedProjectConfig(join(cwd, '.codex', 'config.toml'))));

    return skills;
  },
};

export default codexDiscovery;

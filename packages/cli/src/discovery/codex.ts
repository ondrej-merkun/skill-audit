import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import os from 'node:os';
import { basename, dirname, join, relative } from 'node:path';
import type { AgentDiscovery, DiscoverSkillsOptions, Skill } from '../types.js';
import { shouldSkipMarketplacePath, withInstallState } from './marketplace.js';
import { fallbackSkillNameFromDirectory } from './names.js';
import { computeTreeSha256 } from './tree-hash.js';

const AGENT_ID = 'codex';

type WalkOptions = {
  includeMarketplaces?: boolean;
  skipDirectory?: (dirPath: string, entryName: string, parentPath: string) => boolean;
};

type EnabledPluginCache = {
  marketplace: string;
  plugin: string;
};

function getCodexHome(): string {
  return (
    process.env.CODEX_HOME ??
    join(process.env.HOME ?? process.env.USERPROFILE ?? os.homedir(), '.codex')
  );
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

async function walkFiles(root: string, options: WalkOptions = {}): Promise<string[]> {
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
        if (shouldSkipMarketplacePath(fullPath, options.includeMarketplaces)) continue;
        if (options.skipDirectory?.(fullPath, entry.name, dir)) continue;
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
    name: fallbackSkillNameFromDirectory(dirPath),
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

async function discoverSkillDirs(
  dir: string,
  scope: Skill['scope'],
  options: DiscoverSkillsOptions = {}
): Promise<Skill[]> {
  const files = await walkFiles(dir, options);
  const manifests = files.filter((file) => basename(file) === 'SKILL.md');
  return Promise.all(
    manifests.map(async (manifest) =>
      withInstallState(await skillFromDir(dirname(manifest), 'SKILL.md', scope, 'SKILL.md'))
    )
  );
}

async function discoverPluginTree(
  dir: string,
  scope: Skill['scope'],
  options: DiscoverSkillsOptions = {}
): Promise<Skill[]> {
  const files = await walkFiles(dir, {
    ...(options.includeMarketplaces === true ? { includeMarketplaces: true } : {}),
    skipDirectory: (_dirPath, entryName, parentPath) => entryName === 'cache' && parentPath === dir,
  });
  const skills: Skill[] = [];

  for (const file of files) {
    const name = basename(file);
    const segments = pathSegments(dir, file);

    if (name === 'SKILL.md') {
      skills.push(
        withInstallState(await skillFromDir(dirname(file), 'SKILL.md', scope, 'SKILL.md'))
      );
    } else if (name.endsWith('.md') && segments.includes('commands')) {
      skills.push(
        withInstallState(await skillFromFile(file, basename(file, '.md'), 'prompt-md', scope))
      );
    }
  }

  return skills;
}

async function discoverActivePluginPayloadTree(
  dir: string,
  scope: Skill['scope'],
  options: DiscoverSkillsOptions = {}
): Promise<Skill[]> {
  const files = await walkFiles(dir, options);
  const skills: Skill[] = [];

  for (const file of files) {
    const name = basename(file);
    const segments = pathSegments(dir, file);

    if (name === 'SKILL.md') {
      skills.push(
        withInstallState(await skillFromDir(dirname(file), 'SKILL.md', scope, 'SKILL.md'))
      );
    } else if (name.endsWith('.md') && segments.includes('commands')) {
      skills.push(
        withInstallState(await skillFromFile(file, basename(file, '.md'), 'prompt-md', scope))
      );
    } else if (name.endsWith('.md') && segments.includes('agents')) {
      skills.push(
        withInstallState(await skillFromFile(file, basename(file, '.md'), 'agents-md', scope))
      );
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

function parseEnabledPluginCacheRef(name: string): EnabledPluginCache | null {
  const atIndex = name.lastIndexOf('@');
  if (atIndex <= 0 || atIndex === name.length - 1) return null;

  return {
    plugin: name.slice(0, atIndex),
    marketplace: name.slice(atIndex + 1),
  };
}

function parseEnabledPluginCaches(toml: string): EnabledPluginCache[] {
  let currentPlugin: string | null = null;
  const enabled = new Map<string, boolean>();

  for (const line of toml.split(/\r?\n/)) {
    const tableMatch = line.match(/^\s*\[([^\]]+)\]\s*(?:#.*)?$/);
    if (tableMatch?.[1]) {
      const pluginTable = tableMatch[1].trim().match(/^plugins\.(.+)$/);
      currentPlugin = pluginTable?.[1] ? parseTomlTableName(pluginTable[1]) : null;
      continue;
    }

    if (!currentPlugin) continue;

    const enabledMatch = line.match(/^\s*enabled\s*=\s*(true|false)\s*(?:#.*)?$/);
    if (enabledMatch?.[1]) enabled.set(currentPlugin, enabledMatch[1] === 'true');
  }

  return [...enabled.entries()]
    .filter(([, isEnabled]) => isEnabled)
    .map(([name]) => parseEnabledPluginCacheRef(name))
    .filter((ref): ref is EnabledPluginCache => ref !== null)
    .sort((a, b) => a.marketplace.localeCompare(b.marketplace) || a.plugin.localeCompare(b.plugin));
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

async function discoverEnabledPluginCaches(
  codexHome: string,
  configPath: string,
  scope: Skill['scope'],
  options: DiscoverSkillsOptions = {}
): Promise<Skill[]> {
  let raw: string;
  try {
    raw = await readFile(configPath, 'utf8');
  } catch {
    return [];
  }

  const skills: Skill[] = [];
  const refs = parseEnabledPluginCaches(raw);

  for (const ref of refs) {
    const cacheRoot = join(codexHome, 'plugins', 'cache', ref.marketplace, ref.plugin);
    skills.push(...(await discoverActivePluginPayloadTree(cacheRoot, scope, options)));
  }

  return skills;
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

  async discoverSkills(options: DiscoverSkillsOptions = {}): Promise<Skill[]> {
    const codexHome = getCodexHome();
    const cwd = getCwd();
    const skills: Skill[] = [];

    skills.push(...(await discoverAgentFiles(codexHome)));
    skills.push(...(await discoverMcpToml(join(codexHome, 'config.toml'), 'user')));
    skills.push(...(await discoverSkillDirs(join(codexHome, 'skills'), 'user', options)));
    skills.push(...(await discoverPluginTree(join(codexHome, 'plugins'), 'user', options)));
    skills.push(
      ...(await discoverEnabledPluginCaches(
        codexHome,
        join(codexHome, 'config.toml'),
        'user',
        options
      ))
    );
    skills.push(...(await discoverPromptFiles(join(codexHome, 'prompts'))));
    skills.push(
      ...(await discoverActivePluginPayloadTree(join(cwd, '.codex-plugin'), 'project', options))
    );
    skills.push(...(await discoverUntrustedProjectConfig(join(cwd, '.codex', 'config.toml'))));

    return skills;
  },
};

export default codexDiscovery;

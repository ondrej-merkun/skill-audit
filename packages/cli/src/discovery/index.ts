import type { DiscoveryProgressCallback } from '../progress.js';
import type { AgentDiscovery, Skill } from '../types.js';
import agentsMdSweepDiscovery from './agents-md-sweep.js';
import claudeCodeDiscovery from './claude-code.js';
import codexDiscovery from './codex.js';
import copilotDiscovery from './copilot.js';
import cursorDiscovery from './cursor.js';
import geminiDiscovery from './gemini.js';

// Registry starts empty so test files get a clean slate on import.
// Call initDefaultPlugins() from the CLI entry point to register built-ins.
const PLUGINS: AgentDiscovery[] = [];

type DedupeGroup = {
  primary: Skill;
  outputIndex: number;
  skills: Skill[];
  paths: Set<string>;
};

function cloneSkill(skill: Skill): Skill {
  return {
    ...skill,
    ...(skill.alsoInstalledAt !== undefined ? { alsoInstalledAt: [...skill.alsoInstalledAt] } : {}),
  };
}

export function isPluginCachePath(pathLike: string): boolean {
  const normalizedSegments = pathLike
    .replaceAll('\\', '/')
    .split('/')
    .filter((segment) => segment.length > 0);

  return normalizedSegments.some(
    (segment, index) => segment === 'plugins' && normalizedSegments[index + 1] === 'cache'
  );
}

function selectPrimaryPath(paths: Iterable<string>): string {
  const sortedPaths = [...paths].sort();
  const nonCachePath = sortedPaths.find((path) => !isPluginCachePath(path));
  return nonCachePath ?? sortedPaths[0] ?? '';
}

function selectPrimarySkill(group: DedupeGroup, primaryPath: string): Skill {
  return (
    group.skills.find((skill) => skill.path === primaryPath) ?? {
      ...group.primary,
      path: primaryPath,
    }
  );
}

export function dedupeDiscoveredSkills(skills: Skill[]): Skill[] {
  const output: Skill[] = [];
  const byTreeHash = new Map<string, DedupeGroup>();

  for (const skill of skills) {
    const clonedSkill = cloneSkill(skill);

    if (clonedSkill.treeSha256 === '') {
      output.push(clonedSkill);
      continue;
    }

    const paths = [skill.path, ...(skill.alsoInstalledAt ?? [])];
    const existing = byTreeHash.get(clonedSkill.treeSha256);

    if (existing === undefined) {
      const pathSet = new Set(paths);
      byTreeHash.set(clonedSkill.treeSha256, {
        primary: clonedSkill,
        outputIndex: output.length,
        skills: [clonedSkill],
        paths: pathSet,
      });
      output.push(clonedSkill);
      continue;
    }

    existing.skills.push(clonedSkill);
    for (const path of paths) {
      existing.paths.add(path);
    }
  }

  for (const group of byTreeHash.values()) {
    const primaryPath = selectPrimaryPath(group.paths);
    const selectedPrimary = selectPrimarySkill(group, primaryPath);
    const { alsoInstalledAt: _alsoInstalledAt, ...primaryWithoutAliases } = selectedPrimary;

    const alsoInstalledAt = [...group.paths].filter((path) => path !== primaryPath).sort();
    output[group.outputIndex] = {
      ...primaryWithoutAliases,
      path: primaryPath,
      ...(alsoInstalledAt.length > 0 ? { alsoInstalledAt } : {}),
    };
  }

  return output;
}

/**
 * Register all built-in discovery plugins.
 * Called once from the CLI entry point — NOT at module load time, so tests
 * can import the registry without touching the real filesystem.
 */
export function initDefaultPlugins(): void {
  PLUGINS.push(
    claudeCodeDiscovery,
    cursorDiscovery,
    copilotDiscovery,
    codexDiscovery,
    geminiDiscovery,
    agentsMdSweepDiscovery
  );
}

/**
 * Run all registered discovery plugins and collect every skill they find.
 * Plugins that are not installed are silently skipped.
 * Plugins that throw are caught and logged to stderr — discovery is fail-silent.
 */
export type DiscoverAllOptions = {
  agent?: string;
  onProgress?: DiscoveryProgressCallback;
};

export async function discoverAll(options: DiscoverAllOptions = {}): Promise<Skill[]> {
  const results: Skill[] = [];
  const plugins =
    options.agent === undefined ? PLUGINS : PLUGINS.filter((plugin) => plugin.id === options.agent);
  options.onProgress?.({ type: 'start', pluginCount: plugins.length });

  for (const plugin of plugins) {
    options.onProgress?.({
      type: 'checking-agent',
      agentId: plugin.id,
      displayName: plugin.displayName,
    });

    let installed: boolean;
    try {
      installed = await plugin.isInstalled();
    } catch {
      // If we can't determine installation, skip the plugin
      continue;
    }

    if (!installed) {
      options.onProgress?.({
        type: 'agent-skipped',
        agentId: plugin.id,
        displayName: plugin.displayName,
      });
      continue;
    }

    try {
      const skills = await plugin.discoverSkills();
      results.push(...skills);
      options.onProgress?.({
        type: 'agent-done',
        agentId: plugin.id,
        displayName: plugin.displayName,
        skillCount: skills.length,
      });
    } catch (err) {
      // Fail-silent: one broken plugin must not abort the entire scan
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[skillaudit] discovery plugin "${plugin.id}" failed: ${msg}\n`);
    }
  }

  const deduped = dedupeDiscoveredSkills(results);
  options.onProgress?.({
    type: 'complete',
    skillCount: deduped.length,
    agentCount: new Set(deduped.map((skill) => skill.agentId)).size,
  });
  return deduped;
}

/**
 * Register a discovery plugin into the runtime registry.
 * Intended for use by tests and explicit registry setup.
 */
export function registerPlugin(plugin: AgentDiscovery): void {
  PLUGINS.push(plugin);
}

/**
 * Remove all plugins — used in tests to reset state between runs.
 */
export function clearPlugins(): void {
  PLUGINS.length = 0;
}

export type { AgentDiscovery };

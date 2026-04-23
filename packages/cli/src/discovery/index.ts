import type { AgentDiscovery, Skill } from '../types.js';

// Registry of all discovery plugins — append new plugins here as they are implemented
const PLUGINS: AgentDiscovery[] = [
  // claude-code, cursor, copilot, agents-md-sweep added in tasks 2.2–2.5
];

/**
 * Run all registered discovery plugins and collect every skill they find.
 * Plugins that are not installed are silently skipped.
 * Plugins that throw are caught and logged to stderr — discovery is fail-silent.
 */
export async function discoverAll(): Promise<Skill[]> {
  const results: Skill[] = [];

  for (const plugin of PLUGINS) {
    let installed: boolean;
    try {
      installed = await plugin.isInstalled();
    } catch {
      // If we can't determine installation, skip the plugin
      continue;
    }

    if (!installed) continue;

    try {
      const skills = await plugin.discoverSkills();
      results.push(...skills);
    } catch (err) {
      // Fail-silent: one broken plugin must not abort the entire scan
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[skillaudit] discovery plugin "${plugin.id}" failed: ${msg}\n`);
    }
  }

  return results;
}

/**
 * Register a discovery plugin into the runtime registry.
 * Intended for use by tests and future dynamic plugin loading.
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

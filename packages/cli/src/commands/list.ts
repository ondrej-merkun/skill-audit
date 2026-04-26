import chalk from 'chalk';
import Table from 'cli-table3';
import { formatAgentName } from '../agent-names.js';
import { clearPlugins, discoverAll, initDefaultPlugins } from '../discovery/index.js';
import { createProgressReporter, selectProgressMode } from '../progress.js';
import type { Skill } from '../types.js';

const NO_BORDERS = {
  top: '',
  'top-mid': '',
  'top-left': '',
  'top-right': '',
  bottom: '',
  'bottom-mid': '',
  'bottom-left': '',
  'bottom-right': '',
  left: ' ',
  'left-mid': '',
  mid: '',
  'mid-mid': '',
  right: '',
  'right-mid': '',
  middle: ' ',
};

const SCOPE_COLOR: Record<Skill['scope'], (s: string) => string> = {
  user: chalk.cyan,
  project: chalk.yellow,
  managed: chalk.magenta,
};

const SCOPE_RANK: Record<Skill['scope'], number> = {
  project: 0,
  managed: 1,
  user: 2,
};

export type ListOptions = {
  agent: string | undefined;
  json: boolean;
};

function compareString(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function sortListSkills(skills: Skill[]): Skill[] {
  return [...skills].sort((a, b) => {
    const scopeDelta = SCOPE_RANK[a.scope] - SCOPE_RANK[b.scope];
    if (scopeDelta !== 0) return scopeDelta;

    return (
      compareString(a.agentId, b.agentId) ||
      compareString(a.name, b.name) ||
      compareString(a.path, b.path)
    );
  });
}

function shortenPath(p: string): string {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? '';
  return home ? p.replace(home, '~') : p;
}

export async function runList(opts: Partial<ListOptions> = {}): Promise<void> {
  const options: ListOptions = { agent: undefined, json: false, ...opts };

  clearPlugins();
  initDefaultPlugins();

  const progress = createProgressReporter({
    mode: selectProgressMode({
      outputKind: options.json ? 'json' : 'pretty',
      stdoutIsTTY: process.stdout.isTTY === true,
      stderrIsTTY: process.stderr.isTTY === true,
    }),
  });

  let skills: Skill[];
  try {
    skills = await discoverAll({ onProgress: progress.onDiscoveryProgress });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[skill-audit] error: ${msg}\n`);
    process.exit(2);
  }

  if (options.agent) {
    skills = skills.filter((s) => s.agentId === options.agent);
  }
  skills = sortListSkills(skills);

  if (options.json) {
    process.stdout.write(
      `${JSON.stringify(
        skills.map((s) => ({
          agent: s.agentId,
          name: s.name,
          path: s.path,
          ...(s.alsoInstalledAt !== undefined && s.alsoInstalledAt.length > 0
            ? { also_installed_at: s.alsoInstalledAt }
            : {}),
          tree_sha256: s.treeSha256,
          scope: s.scope,
          format: s.format,
        })),
        null,
        2
      )}\n`
    );
    return;
  }

  if (skills.length === 0) {
    process.stdout.write(chalk.grey('No skills found.\n'));
    return;
  }

  const table = new Table({
    chars: NO_BORDERS,
    head: [chalk.bold('Agent'), chalk.bold('Name'), chalk.bold('Path'), chalk.bold('Scope')],
    style: { head: [], border: [] },
  });

  for (const skill of skills) {
    const colorScope = SCOPE_COLOR[skill.scope] ?? chalk.white;
    table.push([
      chalk.dim(formatAgentName(skill.agentId)),
      skill.name,
      chalk.grey(shortenPath(skill.path)),
      colorScope(skill.scope),
    ]);
  }

  process.stdout.write(`${table.toString()}\n`);
  process.stdout.write(
    chalk.dim(`\n${skills.length} skill${skills.length === 1 ? '' : 's'} found.\n`)
  );
}

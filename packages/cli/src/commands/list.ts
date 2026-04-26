import chalk from 'chalk';
import Table from 'cli-table3';
import ora from 'ora';
import { clearPlugins, discoverAll, initDefaultPlugins } from '../discovery/index.js';
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

export type ListOptions = {
  agent: string | undefined;
  json: boolean;
};

function shortenPath(p: string): string {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? '';
  return home ? p.replace(home, '~') : p;
}

export async function runList(opts: Partial<ListOptions> = {}): Promise<void> {
  const options: ListOptions = { agent: undefined, json: false, ...opts };

  clearPlugins();
  initDefaultPlugins();

  const spinner = ora('Discovering skills…').start();
  let skills: Skill[];
  try {
    skills = await discoverAll();
  } catch (err) {
    spinner.fail('Discovery failed');
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[skillaudit] error: ${msg}\n`);
    process.exit(2);
  }

  spinner.stop();

  if (options.agent) {
    skills = skills.filter((s) => s.agentId === options.agent);
  }

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
      chalk.dim(skill.agentId),
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

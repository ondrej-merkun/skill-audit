import chalk from 'chalk';
import ora from 'ora';
import { appendToIgnoreList, loadIgnoreList } from '../allowlist/ignore.js';
import { clearPlugins, discoverAll, initDefaultPlugins } from '../discovery/index.js';

export async function runIgnore(skillNameOrId: string): Promise<void> {
  clearPlugins();
  initDefaultPlugins();

  const spinner = ora('Discovering skills…').start();
  let skills: Awaited<ReturnType<typeof discoverAll>>;
  try {
    skills = await discoverAll();
  } catch (err) {
    spinner.fail('Discovery failed');
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[skillaudit] error: ${msg}\n`);
    process.exit(2);
  }
  spinner.stop();

  const match = skills.find(
    (s) => s.name === skillNameOrId || s.id === skillNameOrId || s.path === skillNameOrId
  );

  if (!match) {
    process.stderr.write(`[skillaudit] no skill found matching "${skillNameOrId}"\n`);
    process.stderr.write(
      chalk.dim(`Run ${chalk.bold('skillaudit list')} to see installed skills.\n`)
    );
    process.exit(1);
  }

  const current = await loadIgnoreList();
  if (current.has(match.treeSha256)) {
    process.stdout.write(chalk.yellow(`"${match.name}" is already ignored.\n`));
    return;
  }

  await appendToIgnoreList(match.treeSha256, match.name);
  process.stdout.write(chalk.green(`✓ "${match.name}" added to ignore list.\n`));
  process.stdout.write(chalk.dim(`  treeSha256: ${match.treeSha256}\n`));
  process.stdout.write(chalk.dim('  Subsequent scans will skip this skill.\n'));
}

import { Command } from 'commander';
import { runExplain } from './commands/explain.js';
import type { ExplainOptions } from './commands/explain.js';
import { runIgnore } from './commands/ignore.js';
import { runList } from './commands/list.js';
import type { ListOptions } from './commands/list.js';
import { runScan } from './commands/scan.js';
import type { ScanOptions } from './commands/scan.js';

const program = new Command();

program
  .name('skillaudit')
  .description('Scan AI agent skills for prompt injection and malicious code')
  .version('0.1.0');

program
  .command('scan')
  .description('Scan installed agent skills for security issues')
  .option('--json', 'emit JSON to stdout instead of TUI table')
  .option('--summary', 'emit compact one-liner summary instead of full table')
  .option('--html <file>', 'write standalone HTML report to <file>')
  .option('-o, --output <file>', 'write selected non-HTML scan output to <file>')
  .option('--offline', 'skip network enrichment calls')
  .option('--strict', 'treat REVIEW band as FAIL for exit code purposes')
  .option('--agent <id>', 'restrict scan to a single agent (e.g. claude-code, cursor)')
  .option(
    '--fail-on <band>',
    'minimum verdict band that triggers exit code 1 (REVIEW or FAIL)',
    'FAIL'
  )
  .action((cmdOpts: Record<string, unknown>) => {
    const options: Partial<ScanOptions> = {
      json: cmdOpts.json === true,
      summary: cmdOpts.summary === true,
      html: typeof cmdOpts.html === 'string' ? cmdOpts.html : undefined,
      output: typeof cmdOpts.output === 'string' ? cmdOpts.output : undefined,
      offline: cmdOpts.offline === true,
      strict: cmdOpts.strict === true,
      agent: typeof cmdOpts.agent === 'string' ? cmdOpts.agent : undefined,
      failOn: typeof cmdOpts.failOn === 'string' ? cmdOpts.failOn : undefined,
    };
    runScan(options).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[skillaudit] fatal: ${msg}\n`);
      process.exit(2);
    });
  });

program
  .command('list')
  .description('List all discovered agent skills without scanning')
  .option('--agent <id>', 'restrict to a single agent (e.g. claude-code, cursor)')
  .option('--json', 'emit JSON array to stdout')
  .action((cmdOpts: Record<string, unknown>) => {
    const options: Partial<ListOptions> = {
      agent: typeof cmdOpts.agent === 'string' ? cmdOpts.agent : undefined,
      json: cmdOpts.json === true,
    };
    runList(options).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[skillaudit] fatal: ${msg}\n`);
      process.exit(2);
    });
  });

program
  .command('explain <skill-name-or-id>')
  .description('Show full detail view for a single skill')
  .option('--offline', 'skip network enrichment calls')
  .option('--json', 'emit JSON to stdout instead of detail view')
  .action((nameOrId: string, cmdOpts: Record<string, unknown>) => {
    const options: Partial<ExplainOptions> = {
      offline: cmdOpts.offline === true,
      json: cmdOpts.json === true,
    };
    runExplain(nameOrId, options).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[skillaudit] fatal: ${msg}\n`);
      process.exit(2);
    });
  });

program
  .command('ignore <skill-name-or-id>')
  .description('Add a skill to the ignore list (skipped on subsequent scans)')
  .action((nameOrId: string) => {
    runIgnore(nameOrId).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[skillaudit] fatal: ${msg}\n`);
      process.exit(2);
    });
  });

program.parse();

import { Command } from 'commander';
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

program.parse();

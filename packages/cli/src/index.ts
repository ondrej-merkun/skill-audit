import { Command } from 'commander';
import { runScan } from './commands/scan.js';

const program = new Command();

program
  .name('skillaudit')
  .description('Scan AI agent skills for prompt injection and malicious code')
  .version('0.1.0');

program
  .command('scan')
  .description('Scan installed agent skills for security issues')
  .action(() => {
    runScan().catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[skillaudit] fatal: ${msg}\n`);
      process.exit(2);
    });
  });

program.parse();

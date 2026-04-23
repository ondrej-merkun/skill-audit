import { Command } from 'commander';

const program = new Command();

program
  .name('skillaudit')
  .description('Scan AI agent skills for prompt injection and malicious code')
  .version('0.1.0');

program
  .command('scan')
  .description('Scan installed agent skills for security issues')
  .action(() => {
    console.log('not yet implemented');
    process.exit(0);
  });

program.parse();

import { Command, Option } from 'commander';
import { runExplain } from './commands/explain.js';
import type { ExplainOptions } from './commands/explain.js';
import { runIgnore } from './commands/ignore.js';
import { runList } from './commands/list.js';
import type { ListOptions } from './commands/list.js';
import { runLlmAdd, runLlmCheck, runLlmList } from './commands/llm.js';
import type { LlmAddOptions, LlmCheckOptions, LlmListOptions } from './commands/llm.js';
import { runScan } from './commands/scan.js';
import type { ScanOptions } from './commands/scan.js';
import { VERSION } from './version.js';

const program = new Command();

program
  .name('skill-audit')
  .description('Scan AI agent skills for prompt injection and malicious code')
  .version(VERSION);

program.action(() => {
  runScan({}).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[skill-audit] fatal: ${msg}\n`);
    process.exit(2);
  });
});

program
  .command('scan')
  .description('Scan installed agent skills for security issues')
  .option('--json', 'emit JSON to stdout instead of TUI table')
  .option('--summary', 'emit compact one-liner summary instead of full table')
  .option('--html <file>', 'write standalone HTML report to <file>')
  .option('-o, --output <file>', 'write selected non-HTML scan output to <file>')
  .addOption(new Option('--offline', 'skip disabled network enrichment calls').hideHelp())
  .option('--strict', 'treat REVIEW band as FAIL for exit code purposes')
  .option('--agent <id>', 'restrict scan to a single agent (e.g. claude-code, cursor)')
  .option('--include-marketplaces', 'include locally available but inactive marketplace skills')
  .option(
    '--llm <name>',
    'run optional local LLM review; repeat, comma-separate, or use "all"',
    (value: string, previous: string[]) => [...previous, value],
    []
  )
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
      includeMarketplaces: cmdOpts.includeMarketplaces === true,
      llm: Array.isArray(cmdOpts.llm) && cmdOpts.llm.length > 0 ? cmdOpts.llm : undefined,
      failOn: typeof cmdOpts.failOn === 'string' ? cmdOpts.failOn : undefined,
    };
    runScan(options).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[skill-audit] fatal: ${msg}\n`);
      process.exit(2);
    });
  });

program
  .command('list')
  .description('List all discovered agent skills without scanning')
  .option('--agent <id>', 'restrict to a single agent (e.g. claude-code, cursor)')
  .option('--include-marketplaces', 'include locally available but inactive marketplace skills')
  .option('--json', 'emit JSON array to stdout')
  .action((cmdOpts: Record<string, unknown>) => {
    const options: Partial<ListOptions> = {
      agent: typeof cmdOpts.agent === 'string' ? cmdOpts.agent : undefined,
      includeMarketplaces: cmdOpts.includeMarketplaces === true,
      json: cmdOpts.json === true,
    };
    runList(options).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[skill-audit] fatal: ${msg}\n`);
      process.exit(2);
    });
  });

program
  .command('explain <skill-name-or-id>')
  .description('Show full detail view for a single skill')
  .addOption(new Option('--offline', 'skip disabled network enrichment calls').hideHelp())
  .option('--json', 'emit JSON to stdout instead of detail view')
  .action((nameOrId: string, cmdOpts: Record<string, unknown>) => {
    const options: Partial<ExplainOptions> = {
      offline: cmdOpts.offline === true,
      json: cmdOpts.json === true,
    };
    runExplain(nameOrId, options).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[skill-audit] fatal: ${msg}\n`);
      process.exit(2);
    });
  });

program
  .command('ignore <skill-name-or-id>')
  .description('Add a skill to the ignore list (skipped on subsequent scans)')
  .action((nameOrId: string) => {
    runIgnore(nameOrId).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[skill-audit] fatal: ${msg}\n`);
      process.exit(2);
    });
  });

const llm = program.command('llm').description('Manage optional local LLM review models');

llm
  .command('add <name>')
  .description('Store a named loopback OpenAI-compatible model configuration')
  .requiredOption('--base-url <url>', 'loopback OpenAI-compatible server base URL')
  .requiredOption('--model <id>', 'local model id')
  .option('--provider <provider>', 'provider type', 'openai-compatible')
  .option('--timeout <ms>', 'health-check timeout in milliseconds')
  .option('--context-tokens <tokens>', 'maximum context/token budget')
  .option('--disabled', 'store the model as disabled')
  .action((name: string, cmdOpts: Record<string, unknown>) => {
    const options: Partial<LlmAddOptions> = {
      provider: typeof cmdOpts.provider === 'string' ? cmdOpts.provider : undefined,
      baseUrl: typeof cmdOpts.baseUrl === 'string' ? cmdOpts.baseUrl : undefined,
      model: typeof cmdOpts.model === 'string' ? cmdOpts.model : undefined,
      timeout: typeof cmdOpts.timeout === 'string' ? cmdOpts.timeout : undefined,
      contextTokens: typeof cmdOpts.contextTokens === 'string' ? cmdOpts.contextTokens : undefined,
      disabled: cmdOpts.disabled === true,
    };
    runLlmAdd(name, options).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[skill-audit] fatal: ${msg}\n`);
      process.exit(2);
    });
  });

llm
  .command('list')
  .description('List configured local review models')
  .option('--json', 'emit JSON array to stdout')
  .action((cmdOpts: Record<string, unknown>) => {
    const options: Partial<LlmListOptions> = {
      json: cmdOpts.json === true,
    };
    runLlmList(options).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[skill-audit] fatal: ${msg}\n`);
      process.exit(2);
    });
  });

llm
  .command('check <name>')
  .description('Verify connectivity for one configured local review model')
  .option('--json', 'emit JSON object to stdout')
  .action((name: string, cmdOpts: Record<string, unknown>) => {
    const options: Partial<LlmCheckOptions> = {
      json: cmdOpts.json === true,
    };
    runLlmCheck(name, options).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[skill-audit] fatal: ${msg}\n`);
      process.exit(2);
    });
  });

program.parse();

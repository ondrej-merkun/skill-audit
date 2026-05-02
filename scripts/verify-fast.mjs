import { spawn } from 'node:child_process';

const commands = [
  ['build', ['pnpm', ['build']]],
  ['lint', ['pnpm', ['lint']]],
  ['typecheck', ['pnpm', ['typecheck']]],
];

function run(label, [cmd, args]) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', (chunk) => process.stdout.write(`[${label}] ${chunk}`));
    child.stderr.on('data', (chunk) => process.stderr.write(`[${label}] ${chunk}`));
    child.on('close', (code) => resolve({ label, code: code ?? 1 }));
  });
}

const results = await Promise.all(commands.map(([label, command]) => run(label, command)));
const failed = results.filter((result) => result.code !== 0);

if (failed.length > 0) {
  for (const result of failed) {
    process.stderr.write(`[verify] ${result.label} failed with exit code ${result.code}\n`);
  }
  process.exit(1);
}

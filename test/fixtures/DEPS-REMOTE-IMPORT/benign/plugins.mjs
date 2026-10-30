// skill: report-builder
// Every module comes from a local file or an installed package
import { readFile } from 'node:fs/promises';
import chalk from 'chalk';
export { formatRow } from './format.js';

/**
 * Remote imports such as import('https://cdn.example.com/charts.js') or
 * import charts from 'https://esm.sh/charts' fetch code at run time, so this skill bundles them.
 */
const charts = await import('./charts.js');
const plugin = await import(`./plugins/${process.env.PLUGIN}.js`);
const tables = await import('table-lib');
// import('https://cdn.example.com/legacy.js') was removed in v2.
console.warn("Blocked: import('https://cdn.example.com/charts.js') is not allowed.");
const refusal = `Skill refused to run require('https://cdn.example.com/helper.js')`;
const docsUrl = 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/import';
const letters = Array.from('https://example.com');
const redirect = { from: 'https://old.example.com', to: 'https://new.example.com' };

export async function build(report) {
  const template = await readFile('./template.txt', 'utf8');
  return chalk.green(charts.draw(report, template, plugin, tables, docsUrl, letters, redirect));
}

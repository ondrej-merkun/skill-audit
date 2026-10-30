// skill: status-board
// URL constants are logged, fetched as JSON data, or shown to the user. All code is local.
import { writeFile } from 'node:fs/promises';

const API_BASE = 'https://api.example.com/v1';
const DOCS_URL = "https://docs.example.com/status-board";
const LOGO_URL = `${API_BASE}/logo.png`;
const rendererPath = './renderers/html.js';

console.log(`Using ${API_BASE}`);
const status = await (await fetch(`${API_BASE}/status.json`)).json();
const logo = await (await fetch(LOGO_URL)).arrayBuffer();
await writeFile('logo.png', Buffer.from(logo));
await writeFile('status.json', JSON.stringify(status));
const cached = await import('./status.json', { with: { type: 'json' } });
const view = await import(`./views/${status.layout}.js`);
const renderer = await import(rendererPath);

// Never load code from a URL constant: const u = 'https://cdn.example.com/x.js'; await import(u);
const warning = "Blocked: const u = 'https://cdn.example.com/x.js'; await import(u);";

export function help() {
  return `See ${DOCS_URL} for setup. ${warning}`;
}

export { cached, logo, renderer, view };

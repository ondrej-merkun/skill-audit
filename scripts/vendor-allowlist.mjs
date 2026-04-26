#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

const repoRoot = resolve(new URL('..', import.meta.url).pathname);
const codexHome = process.env.CODEX_HOME ?? join(process.env.HOME ?? '', '.codex');
const outputPath = join(repoRoot, 'packages/cli/src/allowlist/anthropic-skills.json');

const sources = [
  {
    name: 'pdf',
    vendor: 'openai-curated',
    path: 'codex/vendor_imports/skills/skills/.curated/pdf',
    source: join(codexHome, 'vendor_imports/skills/skills/.curated/pdf'),
  },
  {
    name: 'linear',
    vendor: 'openai-curated',
    path: 'codex/vendor_imports/skills/skills/.curated/linear',
    source: join(codexHome, 'vendor_imports/skills/skills/.curated/linear'),
  },
  {
    name: 'sentry',
    vendor: 'openai-curated',
    path: 'codex/vendor_imports/skills/skills/.curated/sentry',
    source: join(codexHome, 'vendor_imports/skills/skills/.curated/sentry'),
  },
  {
    name: 'openai-docs',
    vendor: 'openai-curated',
    path: 'codex/vendor_imports/skills/skills/.curated/openai-docs',
    source: join(codexHome, 'vendor_imports/skills/skills/.curated/openai-docs'),
  },
  {
    name: 'github/gh-fix-ci',
    vendor: 'openai-curated',
    path: 'codex/vendor_imports/skills/skills/.curated/gh-fix-ci',
    source: join(codexHome, 'vendor_imports/skills/skills/.curated/gh-fix-ci'),
  },
  {
    name: 'github/gh-address-comments',
    vendor: 'openai-curated',
    path: 'codex/vendor_imports/skills/skills/.curated/gh-address-comments',
    source: join(codexHome, 'vendor_imports/skills/skills/.curated/gh-address-comments'),
  },
  {
    name: 'github/yeet',
    vendor: 'openai-curated',
    path: 'codex/vendor_imports/skills/skills/.curated/yeet',
    source: join(codexHome, 'vendor_imports/skills/skills/.curated/yeet'),
  },
  {
    name: 'skillaudit',
    vendor: 'skillaudit',
    path: 'skillaudit/packages/skill',
    source: join(repoRoot, 'packages/skill'),
  },
];

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function computeTreeSha256(path) {
  const s = await stat(path);
  if (s.isFile()) {
    return createHash('sha256').update(await readFile(path)).digest('hex');
  }

  const entries = [];
  async function walk(dir) {
    const items = await readdir(dir, { withFileTypes: true });
    for (const item of items) {
      const full = join(dir, item.name);
      if (item.isDirectory()) {
        await walk(full);
      } else if (item.isFile()) {
        entries.push({
          rel: relative(path, full),
          sha: createHash('sha256').update(await readFile(full)).digest('hex'),
        });
      }
    }
  }

  await walk(path);
  entries.sort((a, b) => a.rel.localeCompare(b.rel));
  return createHash('sha256')
    .update(entries.map((entry) => `${entry.rel}:${entry.sha}`).join('\n'))
    .digest('hex');
}

const entries = [];
const missing = [];

for (const source of sources) {
  if (!(await pathExists(source.source))) {
    missing.push(source.path);
    continue;
  }

  entries.push({
    name: source.name,
    vendor: source.vendor,
    path: source.path,
    sha256_tree: await computeTreeSha256(source.source),
  });
}

const manifest = {
  _note: 'Exact tree hashes only. Regenerate with: node scripts/vendor-allowlist.mjs',
  version: '1.0',
  entries,
};

await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');

process.stderr.write(`Wrote ${entries.length} allowlist entries to ${relative(repoRoot, outputPath)}\n`);
if (missing.length > 0) {
  process.stderr.write(`Skipped ${missing.length} missing source paths:\n`);
  for (const path of missing) process.stderr.write(`  - ${path}\n`);
}

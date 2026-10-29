import { defineConfig } from 'tsdown';
import packageJson from './package.json' with { type: 'json' };

// The package ships only the `skill-audit` bin: one ESM file, no library entry
// points. Runtime `dependencies` stay external, which is the tsdown default.
export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  target: 'node22',
  // tsdown follows `declaration: true` in tsconfig.json unless told otherwise.
  dts: false,
  // Keep `dist/index.js`, the bin path. The node platform defaults to `.mjs`.
  fixedExtension: false,
  define: {
    __PACKAGE_VERSION__: JSON.stringify(packageJson.version),
  },
  banner: {
    js: '#!/usr/bin/env node',
  },
});

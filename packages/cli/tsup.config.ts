import { defineConfig } from 'tsup';
import packageJson from './package.json' with { type: 'json' };

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: false,
  target: 'node20',
  splitting: false,
  sourcemap: false,
  clean: false,
  define: {
    __PACKAGE_VERSION__: JSON.stringify(packageJson.version),
  },
  banner: {
    js: '#!/usr/bin/env node',
  },
});

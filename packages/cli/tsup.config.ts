import { defineConfig } from 'tsup';
import packageJson from './package.json' with { type: 'json' };

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  target: 'node20',
  splitting: false,
  sourcemap: false,
  clean: true,
  define: {
    __PACKAGE_VERSION__: JSON.stringify(packageJson.version),
  },
  banner: {
    js: '#!/usr/bin/env node',
  },
});

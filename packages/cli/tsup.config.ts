import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  target: 'node20',
  splitting: false,
  sourcemap: false,
  clean: true,
  banner: {
    js: '#!/usr/bin/env node',
  },
});

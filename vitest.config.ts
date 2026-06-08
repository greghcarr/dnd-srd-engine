import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: [
      // Web demo scenarios import via the package name. Alias them
      // back to local source so the CI replay test (and any future
      // web-scenario tests) can run without a `dist/` build first.
      { find: /^dnd-srd-engine\/starter-pack$/, replacement: resolve(__dirname, 'src/starter-pack.ts') },
      { find: /^dnd-srd-engine$/, replacement: resolve(__dirname, 'src/index.ts') },
      { find: '@', replacement: resolve(__dirname, 'src') },
    ],
  },
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Slice 746: reuse each worker's module graph across test files instead
    // of re-executing every file in a fresh registry. This lets the cached,
    // deep-frozen starter pack (src/content/packs/starter.ts) be validated
    // once per worker rather than ~570 times (once per file) — the dominant
    // cost of the suite. The engine is pure / event-sourced with no shared
    // mutable module state, and ids are random (ulid) and golden-normalized,
    // so cross-file isolation isn't relied upon.
    isolate: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/index.ts',
        'src/types/**',
        'src/handlers/**',
        'src/internal/**',
        'src/**/*.d.ts',
        'src/engine/ids-utils.ts',
      ],
      thresholds: {
        'src/engine/**': { lines: 80, statements: 80 },
        'src/derive/**': { lines: 80, statements: 80 },
        'src/effects/**': { lines: 80, statements: 80 },
      },
    },
  },
});

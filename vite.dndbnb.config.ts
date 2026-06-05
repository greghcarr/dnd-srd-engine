import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// Vite config for dndbnb (`dndbnb/`).
//
// Separate from the library config (`vite.config.ts`) so dndbnb can
// be its own React app build while sharing the engine source tree.
//
// Engine import boundary:
//   - In dev, `dnd-srd-engine` resolves to local `src/` so engine
//     changes hot-reload into dndbnb.
//   - In production, the alias points at the built `dist/` so the
//     deployed app runs the same bundle external consumers get.
//
// Build outDir: `dist-dndbnb/` at the repo root. Deploy workflow
// pushes that directory to a sibling `greghcarr/dndbnb` repo's
// `gh-pages` branch so the URL settles at `greghcarr.github.io/dndbnb`.
export default defineConfig(({ mode }) => {
  const useSrc = mode !== 'production';
  const enginePath = useSrc
    ? resolve(__dirname, 'src/index.ts')
    : resolve(__dirname, 'dist/dnd-srd-engine.js');
  const starterPath = useSrc
    ? resolve(__dirname, 'src/starter-pack.ts')
    : resolve(__dirname, 'dist/starter-pack.js');

  return {
    root: resolve(__dirname, 'dndbnb'),
    publicDir: false,
    plugins: [react()],
    // The deployed site sits at greghcarr.github.io/dndbnb, so
    // production assets resolve from `/dndbnb/`. Local dev is at the
    // root (Vite's default).
    base: mode === 'production' ? '/dndbnb/' : '/',
    resolve: {
      alias: [
        { find: /^dnd-srd-engine\/starter-pack$/, replacement: starterPath },
        { find: /^dnd-srd-engine$/, replacement: enginePath },
        { find: '@', replacement: resolve(__dirname, 'dndbnb/src') },
      ],
    },
    server: {
      port: 5174,
      strictPort: false,
    },
    build: {
      target: 'es2022',
      sourcemap: true,
      outDir: resolve(__dirname, 'dist-dndbnb'),
      emptyOutDir: true,
    },
  };
});

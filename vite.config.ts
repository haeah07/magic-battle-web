import { defineConfig } from 'vite';

// base: './' → the build works from any sub path (GitHub Pages project sites: https://<user>.github.io/magic-battle-web/)
export default defineConfig({
  base: './',
  build: { outDir: 'dist', assetsInlineLimit: 0, chunkSizeWarningLimit: 2000 },
  server: { host: true },
  test: { include: ['tests/**/*.test.ts'] },
} as any);

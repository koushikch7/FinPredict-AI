import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';
import { readFileSync, writeFileSync, existsSync } from 'fs';

/**
 * After Vite copies public/sw.js to dist/sw.js, replace the placeholder
 * `self.__FINPREDICT_VERSION__` with the actual build timestamp so every
 * deploy produces a unique cache name and forces stale shells to re-fetch.
 */
function swVersionPlugin(): Plugin {
  const version = `v${Date.now()}`;
  return {
    name: 'inject-sw-version',
    writeBundle() {
      const swPath = 'dist/sw.js';
      if (!existsSync(swPath)) return;
      const src = readFileSync(swPath, 'utf8');
      writeFileSync(
        swPath,
        src.replace("self.__FINPREDICT_VERSION__ || 'v1'", JSON.stringify(version)),
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), swVersionPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1024,
  },
  // The Express server proxies /api during dev via Vite's middleware mode
  server: {
    hmr: process.env.DISABLE_HMR !== 'true',
  },
});

import { defineConfig } from 'vite';

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  root: '.',
  publicDir: 'public',
  plugins: [cloudflare()],
  server: { port: 3001, open: false },
  build: { outDir: 'dist', target: 'es2020' },
});
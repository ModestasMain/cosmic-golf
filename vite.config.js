import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  plugins: [],
  server: { port: 3001, open: false },
  build: { outDir: 'dist', target: 'es2020' },
});

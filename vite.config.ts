import { defineConfig } from 'vite';

const SERVER = process.env.GAME_SERVER ?? 'http://localhost:8080';

export default defineConfig({
  root: 'client',
  build: {
    outDir: '../dist/client',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/ws': { target: SERVER.replace(/^http/, 'ws'), ws: true },
      '/pets': SERVER,
      '/health': SERVER,
    },
  },
});

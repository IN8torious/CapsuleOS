import { defineConfig } from 'vite';

export default defineConfig({
  root: 'toolbox',
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true
  },
  build: {
    outDir: '../dist/toolbox',
    emptyOutDir: true
  }
});

import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.join(root, 'app'),
  base: './',
  build: {
    outDir: path.join(root, 'dist', 'browser'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        browser: path.join(root, 'app', 'index.html')
      }
    }
  }
});

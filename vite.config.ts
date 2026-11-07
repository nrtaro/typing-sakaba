import { defineConfig } from 'vite';
import { developmentApiProxy } from './scripts/devProxy.ts';

export default defineConfig({
  base: './',
  server: {
    port: 5280, strictPort: true,
    proxy: { '/api': developmentApiProxy() },
  },
});

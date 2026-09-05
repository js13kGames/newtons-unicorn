import { defineConfig } from 'vite';
export default defineConfig({
  define: { DEV: 'true' },
  server: { port: 5173, open: false },
  build: { target: 'es2020' },
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Proxies /api/* to the backend during dev so the browser never has to
// deal with CORS -- the browser only ever talks to localhost:5173.
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});

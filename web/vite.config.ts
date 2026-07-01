import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Booth web app. `global` is defined for libraries that still expect a Node
// global object (parts of the Stellar SDK's dependency tree).
export default defineConfig({
  plugins: [react()],
  define: {
    global: 'globalThis',
  },
  build: {
    target: 'es2022',
    // The lazily-loaded Stellar SDK chunk is ~840 kB minified by nature.
    chunkSizeWarningLimit: 900,
  },
});

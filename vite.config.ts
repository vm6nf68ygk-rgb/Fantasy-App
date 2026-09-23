import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: { exclude: ['@electric-sql/pglite'] },
  build: {
    target: 'es2022',
    // The demo database is large but only loads in demo mode.
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      onwarn(warning, warn) {
        // The demo database library uses eval internally; nothing to fix on our side.
        if (warning.code === 'EVAL') return;
        warn(warning);
      },
    },
  },
});

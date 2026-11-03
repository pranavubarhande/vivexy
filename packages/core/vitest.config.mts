import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './vitest.setup.ts',
    passWithNoTests: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@vivexy/core': path.resolve(__dirname, './src'),
      '@vivexy/ui': path.resolve(__dirname, '../ui/src'),
    },
    // Follow package.json exports for workspace packages
    conditions: ['development', 'browser', 'module', 'require', 'default'],
  },
});

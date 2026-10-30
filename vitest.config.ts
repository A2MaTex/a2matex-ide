import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
      '@app': path.resolve(import.meta.dirname, './src/app'),
      '@domain': path.resolve(import.meta.dirname, './src/domain'),
      '@application': path.resolve(import.meta.dirname, './src/application'),
      '@infrastructure': path.resolve(import.meta.dirname, './src/infrastructure'),
      '@presentation': path.resolve(import.meta.dirname, './src/presentation'),
      '@shared': path.resolve(import.meta.dirname, './src/shared'),
      '@electron': path.resolve(import.meta.dirname, './electron'),
      '@tests': path.resolve(import.meta.dirname, './tests'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: [
      'tests/unit/**/*.test.ts',
      'tests/contract/**/*.test.ts',
      'tests/integration/**/*.test.ts',
      'tests/component/**/*.test.tsx',
    ],
    coverage: {
      reporter: ['text', 'html'],
    },
  },
});

import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
      '@app': path.resolve(import.meta.dirname, './src/app'),
      '@domain': path.resolve(import.meta.dirname, './src/domain'),
      '@application': path.resolve(import.meta.dirname, './src/application'),
      '@infrastructure': path.resolve(import.meta.dirname, './src/infrastructure'),
      '@presentation': path.resolve(import.meta.dirname, './src/presentation'),
      '@shared': path.resolve(import.meta.dirname, './src/shared'),
    },
  },
});

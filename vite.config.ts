import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: process.env.BASE_PATH
    ? process.env.BASE_PATH.endsWith('/')
      ? process.env.BASE_PATH
      : `${process.env.BASE_PATH}/`
    : './',
  plugins: [react()],
  publicDir: 'assets',
  build: { outDir: 'dist/client', emptyOutDir: true },
});

/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    css: true,
    // No .env file is committed (backend/frontend convention — see
    // .env.example); tests need *a* value for the required env var so
    // src/config/env.ts's fail-fast check doesn't fire in every test run.
    env: {
      VITE_API_URL: 'http://localhost:3000',
    },
  },
});

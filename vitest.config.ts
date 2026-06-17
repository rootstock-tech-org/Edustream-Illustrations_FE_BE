import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    globals: true,
    // Pure domain/worker tests run in Node (fast, no DOM) — the default below.
    // UI/state tests opt into jsdom with a `// @vitest-environment jsdom`
    // directive at the top of the file.
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // The domain layer is pure and correctness-critical — hold it to a high bar.
      thresholds: {
        'src/domain/**': {
          statements: 90,
          branches: 85,
          functions: 90,
          lines: 90,
        },
      },
    },
  },
});

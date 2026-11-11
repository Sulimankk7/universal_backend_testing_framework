import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'tests/unit/**/*.test.js',
      'tests/integration/reporter.integration.test.js',
    ],
    reporters: [
      'default',
      './src/adapters/vitest/vitest-reporter.js',
    ],
  },
});

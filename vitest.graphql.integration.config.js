import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/integration/graphql-adapter.integration.test.js'],
    reporters: ['default', './src/adapters/vitest/vitest-reporter.js'],
    testTimeout: 15_000,
  },
});

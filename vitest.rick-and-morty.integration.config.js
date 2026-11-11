import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/integration/rick-and-morty-graphql.integration.test.js'],
    reporters: ['default', './src/adapters/vitest/vitest-reporter.js'],
    testTimeout: 30_000,
  },
});

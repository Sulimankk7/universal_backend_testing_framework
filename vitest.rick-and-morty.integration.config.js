import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/integration/rick-and-morty-graphql.integration.test.js'],
    reporters: ['default'],
    testTimeout: 30_000,
  },
});

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/integration/graphql-adapter.integration.test.js'],
    reporters: ['default'],
    testTimeout: 15_000,
  },
});

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/integration/shared-table-rest.integration.test.js'],
    reporters: ['default'],
    testTimeout: 45_000,
  },
});

import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../..', import.meta.url));
const reporterPath = fileURLToPath(new URL('../../src/adapters/vitest/vitest-reporter.js', import.meta.url));

export default defineConfig({
  root: projectRoot,
  test: {
    include: ['tests/integration/shared-table-rest.integration.test.js'],
    reporters: ['default', reporterPath],
    testTimeout: 45_000,
  },
});

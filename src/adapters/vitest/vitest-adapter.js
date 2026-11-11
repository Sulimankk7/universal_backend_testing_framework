
import { randomUUID } from 'node:crypto';

import { TestResultSchema } from '../../core/contracts/test-result.schema.js';

/**
 * Converts a Vitest TestCase into the normalized framework result contract.
 *
 * @param {object} testCase
 * @param {{ testType?: string }} options
 * @returns {import('../../core/contracts/test-result.schema.js').TestResult}
 */
export function mapVitestTestCase(
  testCase,
  { testType = 'unit' } = {},
) {
  const result = testCase.result();
  const diagnostic = testCase.diagnostic();

  const errors = (result.errors ?? []).map((error) => ({
    name: error.name ?? 'Error',
    message: error.message ?? 'Unknown error',
    ...(error.stack ? { stack: error.stack } : {}),
    ...(Array.isArray(error.errors)
      ? { causes: error.errors.map((cause) => ({ name: cause.name ?? 'Error', message: cause.message ?? String(cause) })) }
      : {}),
  }));

  const status =
    testCase.options.mode === 'todo'
      ? 'todo'
      : result.state;

  const normalizedResult = {
    id: randomUUID(),
    name: testCase.name,
    fullName: testCase.fullName,
    file: testCase.module.moduleId,
    testType,
    source: 'vitest',
    status,
    durationMs: diagnostic?.duration ?? 0,
    errors,
  };

  return TestResultSchema.parse(normalizedResult);
}

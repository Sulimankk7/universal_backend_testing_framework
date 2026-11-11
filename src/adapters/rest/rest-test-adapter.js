import { randomUUID } from 'node:crypto';
import { TestResultSchema } from '../../core/contracts/test-result.schema.js';

/**
 * Create an adapter that records REST test callback outcomes in a supplied
 * ResultCollector. Use either this adapter or the Vitest reporter for each
 * logical test; do not collect the same test through both paths.
 *
 * @param {{ collector: ResultCollectorLike, testType?: string }} config Adapter configuration.
 * @returns {{ run: (testCase: RestTestCase) => Promise<import('../../core/contracts/test-result.schema.js').TestResult> }}
 */
export function createRestTestAdapter({ collector, testType = 'integration' } = {}) {
  if (!collector || typeof collector.collect !== 'function') {
    throw new TypeError('A ResultCollector with a collect(result) method is required.');
  }

  return Object.freeze({
    /**
     * Execute one asynchronous REST test callback, normalize its outcome, and
     * collect exactly one result.
     *
     * @param {RestTestCase} testCase REST test definition.
     * @returns {Promise<import('../../core/contracts/test-result.schema.js').TestResult>} Normalized result.
     */
    async run({ name, id, fullName, file, testType: caseTestType, callback } = {}) {
      if (typeof name !== 'string' || name.trim() === '') {
        throw new TypeError('REST test name must be a non-empty string.');
      }
      if (typeof callback !== 'function') {
        throw new TypeError('REST test callback must be a function.');
      }

      const startedAt = performance.now();
      let status = 'passed';
      let errors = [];
      try {
        await callback();
      } catch (error) {
        status = 'failed';
        errors = [normalizeError(error)];
      }

      const durationMs = Math.max(0, performance.now() - startedAt);
      const normalizedResult = TestResultSchema.parse({
        id: id ?? randomUUID(),
        name,
        fullName: fullName ?? name,
        file: file ?? '<rest>',
        testType: caseTestType ?? testType,
        source: 'rest',
        status,
        durationMs,
        errors,
      });

      try {
        collector.collect(normalizedResult);
      } catch (cause) {
        const reason = cause instanceof Error ? cause.message : String(cause);
        const collectionError = new Error(`Failed to collect REST test result "${name}": ${reason}`);
        collectionError.cause = cause;
        throw collectionError;
      }

      return normalizedResult;
    },
  });
}

function normalizeError(error) {
  const name = typeof error?.name === 'string' && error.name.length > 0
    ? error.name
    : 'Error';
  const message = typeof error?.message === 'string' && error.message.length > 0
    ? error.message
    : stringifyError(error);
  const stack = typeof error?.stack === 'string' && error.stack.length > 0
    ? error.stack
    : undefined;

  return {
    name,
    message: message || 'Unknown error',
    ...(stack ? { stack } : {}),
  };
}

function stringifyError(error) {
  try {
    return String(error);
  } catch {
    return 'Unknown error';
  }
}

/** @typedef {{ collect: (result: import('../../core/contracts/test-result.schema.js').TestResult) => unknown }} ResultCollectorLike */
/** @typedef {{ name: string, callback: () => unknown|Promise<unknown>, id?: string, fullName?: string, file?: string, testType?: string }} RestTestCase */

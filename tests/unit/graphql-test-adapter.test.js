import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ResultCollector from '../../src/core/collection/result-collector.js';
import { TestResultSchema } from '../../src/core/contracts/test-result.schema.js';
import { assertDataValue } from '../../src/adapters/graphql/assertions/graphql-assertions.js';
import { createGraphQLTestAdapter } from '../../src/adapters/graphql/graphql-test-adapter.js';

afterEach(() => vi.restoreAllMocks());

function createCollector() {
  return { collect: vi.fn() };
}

describe('createGraphQLTestAdapter', () => {
  it('records a successful callback as one normalized GraphQL result', async () => {
    const collector = createCollector();
    const adapter = createGraphQLTestAdapter({ collector });
    const callback = vi.fn(async () => {});

    const result = await adapter.run({
      name: 'returns GraphQL data',
      id: 'graphql-case-1',
      file: 'tests/graphql/users.test.js',
      callback,
    });

    expect(callback).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      id: 'graphql-case-1',
      name: 'returns GraphQL data',
      fullName: 'returns GraphQL data',
      file: 'tests/graphql/users.test.js',
      testType: 'integration',
      source: 'graphql',
      status: 'passed',
      errors: [],
    });
    expect(collector.collect).toHaveBeenCalledOnce();
    expect(collector.collect).toHaveBeenCalledWith(result);
  });

  it('captures GraphQL assertion failures with their details', async () => {
    const collector = createCollector();
    const adapter = createGraphQLTestAdapter({ collector });

    const result = await adapter.run({
      name: 'rejects unexpected GraphQL data',
      callback: async () => assertDataValue({ data: { user: { id: 'u1' } } }, 'user.id', 'u2'),
    });

    expect(result.status).toBe('failed');
    expect(result.errors[0]).toMatchObject({
      name: 'AssertionError',
      message: expect.stringContaining('expected "u1" to be "u2"'),
    });
    expect(result.errors[0].stack).toContain('AssertionError');
  });

  it('captures network errors as failed results', async () => {
    const collector = createCollector();
    const adapter = createGraphQLTestAdapter({ collector });
    const networkError = new TypeError('Network unavailable');

    const result = await adapter.run({
      name: 'handles a network failure',
      callback: async () => { throw networkError; },
    });

    expect(result.status).toBe('failed');
    expect(result.errors[0]).toMatchObject({
      name: 'TypeError',
      message: 'Network unavailable',
      stack: networkError.stack,
    });
  });

  it('captures unexpected runtime errors without losing their names or messages', async () => {
    const collector = createCollector();
    const adapter = createGraphQLTestAdapter({ collector });

    const result = await adapter.run({
      name: 'handles a runtime error',
      callback: async () => { throw new RangeError('Unexpected value'); },
    });

    expect(result.status).toBe('failed');
    expect(result.errors[0].name).toBe('RangeError');
    expect(result.errors[0].message).toBe('Unexpected value');
  });

  it('measures callback duration in milliseconds', async () => {
    const collector = createCollector();
    const adapter = createGraphQLTestAdapter({ collector });
    const now = vi.spyOn(performance, 'now')
      .mockReturnValueOnce(15)
      .mockReturnValueOnce(42);

    const result = await adapter.run({ name: 'measures duration', callback: async () => {} });

    expect(now).toHaveBeenCalledTimes(2);
    expect(result.durationMs).toBe(27);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('produces schema-valid results and works with the existing ResultCollector', async () => {
    const collector = new ResultCollector();
    const adapter = createGraphQLTestAdapter({ collector });

    const passed = await adapter.run({ name: 'valid success', callback: async () => {} });
    const failed = await adapter.run({
      name: 'valid assertion failure',
      callback: async () => assertDataValue({ data: { id: 1 } }, 'id', 2),
    });

    expect(TestResultSchema.safeParse(passed).success).toBe(true);
    expect(TestResultSchema.safeParse(failed).success).toBe(true);
    expect(collector.getResults()).toHaveLength(2);
    expect(collector.getResults()[1].failureAnalysis[0].category).toBe('assertion_failure');
  });

  it('collects each passed or failed test exactly once', async () => {
    const collector = createCollector();
    const adapter = createGraphQLTestAdapter({ collector });

    await adapter.run({ name: 'passed case', callback: async () => {} });
    await adapter.run({ name: 'failed case', callback: async () => { throw new Error('failed'); } });

    expect(collector.collect).toHaveBeenCalledTimes(2);
    expect(collector.collect.mock.calls.map(([result]) => result.status)).toEqual(['passed', 'failed']);
  });

  it('does not import or require Vitest in the GraphQL test adapter', () => {
    const source = readFileSync(
      new URL('../../src/adapters/graphql/graphql-test-adapter.js', import.meta.url),
      'utf8',
    );

    expect(source).not.toMatch(/from\s+['"]vitest['"]|require\(['"]vitest['"]\)/);
  });
});

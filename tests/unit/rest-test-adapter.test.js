import { afterEach, describe, expect, it, vi } from 'vitest';
import ResultCollector from '../../src/core/collection/result-collector.js';
import { TestResultSchema } from '../../src/core/contracts/test-result.schema.js';
import { assertOk, assertStatus } from '../../src/adapters/rest/assertions/response-assertions.js';
import { createRestTestAdapter } from '../../src/adapters/rest/rest-test-adapter.js';

afterEach(() => vi.restoreAllMocks());

function createCollector() {
  return { collect: vi.fn() };
}

describe('createRestTestAdapter', () => {
  it('records a successful callback as one normalized REST result', async () => {
    const collector = createCollector();
    const adapter = createRestTestAdapter({ collector });
    const callback = vi.fn(async () => {
      const response = { status: 200, ok: true };
      assertStatus(response, 200);
      assertOk(response);
    });

    const result = await adapter.run({
      name: 'returns a successful response',
      id: 'rest-case-1',
      file: 'tests/rest/users.test.js',
      callback,
    });

    expect(callback).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      id: 'rest-case-1',
      name: 'returns a successful response',
      fullName: 'returns a successful response',
      file: 'tests/rest/users.test.js',
      testType: 'integration',
      source: 'rest',
      status: 'passed',
      errors: [],
    });
    expect(result.durationMs).toEqual(expect.any(Number));
    expect(collector.collect).toHaveBeenCalledOnce();
    expect(collector.collect).toHaveBeenCalledWith(result);
  });

  it('captures AssertionError failures and preserves their details', async () => {
    const collector = createCollector();
    const adapter = createRestTestAdapter({ collector });

    const result = await adapter.run({
      name: 'rejects an unexpected status',
      callback: async () => assertStatus({ status: 404 }, 200),
    });

    expect(result.status).toBe('failed');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].name).toBe('AssertionError');
    expect(result.errors[0].message).toContain('expected 404 to be 200');
    expect(result.errors[0].stack).toContain('AssertionError');
  });

  it('captures network failures as failed results', async () => {
    const collector = createCollector();
    const adapter = createRestTestAdapter({ collector });
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
    const adapter = createRestTestAdapter({ collector });

    const result = await adapter.run({
      name: 'handles an unexpected runtime error',
      callback: async () => { throw new RangeError('Unexpected value'); },
    });

    expect(result.status).toBe('failed');
    expect(result.errors[0].name).toBe('RangeError');
    expect(result.errors[0].message).toBe('Unexpected value');
  });

  it('measures the complete callback duration in milliseconds', async () => {
    const collector = createCollector();
    const adapter = createRestTestAdapter({ collector });
    const now = vi.spyOn(performance, 'now')
      .mockReturnValueOnce(15)
      .mockReturnValueOnce(42);

    const result = await adapter.run({ name: 'measures duration', callback: async () => {} });

    expect(now).toHaveBeenCalledTimes(2);
    expect(result.durationMs).toBe(27);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('collects each passed or failed logical test exactly once', async () => {
    const collector = createCollector();
    const adapter = createRestTestAdapter({ collector });

    const passed = await adapter.run({ name: 'passed case', callback: async () => {} });
    const failed = await adapter.run({
      name: 'failed case',
      callback: async () => { throw new Error('request failed'); },
    });

    expect(collector.collect).toHaveBeenCalledTimes(2);
    expect(collector.collect.mock.calls.map(([result]) => result.status)).toEqual(['passed', 'failed']);
    expect(collector.collect).toHaveBeenNthCalledWith(1, passed);
    expect(collector.collect).toHaveBeenNthCalledWith(2, failed);
  });

  it('submits schema-valid results to the existing ResultCollector', async () => {
    const collector = new ResultCollector();
    const adapter = createRestTestAdapter({ collector });

    const passed = await adapter.run({ name: 'passes schema validation', callback: async () => {} });
    const failed = await adapter.run({
      name: 'preserves an assertion failure',
      callback: async () => assertStatus({ status: 500 }, 200),
    });

    expect(TestResultSchema.safeParse(passed).success).toBe(true);
    expect(TestResultSchema.safeParse(failed).success).toBe(true);
    const collected = collector.getResults();
    expect(collected).toHaveLength(2);
    expect(collected.map(({ status }) => status)).toEqual(['passed', 'failed']);
    expect(collected[1].errors[0].name).toBe('AssertionError');
  });

  it('surfaces ResultCollector failures with the test name and original cause', async () => {
    const collectionFailure = new Error('schema rejected result');
    const collector = { collect: vi.fn(() => { throw collectionFailure; }) };
    const adapter = createRestTestAdapter({ collector });

    await expect(adapter.run({ name: 'invalid collection', callback: async () => {} }))
      .rejects.toMatchObject({
        message: 'Failed to collect REST test result "invalid collection": schema rejected result',
        cause: collectionFailure,
      });
    expect(collector.collect).toHaveBeenCalledOnce();
  });
});

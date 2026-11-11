
import { describe, it, expect } from 'vitest';

import ResultCollector from '../../src/core/collection/result-collector.js';

function createResult({
  name = 'test example',
  state = 'passed',
  mode = 'run',
  errors,
  duration = 5,
  testType = 'unit',
} = {}) {
  return { id: `${name}-${state}`, name, fullName: `Example > ${name}`, file: 'example.test.js', testType, source: 'test-source', status: mode === 'todo' ? 'todo' : state, durationMs: duration, errors: errors ?? [] };
}

describe('ResultCollector', () => {
  it('should collect a successful test result', () => {
    const collector = new ResultCollector();

    const result = collector.collect(
      createResult({
        name: 'should return users',
      }),
    );

    expect(result.name).toBe('should return users');
    expect(result.status).toBe('passed');
    expect(result.id).toBeTypeOf('string');
    expect(result.errors).toEqual([]);
    expect(result.failureAnalysis).toEqual([]);
  });

  it('should collect and analyze a failed test result', () => {
    const collector = new ResultCollector();

    const result = collector.collect(
      createResult({
        name: 'should handle invalid data',
        state: 'failed',
        errors: [
          {
            name: 'RangeError',
            message: 'Invalid array length',
          },
        ],
      }),
    );

    expect(result.status).toBe('failed');

    expect(result.failureAnalysis).toHaveLength(1);

    expect(result.failureAnalysis[0].category).toBe(
      'range_error',
    );

    expect(result.failureAnalysis[0].confidence).toBe('medium');
  });

  it('should analyze all errors in a failed test', () => {
    const collector = new ResultCollector();

    const result = collector.collect(
      createResult({
        state: 'failed',
        errors: [
          {
            name: 'TypeError',
            message:
              "Cannot read properties of undefined (reading 'name')",
          },
          {
            name: 'ReferenceError',
            message: 'userName is not defined',
          },
        ],
      }),
    );

    expect(result.errors).toHaveLength(2);
    expect(result.failureAnalysis).toHaveLength(2);

    expect(result.failureAnalysis[0].category).toBe(
      'property_access_error',
    );

    expect(result.failureAnalysis[1].category).toBe(
      'reference_error',
    );
  });

  it('should store collected results', () => {
    const collector = new ResultCollector();

    collector.collect(createResult());

    expect(collector.getResults()).toHaveLength(1);
  });

  it('should collect multiple normalized results', () => {
    const collector = new ResultCollector();
    collector.collect(createResult({ name: 'first' }));
    collector.collect(createResult({ name: 'second' }));

    expect(collector.getResults().map((result) => result.name)).toEqual(['first', 'second']);
  });

  it('should reset collected results', () => {
    const collector = new ResultCollector();

    collector.collect(createResult());

    collector.reset();

    expect(collector.getResults()).toHaveLength(0);
  });

  it('should not allow external modification of the results array', () => {
    const collector = new ResultCollector();

    collector.collect(createResult());

    const results = collector.getResults();

    results.push({
      name: 'fake test',
    });

    expect(collector.getResults()).toHaveLength(1);
  });

  it('should keep previous results unchanged after reset', () => {
    const collector = new ResultCollector();

    collector.collect(createResult());

    const previousResults = collector.getResults();

    collector.reset();

    expect(collector.getResults()).toHaveLength(0);
    expect(previousResults).toHaveLength(1);
    expect(previousResults[0].name).toBe('test example');
  });

  it('should reject invalid test results', () => {
    const collector = new ResultCollector();

    const invalidResult = createResult({
      name: '',
    });

    expect(() => collector.collect(invalidResult)).toThrow();

    expect(collector.getResults()).toHaveLength(0);
  });

  it('should support custom test types', () => {
    const collector = new ResultCollector();

    const result = collector.collect(createResult({ testType: 'integration' }));

    expect(result.testType).toBe('integration');
  });
});

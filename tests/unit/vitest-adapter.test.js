
import { describe, it, expect } from 'vitest';

import { mapVitestTestCase } from '../../src/adapters/vitest/vitest-adapter.js';

function createFakeTestCase({
  name = 'should execute a test',
  fullName = 'TestSuite > should execute a test',
  state = 'passed',
  mode = 'run',
  errors,
  duration = 10,
} = {}) {
  return {
    name,
    fullName,

    module: {
      moduleId: 'tests/example.test.js',
    },

    options: {
      mode,
    },

    result: () => ({
      state,
      errors,
    }),

    diagnostic: () => ({
      duration,
    }),
  };
}

describe('mapVitestTestCase', () => {
  it('should convert a passed Vitest test', () => {
    const result = mapVitestTestCase(
      createFakeTestCase(),
    );

    expect(result.id).toBeTypeOf('string');
    expect(result.id.length).toBeGreaterThan(0);

    expect(result.name).toBe('should execute a test');
    expect(result.status).toBe('passed');
    expect(result.errors).toEqual([]);
    expect(result.source).toBe('vitest');
    expect(result.testType).toBe('unit');
  });

  it('should convert a failed Vitest test', () => {
    const result = mapVitestTestCase(
      createFakeTestCase({
        state: 'failed',
        errors: [
          {
            name: 'AssertionError',
            message: 'Expected true to be false',
            stack: 'Error stack',
          },
        ],
      }),
    );

    expect(result.status).toBe('failed');

    expect(result.errors).toEqual([
      {
        name: 'AssertionError',
        message: 'Expected true to be false',
        stack: 'Error stack',
      },
    ]);
  });

  it('should convert a todo test correctly', () => {
    const result = mapVitestTestCase(
      createFakeTestCase({
        state: 'skipped',
        mode: 'todo',
        duration: 0,
      }),
    );

    expect(result.status).toBe('todo');
    expect(result.durationMs).toBe(0);
    expect(result.errors).toEqual([]);
  });

  it('should convert a skipped Vitest test', () => {
    const result = mapVitestTestCase(
      createFakeTestCase({
        state: 'skipped',
        mode: 'skip',
        duration: 0,
      }),
    );

    expect(result.status).toBe('skipped');
  });

  it('should support multiple errors', () => {
    const result = mapVitestTestCase(
      createFakeTestCase({
        state: 'failed',
        errors: [
          {
            name: 'TypeError',
            message: 'Invalid property access',
          },
          {
            name: 'ReferenceError',
            message: 'userName is not defined',
          },
        ],
      }),
    );

    expect(result.errors).toHaveLength(2);
    expect(result.errors[0].name).toBe('TypeError');
    expect(result.errors[1].name).toBe('ReferenceError');
  });

  it('should allow a custom test type', () => {
    const result = mapVitestTestCase(
      createFakeTestCase(),
      {
        testType: 'integration',
      },
    );

    expect(result.testType).toBe('integration');
    expect(result.source).toBe('vitest');
  });

  it('should generate unique ids for different results', () => {
    const firstResult = mapVitestTestCase(
      createFakeTestCase(),
    );

    const secondResult = mapVitestTestCase(
      createFakeTestCase(),
    );

    expect(firstResult.id).not.toBe(secondResult.id);
  });
});

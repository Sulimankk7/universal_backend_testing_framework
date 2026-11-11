
import { describe, it, expect } from 'vitest';

import {
  TestResultSchema,
  TestErrorSchema,
} from '../../src/core/contracts/test-result.schema.js';

describe('TestResultSchema', () => {
  const validResult = {
    id: 'test-123',
    name: 'should create a user',
    fullName: 'UserService > should create a user',
    file: 'tests/user.test.js',
    testType: 'unit',
    source: 'vitest',
    status: 'passed',
    durationMs: 12,
    errors: [],
  };

  it('should accept a valid test result', () => {
    const validation = TestResultSchema.safeParse(validResult);

    expect(validation.success).toBe(true);
  });

  it('should accept different test types and sources', () => {
    const result = {
      ...validResult,
      testType: 'graphql',
      source: 'custom-runner',
    };

    const validation = TestResultSchema.safeParse(result);

    expect(validation.success).toBe(true);
  });

  it('should reject a missing id', () => {
    const { id, ...result } = validResult;

    const validation = TestResultSchema.safeParse(result);

    expect(validation.success).toBe(false);
  });

  it('should reject an invalid test status', () => {
    const result = {
      ...validResult,
      status: 'unknown',
    };

    const validation = TestResultSchema.safeParse(result);

    expect(validation.success).toBe(false);
  });

  it('should reject a negative duration', () => {
    const result = {
      ...validResult,
      durationMs: -5,
    };

    const validation = TestResultSchema.safeParse(result);

    expect(validation.success).toBe(false);
  });

  it('should reject unexpected properties', () => {
    const result = {
      ...validResult,
      extraField: 'unexpected',
    };

    const validation = TestResultSchema.safeParse(result);

    expect(validation.success).toBe(false);
  });

  it('should accept multiple errors', () => {
    const result = {
      ...validResult,
      status: 'failed',
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
    };

    const validation = TestResultSchema.safeParse(result);

    expect(validation.success).toBe(true);
    expect(validation.data.errors).toHaveLength(2);
  });

  it('should reject an invalid error object', () => {
    const result = {
      ...validResult,
      errors: [
        {
          name: 'TypeError',
          message: '',
        },
      ],
    };

    const validation = TestResultSchema.safeParse(result);

    expect(validation.success).toBe(false);
  });

  it('should accept normalized aggregate error causes', () => {
    const result = {
      ...validResult,
      status: 'failed',
      errors: [{ name: 'AggregateError', message: 'Multiple failures', causes: [{ name: 'Error', message: 'First failure' }] }],
    };

    expect(TestResultSchema.safeParse(result).success).toBe(true);
  });
});

describe('TestErrorSchema', () => {
  it('should accept a valid error', () => {
    const error = {
      name: 'TypeError',
      message: 'Cannot read properties of undefined',
      stack: 'Error stack',
    };

    expect(TestErrorSchema.safeParse(error).success).toBe(true);
  });

  it('should reject unexpected error properties', () => {
    const error = {
      name: 'TypeError',
      message: 'Something went wrong',
      code: 500,
    };

    expect(TestErrorSchema.safeParse(error).success).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';

import { analyzeFailure } from '../../src/core/analysis/failure-analyzer.js';

describe('analyzeFailure', () => {
  it('should identify an assertion failure', () => {
    const error = {
      name: 'AssertionError',
      message: 'expected 2 to be 3 // Object.is equality',
    };

    const result = analyzeFailure(error);

    expect(result.category).toBe('assertion_failure');

    expect(result.evidence).toEqual({
      actual: '2',
      expected: '3',
    });

    expect(result.confidence).toBe('medium');
  });

  it('should return unknown for an unrecognized error', () => {
    const error = {
      name: 'TypeError',
      message: 'Cannot read properties of undefined',
    };

    const result = analyzeFailure(error);

    expect(result.category).toBe('unknown');

    expect(result.evidence.originalMessage).toBe(
      'Cannot read properties of undefined'
    );

    expect(result.confidence).toBe('low');
  });

  it('should reject an invalid error object', () => {
    expect(() => analyzeFailure(null)).toThrow(
      'A valid error object is required.'
    );
  });

  it('should not classify a non-assertion error as assertion failure', () => {
    const error = {
      name: 'TypeError',
      message: 'expected 2 to be 3',
    };

    const result = analyzeFailure(error);

    expect(result.category).toBe('unknown');
  });

  
it('should identify property access on undefined', () => {
  const error = {
    name: 'TypeError',
    message:
      "Cannot read properties of undefined (reading 'name')",
  };

  const result = analyzeFailure(error);

  expect(result.category).toBe('property_access_error');

  expect(result.evidence).toEqual({
    targetValue: 'undefined',
    property: 'name',
  });

  expect(result.confidence).toBe('medium');
});

it('should identify property access on null', () => {
  const error = {
    name: 'TypeError',
    message:
      "Cannot read properties of null (reading 'email')",
  };

  const result = analyzeFailure(error);

  expect(result.category).toBe('property_access_error');

  expect(result.evidence).toEqual({
    targetValue: 'null',
    property: 'email',
  });
});

it('should identify a range error', () => {
  const error = {
    name: 'RangeError',
    message: 'Invalid array length',
  };

  const result = analyzeFailure(error);

  expect(result.category).toBe('range_error');

  expect(result.evidence).toEqual({
    originalMessage: 'Invalid array length',
  });

  expect(result.confidence).toBe('medium');
});

it('should identify a syntax error', () => {
  const error = {
    name: 'SyntaxError',
    message: 'Unexpected token',
  };

  const result = analyzeFailure(error);

  expect(result.category).toBe('syntax_error');

  expect(result.evidence).toEqual({
    originalMessage: 'Unexpected token',
  });

  expect(result.confidence).toBe('medium');
});

it('should identify an aggregate error', () => {
  const error = {
    name: 'AggregateError',
    message: 'All promises were rejected',
    causes: [
      {
        name: 'Error',
        message: 'First request failed',
      },
      {
        name: 'Error',
        message: 'Second request failed',
      },
    ],
  };

  const result = analyzeFailure(error);

  expect(result.category).toBe('aggregate_error');

  expect(result.evidence).toEqual({
    originalMessage: 'All promises were rejected',
    errors: [
      'First request failed',
      'Second request failed',
    ],
  });

  expect(result.confidence).toBe('medium');
});

it('should handle an aggregate error without inner errors', () => {
  const error = {
    name: 'AggregateError',
    message: 'Multiple operations failed',
  };

  const result = analyzeFailure(error);

  expect(result.category).toBe('aggregate_error');

  expect(result.evidence).toEqual({
    originalMessage: 'Multiple operations failed',
    errors: [],
  });
});

});

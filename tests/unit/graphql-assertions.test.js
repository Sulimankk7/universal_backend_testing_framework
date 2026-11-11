import { describe, expect, it } from 'vitest';
import { analyzeFailure } from '../../src/core/analysis/failure-analyzer.js';
import { assertStatus } from '../../src/adapters/rest/assertions/response-assertions.js';
import {
  assertDataProperty,
  assertDataValue,
  assertGraphQLErrorMessage,
  assertGraphQLErrors,
  assertHttpOk,
  assertHttpStatus,
  assertNoGraphQLErrors,
} from '../../src/adapters/graphql/assertions/graphql-assertions.js';

function createResponse(overrides = {}) {
  return {
    status: 200,
    statusText: 'OK',
    ok: true,
    headers: { 'content-type': 'application/json' },
    body: {},
    bodyParsed: true,
    bodyParseError: null,
    responseTimeMs: 1,
    ...overrides,
  };
}

function expectAssertionError(assertion, ...messageParts) {
  try {
    assertion();
  } catch (error) {
    expect(error.name).toBe('AssertionError');
    expect(error.stack).toContain('AssertionError');
    for (const part of messageParts) expect(error.message).toContain(part);
    return error;
  }
  throw new Error('Expected the assertion to throw an AssertionError.');
}

describe('GraphQL response assertions', () => {
  it('asserts exact HTTP status and reports actual and expected values', () => {
    expect(() => assertHttpStatus(createResponse(), 200)).not.toThrow();
    expectAssertionError(
      () => assertHttpStatus(createResponse({ status: 404 }), 200),
      'assertHttpStatus', '404', '200',
    );
  });

  it('asserts HTTP success independently of GraphQL errors', () => {
    expect(() => assertHttpOk(createResponse({ errors: [{ message: 'Resolver error' }] }))).not.toThrow();
    expectAssertionError(
      () => assertHttpOk(createResponse({ status: 500, statusText: 'Internal Server Error', ok: false })),
      'assertHttpOk', '500', 'HTTP success',
    );
  });

  it('asserts existing nested data properties', () => {
    const response = createResponse({ data: { user: { profile: { name: 'Ada' } } } });

    expect(() => assertDataProperty(response, 'user.profile.name')).not.toThrow();
    expect(() => assertDataValue(response, 'user.profile.name', 'Ada')).not.toThrow();
    expectAssertionError(
      () => assertDataProperty(response, 'user.profile.email'),
      'assertDataProperty', 'missing data property', 'user.profile.email',
    );
  });

  it('compares data values exactly and reports mismatches', () => {
    const response = createResponse({ data: { user: { id: 'u1', roles: ['admin'] } } });

    expect(() => assertDataValue(response, 'user.roles', ['admin'])).not.toThrow();
    expectAssertionError(
      () => assertDataValue(response, 'user.id', 'u2'),
      'assertDataValue', 'u1', 'u2',
    );
  });

  it('handles missing data and existing undefined-valued properties safely', () => {
    const missingData = createResponse();
    expectAssertionError(() => assertDataProperty(missingData, 'user.id'), 'assertDataProperty', 'missing');
    expectAssertionError(() => assertDataValue(missingData, 'user.id', 'u1'), 'assertDataValue', 'missing');

    const undefinedData = createResponse({ data: { present: undefined } });
    expect(() => assertDataProperty(undefinedData, 'present')).not.toThrow();
    expect(() => assertDataValue(undefinedData, 'present', undefined)).not.toThrow();
  });

  it('treats missing GraphQL errors and an empty errors array as no errors', () => {
    expect(() => assertNoGraphQLErrors(createResponse())).not.toThrow();
    expect(() => assertNoGraphQLErrors(createResponse({ errors: [] }))).not.toThrow();
    expectAssertionError(
      () => assertGraphQLErrors(createResponse({ errors: [] })),
      'assertGraphQLErrors', 'one or more GraphQL errors',
    );
  });

  it('asserts GraphQL errors without confusing them with HTTP status', () => {
    const partialResponse = createResponse({
      status: 200,
      ok: true,
      data: { user: { id: 'u1' } },
      errors: [{ message: 'A field resolver failed' }],
    });

    expect(() => assertGraphQLErrors(partialResponse)).not.toThrow();
    expect(() => assertNoGraphQLErrors(partialResponse)).toThrow(/assertNoGraphQLErrors/);
    expect(() => assertDataValue(partialResponse, 'user.id', 'u1')).not.toThrow();
  });

  it('asserts that at least one GraphQL error contains the expected message', () => {
    const response = createResponse({
      errors: [{ message: 'Permission denied for this field' }, { message: 'Another failure' }],
    });

    expect(() => assertGraphQLErrorMessage(response, 'Permission denied')).not.toThrow();
    expectAssertionError(
      () => assertGraphQLErrorMessage(response, 'Not found'),
      'assertGraphQLErrorMessage', 'Permission denied', 'Not found',
    );
  });

  it('fails the GraphQL error message assertion when errors are missing', () => {
    expectAssertionError(
      () => assertGraphQLErrorMessage(createResponse(), 'Not found'),
      'assertGraphQLErrorMessage', 'Not found',
    );
  });

  it('produces FailureAnalyzer-compatible AssertionError messages', () => {
    const error = expectAssertionError(
      () => assertHttpStatus(createResponse({ status: 503 }), 200),
      'assertHttpStatus', '503', '200',
    );

    expect(analyzeFailure(error).category).toBe('assertion_failure');
  });

  it('keeps runtime errors unknown and REST assertion classification unchanged', () => {
    const runtimeError = new TypeError('expected 503 to be 200');
    expect(analyzeFailure(runtimeError).category).toBe('unknown');

    let restAssertionError;
    try {
      assertStatus({ status: 503 }, 200);
    } catch (error) {
      restAssertionError = error;
    }

    expect(restAssertionError).toBeInstanceOf(Error);
    expect(analyzeFailure(restAssertionError).category).toBe('assertion_failure');
  });
});

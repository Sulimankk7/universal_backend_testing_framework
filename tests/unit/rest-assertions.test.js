import { describe, expect, it } from 'vitest';
import {
  assertBodyContains,
  assertBodyProperty,
  assertBodyValue,
  assertHeaderExists,
  assertHeaderValue,
  assertNotOk,
  assertOk,
  assertStatus,
  assertValidJSON,
} from '../../src/adapters/rest/assertions/response-assertions.js';

function createResponse(overrides = {}) {
  return {
    status: 200,
    statusText: 'OK',
    ok: true,
    headers: {},
    body: null,
    bodyParsed: false,
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
    return;
  }
  throw new Error('Expected the assertion to throw an AssertionError.');
}

describe('REST response assertions', () => {
  it('asserts an exact status and reports expected and actual values on failure', () => {
    expect(() => assertStatus(createResponse(), 200)).not.toThrow();
    expectAssertionError(() => assertStatus(createResponse({ status: 404 }), 200), 'assertStatus', '404', '200');
  });

  it('asserts successful and unsuccessful responses', () => {
    expect(() => assertOk(createResponse())).not.toThrow();
    expectAssertionError(() => assertOk(createResponse({ ok: false })), 'assertOk', 'false', 'true');

    expect(() => assertNotOk(createResponse({ status: 404, ok: false }))).not.toThrow();
    expectAssertionError(() => assertNotOk(createResponse()), 'assertNotOk', 'true', 'false');
  });

  it('asserts exact body values, including nested values', () => {
    const response = createResponse({ body: { user: { name: 'Ada', roles: ['admin'] } } });
    expect(() => assertBodyValue(response, 'user.name', 'Ada')).not.toThrow();
    expect(() => assertBodyValue(response, 'user.roles', ['admin'])).not.toThrow();
    expectAssertionError(() => assertBodyValue(response, 'user.name', 'Grace'), 'assertBodyValue', 'Ada', 'Grace');
  });

  it('distinguishes a missing property from an existing undefined value', () => {
    const response = createResponse({ body: { present: undefined } });
    expect(() => assertBodyProperty(response, 'present')).not.toThrow();
    expect(() => assertBodyValue(response, 'present', undefined)).not.toThrow();
    expectAssertionError(() => assertBodyProperty(response, 'missing'), 'assertBodyProperty', 'missing');
    expectAssertionError(() => assertBodyValue(response, 'missing', undefined), 'assertBodyValue', 'missing');
  });

  it('asserts substring containment for string bodies', () => {
    const response = createResponse({ body: 'the service is ready' });
    expect(() => assertBodyContains(response, 'service')).not.toThrow();
    expectAssertionError(() => assertBodyContains(response, 'offline'), 'assertBodyContains', 'service', 'offline');
  });

  it('asserts deep-equal element containment for array bodies', () => {
    const response = createResponse({ body: [{ id: 1 }, { id: 2 }] });
    expect(() => assertBodyContains(response, { id: 2 })).not.toThrow();
    expectAssertionError(() => assertBodyContains(response, { id: 3 }), 'assertBodyContains', 'array', 'id');
  });

  it('rejects unsupported body types for containment', () => {
    expectAssertionError(() => assertBodyContains(createResponse({ body: { id: 1 } }), 1), 'assertBodyContains', 'object', 'string or array');
    expectAssertionError(() => assertBodyContains(createResponse({ body: null }), null), 'assertBodyContains', 'null', 'string or array');
  });

  it('asserts header presence and exact value with case-insensitive lookup', () => {
    const response = createResponse({ headers: { 'content-type': 'application/json', 'x-request-id': 'abc-123' } });
    expect(() => assertHeaderExists(response, 'X-Request-ID')).not.toThrow();
    expect(() => assertHeaderValue(response, 'CONTENT-TYPE', 'application/json')).not.toThrow();
    expectAssertionError(() => assertHeaderExists(response, 'x-missing'), 'assertHeaderExists', 'x-missing');
    expectAssertionError(() => assertHeaderValue(response, 'X-Request-ID', 'wrong'), 'assertHeaderValue', 'abc-123', 'wrong');
  });

  it.each([
    [{ id: 1 }],
    [[]],
    [[1, 'two']],
    [['text']],
    [[42]],
    [[true]],
    [[null]],
  ])('accepts a body marked as parsed JSON: %j', (body) => {
    expect(() => assertValidJSON(createResponse({ body, bodyParsed: true }))).not.toThrow();
  });

  it('uses bodyParsed without reparsing the body', () => {
    expect(() => assertValidJSON(createResponse({ body: 'already parsed upstream', bodyParsed: true }))).not.toThrow();
  });

  it('rejects empty and invalid JSON bodies with useful failures', () => {
    expectAssertionError(
      () => assertValidJSON(createResponse({ body: null, bodyParsed: false })),
      'assertValidJSON', 'empty body', 'valid JSON',
    );
    expectAssertionError(
      () => assertValidJSON(createResponse({
        body: '{invalid}',
        bodyParsed: false,
        bodyParseError: { name: 'SyntaxError', message: 'Unexpected token' },
      })),
      'assertValidJSON', 'invalid JSON', 'Unexpected token', 'valid JSON',
    );
  });
});

import { isDeepStrictEqual } from 'node:util';

/**
 * Assert that a normalized response has the exact HTTP status.
 * @param {NormalizedResponse} response Normalized REST response.
 * @param {number} expectedStatus Expected HTTP status code.
 */
export function assertStatus(response, expectedStatus) {
  if (response.status !== expectedStatus) {
    failAssertion('assertStatus', response.status, expectedStatus);
  }
}

/**
 * Assert that a normalized response represents a successful HTTP status.
 * @param {NormalizedResponse} response Normalized REST response.
 */
export function assertOk(response) {
  if (response.ok !== true) {
    failAssertion('assertOk', response.ok, true);
  }
}

/**
 * Assert that a normalized response represents an unsuccessful HTTP status.
 * @param {NormalizedResponse} response Normalized REST response.
 */
export function assertNotOk(response) {
  if (response.ok !== false) {
    failAssertion('assertNotOk', response.ok, false);
  }
}

/**
 * Assert that a value at a dot-separated body path exactly matches a value.
 *
 * @param {NormalizedResponse} response Normalized REST response.
 * @param {string} propertyPath Dot-separated property path.
 * @param {unknown} expectedValue Expected property value.
 */
export function assertBodyValue(response, propertyPath, expectedValue) {
  const result = getBodyProperty(response.body, propertyPath);
  if (!result.exists || !isDeepStrictEqual(result.value, expectedValue)) {
    failAssertion(
      'assertBodyValue',
      result.exists ? result.value : `missing property ${formatValue(propertyPath)}`,
      expectedValue,
    );
  }
}

/**
 * Assert that a dot-separated property exists on the response body.
 * @param {NormalizedResponse} response Normalized REST response.
 * @param {string} propertyPath Dot-separated property path.
 */
export function assertBodyProperty(response, propertyPath) {
  if (!getBodyProperty(response.body, propertyPath).exists) {
    failAssertion(
      'assertBodyProperty',
      `missing property ${formatValue(propertyPath)}`,
      `property ${formatValue(propertyPath)} to exist`,
    );
  }
}

/**
 * Assert that a string body contains a substring or an array contains an
 * element equal to the expected value.
 * @param {NormalizedResponse} response Normalized REST response.
 * @param {unknown} expectedValue Expected substring or array element.
 */
export function assertBodyContains(response, expectedValue) {
  const { body } = response;
  if (typeof body === 'string') {
    if (typeof expectedValue === 'string' && body.includes(expectedValue)) return;
    failAssertion('assertBodyContains', body, `string containing ${formatValue(expectedValue)}`);
  }
  if (Array.isArray(body)) {
    if (body.some((value) => isDeepStrictEqual(value, expectedValue))) return;
    failAssertion('assertBodyContains', body, `array containing ${formatValue(expectedValue)}`);
  }

  failAssertion(
    'assertBodyContains',
    `body of type ${body === null ? 'null' : typeof body}`,
    'a string or array body supporting containment',
  );
}

/**
 * Assert that the normalized response contains a header, ignoring case.
 * @param {NormalizedResponse} response Normalized REST response.
 * @param {string} headerName Header name to find.
 */
export function assertHeaderExists(response, headerName) {
  const header = findHeader(response.headers, headerName);
  if (!header.exists) {
    failAssertion('assertHeaderExists', `missing header ${formatValue(headerName)}`, 'header to exist');
  }
}

/**
 * Assert that a case-insensitive response header has the expected value.
 * @param {NormalizedResponse} response Normalized REST response.
 * @param {string} headerName Header name to find.
 * @param {string} expectedValue Expected header value.
 */
export function assertHeaderValue(response, headerName, expectedValue) {
  const header = findHeader(response.headers, headerName);
  if (!header.exists || header.value !== expectedValue) {
    failAssertion(
      'assertHeaderValue',
      header.exists ? header.value : `missing header ${formatValue(headerName)}`,
      expectedValue,
    );
  }
}

/**
 * Assert that the normalized response body was successfully parsed as JSON.
 * @param {NormalizedResponse} response Normalized REST response.
 */
export function assertValidJSON(response) {
  if (response.bodyParsed !== true) {
    const actual = response.bodyParseError
      ? `invalid JSON (${response.bodyParseError.message})`
      : response.body === null
        ? 'empty body'
        : 'bodyParsed=false';
    failAssertion('assertValidJSON', actual, 'valid JSON (bodyParsed=true)');
  }
}

function getBodyProperty(body, propertyPath) {
  if (typeof propertyPath !== 'string' || propertyPath.length === 0) {
    return { exists: false };
  }

  const segments = propertyPath.split('.');
  let value = body;
  for (const segment of segments) {
    if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
      return { exists: false };
    }
    if (!Object.prototype.hasOwnProperty.call(value, segment)) {
      return { exists: false };
    }
    value = value[segment];
  }
  return { exists: true, value };
}

function findHeader(headers, headerName) {
  if (typeof headerName !== 'string') return { exists: false };
  const normalizedName = headerName.toLowerCase();
  for (const [name, value] of Object.entries(headers ?? {})) {
    if (name.toLowerCase() === normalizedName) return { exists: true, value };
  }
  return { exists: false };
}

function failAssertion(assertionName, actual, expected) {
  throw new RestAssertionError(
    `${assertionName} failed: expected ${formatValue(actual)} to be ${formatValue(expected)}`,
  );
}

function formatValue(value) {
  try {
    const json = JSON.stringify(value);
    return json === undefined ? String(value) : json;
  } catch {
    return String(value);
  }
}

class RestAssertionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AssertionError';
    if (Error.captureStackTrace) Error.captureStackTrace(this, RestAssertionError);
  }
}

/** @typedef {{ status: number, statusText: string, ok: boolean, headers: Record<string, string>, body: unknown, bodyParsed: boolean, bodyParseError: ({name: string, message: string}|null), responseTimeMs: number }} NormalizedResponse */

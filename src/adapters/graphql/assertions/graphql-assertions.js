import { isDeepStrictEqual } from 'node:util';

/**
 * Assert that the HTTP response has the exact status code.
 * @param {NormalizedGraphQLResponse} response Normalized GraphQL response.
 * @param {number} expectedStatus Expected HTTP status code.
 */
export function assertHttpStatus(response, expectedStatus) {
  if (response.status !== expectedStatus) {
    failAssertion('assertHttpStatus', response.status, expectedStatus);
  }
}

/**
 * Assert HTTP success independently of GraphQL-level errors.
 * @param {NormalizedGraphQLResponse} response Normalized GraphQL response.
 */
export function assertHttpOk(response) {
  if (response.ok !== true) {
    failAssertion(
      'assertHttpOk',
      `HTTP ${response.status} (ok=${formatValue(response.ok)})`,
      'HTTP success (ok=true)',
    );
  }
}

/**
 * Assert that a property exists inside GraphQL data at a dot-separated path.
 * @param {NormalizedGraphQLResponse} response Normalized GraphQL response.
 * @param {string} propertyPath Dot-separated path within the data value.
 */
export function assertDataProperty(response, propertyPath) {
  if (!getNestedProperty(response.data, propertyPath).exists) {
    failAssertion(
      'assertDataProperty',
      `missing data property ${formatValue(propertyPath)}`,
      `data property ${formatValue(propertyPath)} to exist`,
    );
  }
}

/**
 * Assert that a GraphQL data property exactly matches the expected value.
 * @param {NormalizedGraphQLResponse} response Normalized GraphQL response.
 * @param {string} propertyPath Dot-separated path within the data value.
 * @param {unknown} expectedValue Expected data value.
 */
export function assertDataValue(response, propertyPath, expectedValue) {
  const property = getNestedProperty(response.data, propertyPath);
  if (!property.exists || !isDeepStrictEqual(property.value, expectedValue)) {
    failAssertion(
      'assertDataValue',
      property.exists ? property.value : `missing data property ${formatValue(propertyPath)}`,
      expectedValue,
    );
  }
}

/**
 * Assert that the normalized response contains no GraphQL errors.
 * @param {NormalizedGraphQLResponse} response Normalized GraphQL response.
 */
export function assertNoGraphQLErrors(response) {
  const errors = getGraphQLErrors(response);
  if (errors.length > 0) {
    failAssertion('assertNoGraphQLErrors', getErrorMessages(errors), 'no GraphQL errors');
  }
}

/**
 * Assert that the normalized response contains one or more GraphQL errors.
 * @param {NormalizedGraphQLResponse} response Normalized GraphQL response.
 */
export function assertGraphQLErrors(response) {
  const errors = getGraphQLErrors(response);
  if (errors.length === 0) {
    failAssertion('assertGraphQLErrors', [], 'one or more GraphQL errors');
  }
}

/**
 * Assert that one GraphQL error contains the expected message text.
 * @param {NormalizedGraphQLResponse} response Normalized GraphQL response.
 * @param {string} expectedMessage Expected message substring.
 */
export function assertGraphQLErrorMessage(response, expectedMessage) {
  const messages = getErrorMessages(getGraphQLErrors(response));
  if (typeof expectedMessage !== 'string' || !messages.some((message) => message.includes(expectedMessage))) {
    failAssertion(
      'assertGraphQLErrorMessage',
      messages,
      `GraphQL errors containing ${formatValue(expectedMessage)}`,
    );
  }
}

function getNestedProperty(data, propertyPath) {
  if (data === null || (typeof data !== 'object' && typeof data !== 'function') ||
      typeof propertyPath !== 'string' || propertyPath.length === 0) {
    return { exists: false };
  }

  let value = data;
  for (const segment of propertyPath.split('.')) {
    if (value === null || (typeof value !== 'object' && typeof value !== 'function') ||
        !Object.prototype.hasOwnProperty.call(value, segment)) {
      return { exists: false };
    }
    value = value[segment];
  }
  return { exists: true, value };
}

function getGraphQLErrors(response) {
  const errors = response?.errors;
  if (errors === undefined || errors === null) return [];
  return Array.isArray(errors) ? errors : [errors];
}

function getErrorMessages(errors) {
  return errors.map((error) => {
    if (typeof error === 'string') return error;
    if (error && typeof error.message === 'string') return error.message;
    return formatValue(error);
  });
}

function failAssertion(assertionName, actual, expected) {
  throw new GraphQLAssertionError(
    `${assertionName} failed: expected ${formatValue(actual)} to be ${formatValue(expected)}`,
  );
}

class GraphQLAssertionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AssertionError';
    if (Error.captureStackTrace) Error.captureStackTrace(this, GraphQLAssertionError);
  }
}

function formatValue(value) {
  try {
    const json = JSON.stringify(value);
    return json === undefined ? String(value) : json;
  } catch {
    return String(value);
  }
}

/**
 * @typedef {object} NormalizedGraphQLResponse
 * @property {number} status HTTP status code.
 * @property {string} statusText HTTP status text.
 * @property {boolean} ok HTTP-level success indicator.
 * @property {unknown} [data] GraphQL response data.
 * @property {unknown} [errors] GraphQL errors when present.
 */

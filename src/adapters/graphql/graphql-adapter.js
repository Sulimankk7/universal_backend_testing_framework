/**
 * Wrap a GraphQL client and normalize its HTTP responses.
 *
 * @param {GraphQLClient} graphqlClient Client created by createGraphQLClient.
 * @returns {GraphQLAdapter} Query and mutation methods returning normalized responses.
 */
export function createGraphQLAdapter(graphqlClient) {
  if (!graphqlClient || typeof graphqlClient !== 'object') {
    throw new TypeError('A GraphQL client is required.');
  }
  for (const method of ['query', 'mutate']) {
    if (typeof graphqlClient[method] !== 'function') {
      throw new TypeError(`GraphQL client must provide a ${method} method.`);
    }
  }

  async function execute(method, args) {
    const startedAt = performance.now();
    const response = await graphqlClient[method](...args);
    const responseTimeMs = Math.max(0, performance.now() - startedAt);
    return normalizeGraphQLResponse(response, responseTimeMs);
  }

  return Object.freeze({
    /** @param {string} document @param {GraphQLRequestOptions} [options] */
    query: (...args) => execute('query', args),
    /** @param {string} document @param {GraphQLRequestOptions} [options] */
    mutate: (...args) => execute('mutate', args),
  });
}

/**
 * Normalize a Fetch response without interpreting HTTP success as GraphQL
 * operation success. The complete parsed or raw response remains in `body`.
 *
 * @param {Response} response Native Fetch response returned by GraphQL Client.
 * @param {number} responseTimeMs Time to receive the HTTP response in milliseconds.
 * @returns {Promise<NormalizedGraphQLResponse>} Normalized GraphQL HTTP response.
 */
export async function normalizeGraphQLResponse(response, responseTimeMs) {
  if (!response || typeof response.text !== 'function' || !response.headers) {
    throw new TypeError('A Fetch Response is required.');
  }
  if (typeof responseTimeMs !== 'number' || !Number.isFinite(responseTimeMs) || responseTimeMs < 0) {
    throw new TypeError('responseTimeMs must be a non-negative finite number.');
  }

  const bodyText = await response.text();
  let body = bodyText === '' ? null : bodyText;
  let bodyParsed = false;
  let bodyParseError = null;
  if (bodyText !== '' && isJSONMediaType(response.headers.get('content-type'))) {
    try {
      body = JSON.parse(bodyText);
      bodyParsed = true;
    } catch (error) {
      bodyParseError = { name: error.name, message: error.message };
    }
  }

  const normalized = {
    status: response.status,
    statusText: response.statusText,
    ok: response.ok,
    headers: Object.fromEntries(response.headers.entries()),
    body,
    bodyParsed,
    responseTimeMs,
    bodyParseError,
  };

  if (bodyParsed && body !== null && typeof body === 'object') {
    if (Object.prototype.hasOwnProperty.call(body, 'data')) normalized.data = body.data;
    if (Object.prototype.hasOwnProperty.call(body, 'errors')) normalized.errors = body.errors;
  }

  return normalized;
}

function isJSONMediaType(contentType) {
  if (!contentType) return false;
  const mediaType = contentType.split(';', 1)[0].trim().toLowerCase();
  return mediaType === 'application/json' || mediaType.endsWith('+json');
}

/** @typedef {{ query: Function, mutate: Function }} GraphQLClient */
/** @typedef {{ variables?: Record<string, unknown>, headers?: HeadersInit }} GraphQLRequestOptions */
/** @typedef {{ query: Function, mutate: Function }} GraphQLAdapter */
/**
 * @typedef {object} NormalizedGraphQLResponse
 * @property {number} status HTTP status code.
 * @property {string} statusText HTTP status text.
 * @property {boolean} ok Fetch HTTP success indicator; independent of GraphQL errors.
 * @property {Record<string, string>} headers Response headers as a plain object.
 * @property {unknown} body Full parsed GraphQL body, raw text, or null when empty.
 * @property {boolean} bodyParsed Whether the non-empty body was parsed as JSON.
 * @property {number} responseTimeMs Time to receive the HTTP response.
 * @property {{name: string, message: string}|null} bodyParseError JSON parse failure, if any.
 * @property {unknown} [data] GraphQL data when the response includes a data property.
 * @property {unknown} [errors] GraphQL errors when the response includes an errors property.
 */

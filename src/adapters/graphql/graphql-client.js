/**
 * Create a GraphQL HTTP client backed by Node.js's native Fetch API.
 * Authentication can be supplied through the default or request headers.
 *
 * @param {GraphQLClientConfig} config Client configuration.
 * @returns {GraphQLClient} Query and mutation request methods.
 */
export function createGraphQLClient(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new TypeError('GraphQL client configuration must be an object.');
  }

  const endpointURL = validateEndpointURL(config.endpointURL);
  const defaultHeaders = new Headers({
    Accept: 'application/json',
    'Content-Type': 'application/json',
  });
  const configuredHeaders = createHeaders(config.headers, 'Default headers');
  for (const [name, value] of configuredHeaders) defaultHeaders.set(name, value);

  /**
   * Send a GraphQL document as a JSON request and return Fetch's native Response.
   * HTTP error statuses are returned normally; Fetch network errors propagate.
   *
   * @param {string} document GraphQL query or mutation document.
   * @param {GraphQLRequestOptions} [options] Variables and per-request headers.
   * @returns {Promise<Response>} Native Fetch response.
   */
  async function execute(document, options = {}) {
    if (typeof document !== 'string' || document.trim() === '') {
      throw new TypeError('GraphQL document must be a non-empty string.');
    }
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
      throw new TypeError('GraphQL request options must be an object.');
    }
    if (options.variables !== undefined &&
        (!options.variables || typeof options.variables !== 'object' || Array.isArray(options.variables))) {
      throw new TypeError('GraphQL variables must be an object when provided.');
    }

    const headers = new Headers(defaultHeaders);
    const requestHeaders = createHeaders(options.headers, 'Request headers');
    for (const [name, value] of requestHeaders) headers.set(name, value);

    const payload = { query: document };
    if (options.variables !== undefined) payload.variables = options.variables;

    return fetch(endpointURL, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
  }

  return Object.freeze({
    /** @param {string} document @param {GraphQLRequestOptions} [options] */
    query: (document, options) => execute(document, options),
    /** @param {string} document @param {GraphQLRequestOptions} [options] */
    mutate: (document, options) => execute(document, options),
  });
}

/** @typedef {{ endpointURL: string, headers?: HeadersInit }} GraphQLClientConfig */
/** @typedef {{ variables?: Record<string, unknown>, headers?: HeadersInit }} GraphQLRequestOptions */
/** @typedef {{ query: (document: string, options?: GraphQLRequestOptions) => Promise<Response>, mutate: (document: string, options?: GraphQLRequestOptions) => Promise<Response> }} GraphQLClient */

function validateEndpointURL(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError('A valid endpointURL is required.');
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new TypeError('endpointURL must be a valid absolute URL.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new TypeError('endpointURL must use HTTP or HTTPS.');
  }
  return parsed;
}

function createHeaders(value, label) {
  if (value === undefined) return new Headers();
  try {
    return new Headers(value);
  } catch (error) {
    throw new TypeError(`${label} must be a valid HeadersInit value.`, { cause: error });
  }
}

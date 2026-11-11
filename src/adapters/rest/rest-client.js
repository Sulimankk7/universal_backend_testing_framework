/**
 * Create a small REST client backed by Node.js's native Fetch API.
 *
 * @param {RestClientConfig} config Client configuration.
 * @returns {RestClient} Methods for sending REST requests.
 */
export function createRestClient(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new TypeError('REST client configuration must be an object.');
  }

  const baseURL = validateBaseURL(config.baseURL);
  const defaultHeaders = createHeaders(config.headers, 'Default headers');

  /**
   * @param {'GET'|'POST'|'PUT'|'PATCH'|'DELETE'} method HTTP method.
   * @param {string} path Relative endpoint path.
   * @param {unknown} [body] JSON-compatible request body.
   * @param {RequestOptions} [options] Per-request options.
   * @returns {Promise<Response>} Native Fetch response.
   */
  async function request(method, path, body, options = {}) {
    if (typeof path !== 'string' || path.trim() === '') {
      throw new TypeError('Endpoint path must be a non-empty string.');
    }
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
      throw new TypeError('Request options must be an object.');
    }

    const url = joinURL(baseURL, path);
    const headers = new Headers(defaultHeaders);
    const requestHeaders = createHeaders(options.headers, 'Request headers');
    for (const [name, value] of requestHeaders) headers.set(name, value);

    const init = { ...options, method, headers };
    delete init.headers;
    if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
      if (body !== undefined) {
        init.body = JSON.stringify(body);
        if (!headers.has('content-type')) headers.set('Content-Type', 'application/json');
      } else {
        delete init.body;
      }
    } else {
      delete init.body;
    }

    return fetch(url, { ...init, headers });
  }

  return Object.freeze({
    /** @param {string} path @param {RequestOptions} [options] */
    get: (path, options) => request('GET', path, undefined, options),
    /** @param {string} path @param {unknown} body @param {RequestOptions} [options] */
    post: (path, body, options) => request('POST', path, body, options),
    /** @param {string} path @param {unknown} body @param {RequestOptions} [options] */
    put: (path, body, options) => request('PUT', path, body, options),
    /** @param {string} path @param {unknown} body @param {RequestOptions} [options] */
    patch: (path, body, options) => request('PATCH', path, body, options),
    /** @param {string} path @param {RequestOptions} [options] */
    delete: (path, options) => request('DELETE', path, undefined, options),
  });
}

/** @typedef {{ baseURL: string, headers?: HeadersInit }} RestClientConfig */
/** @typedef {{ headers?: HeadersInit, [key: string]: unknown }} RequestOptions */
/** @typedef {{ get: Function, post: Function, put: Function, patch: Function, delete: Function }} RestClient */

function validateBaseURL(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError('A valid baseURL is required.');
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new TypeError('baseURL must be a valid absolute URL.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.search || parsed.hash) {
    throw new TypeError('baseURL must be an HTTP or HTTPS URL without a query or fragment.');
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

function joinURL(baseURL, path) {
  if (/^[a-z][a-z\d+.-]*:/i.test(path) || path.startsWith('//')) {
    throw new TypeError('Endpoint path must be relative to the configured baseURL.');
  }
  try {
    const endpoint = new URL(path.replace(/^\/+/, ''), 'http://rest-client.invalid/');
    const base = new URL(baseURL.href);
    const basePath = base.pathname.replace(/\/+$/, '');
    base.pathname = `${basePath}/${endpoint.pathname.replace(/^\/+/, '')}`.replace(/\/{2,}/g, '/');
    base.search = endpoint.search;
    base.hash = endpoint.hash;
    return base;
  } catch (error) {
    throw new TypeError('Endpoint path is not a valid relative URL path.', { cause: error });
  }
}

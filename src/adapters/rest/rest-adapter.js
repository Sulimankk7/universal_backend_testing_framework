/**
 * Wrap a REST client and return normalized responses with response timing.
 *
 * @param {RestClient} restClient Client created by createRestClient.
 * @returns {RestAdapter} Methods matching the REST client's HTTP methods.
 */
export function createRestAdapter(restClient) {
  if (!restClient || typeof restClient !== 'object') {
    throw new TypeError('A REST client is required.');
  }

  const methods = ['get', 'post', 'put', 'patch', 'delete'];
  for (const method of methods) {
    if (typeof restClient[method] !== 'function') {
      throw new TypeError(`REST client must provide a ${method} method.`);
    }
  }

  return Object.freeze(Object.fromEntries(methods.map((method) => [
    method,
    async (path, ...args) => {
      const startedAt = performance.now();
      const response = await restClient[method](path, ...args);
      const responseTimeMs = Math.max(0, performance.now() - startedAt);
      return normalizeResponse(response, responseTimeMs);
    },
  ])));
}

/**
 * Convert a Fetch Response into a compact, consistently shaped response.
 * JSON media types are parsed; invalid JSON remains available as text and
 * reports its parse error in `bodyParseError`.
 *
 * @param {Response} response Native Fetch response.
 * @param {number} responseTimeMs Time from request start to response receipt.
 * @returns {Promise<NormalizedResponse>} Normalized response data.
 */
export async function normalizeResponse(response, responseTimeMs) {
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
      bodyParseError = {
        name: error.name,
        message: error.message,
      };
    }
  }

  return {
    status: response.status,
    statusText: response.statusText,
    ok: response.ok,
    headers: Object.fromEntries(response.headers.entries()),
    body,
    bodyParsed,
    responseTimeMs,
    bodyParseError,
  };
}

function isJSONMediaType(contentType) {
  if (!contentType) return false;
  const mediaType = contentType.split(';', 1)[0].trim().toLowerCase();
  return mediaType === 'application/json' || mediaType.endsWith('+json');
}

/** @typedef {{ get: Function, post: Function, put: Function, patch: Function, delete: Function }} RestClient */
/** @typedef {{ get: Function, post: Function, put: Function, patch: Function, delete: Function }} RestAdapter */
/** @typedef {{ status: number, statusText: string, ok: boolean, headers: Record<string, string>, body: unknown, bodyParsed: boolean, responseTimeMs: number, bodyParseError: ({name: string, message: string}|null) }} NormalizedResponse */

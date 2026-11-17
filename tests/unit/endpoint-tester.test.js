import { afterEach, describe, expect, it, vi } from 'vitest';
import { runEndpointTest, validateEndpointConfig } from '../../src/endpoint-tester/run-endpoint-test.js';

const config = (overrides = {}) => ({ url: 'http://localhost:3000/api/items', method: 'GET', expectedStatus: 200, ...overrides });
const response = (body, status = 200, contentType = 'application/json') => new Response(body === null ? null : typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'Content-Type': contentType } });
afterEach(() => vi.unstubAllGlobals());

describe('endpoint test runner', () => {
  it.each(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])('accepts %s as a valid HTTP method', (method) => {
    expect(validateEndpointConfig(config({ method })).href).toBe(config().url);
  });

  it.each([
    ['HTTP', 'http://api.example.test/items'],
    ['HTTPS with query parameters', 'https://api.example.test/items?active=true'],
  ])('accepts a valid %s endpoint URL', (_label, url) => {
    expect(validateEndpointConfig(config({ url })).href).toBe(url);
  });

  it.each([100, 200, 404, 599])('accepts expected status %i', (expectedStatus) => {
    expect(validateEndpointConfig(config({ expectedStatus })).href).toBe(config().url);
  });

  it('accepts an omitted request body for a body-capable method', () => {
    expect(() => validateEndpointConfig(config({ method: 'POST' }))).not.toThrow();
  });

  it('rejects missing or invalid required inputs and invalid JSON bodies', () => {
    expect(() => validateEndpointConfig()).toThrow(/endpoint URL/);
    expect(() => validateEndpointConfig({ method: 'GET', expectedStatus: 200 })).toThrow(/endpoint URL/);
    expect(() => validateEndpointConfig({ url: config().url, expectedStatus: 200 })).toThrow(/supported HTTP method/);
    expect(() => validateEndpointConfig({ url: config().url, method: 'GET' })).toThrow(/status code/);
    expect(() => validateEndpointConfig(config({ url: 'nope' }))).toThrow(/valid absolute URL/);
    expect(() => validateEndpointConfig(config({ url: 'ftp://example.test/items' }))).toThrow(/HTTP or HTTPS/);
    expect(() => validateEndpointConfig(config({ method: 'TRACE' }))).toThrow(/supported HTTP method/);
    expect(() => validateEndpointConfig(config({ expectedStatus: 99 }))).toThrow(/status code/);
    expect(() => validateEndpointConfig(config({ expectedStatus: 'not a status' }))).toThrow(/status code/);
    expect(() => validateEndpointConfig(config({ expectedStatus: 600 }))).toThrow(/status code/);
    expect(() => validateEndpointConfig(config({ method: 'POST', body: '{' }))).toThrow(/Request body must be valid JSON/);
    expect(() => validateEndpointConfig(config({ method: 'GET', body: '{}' }))).toThrow(/do not accept/);
    expect(() => validateEndpointConfig(config({ expectedResponseJSON: '{' }))).toThrow(/Expected response JSON must be valid JSON/);
    expect(() => validateEndpointConfig(config({ expectedResponseJSON: 'null' }))).toThrow(/must be a JSON object or array/);
  });

  it('executes through Fetch, validates the expected status, and returns the response body', async () => {
    const fetch = vi.fn(async () => response({ data: { id: 1, label: 'extra' }, ok: true }));
    vi.stubGlobal('fetch', fetch);
    const result = await runEndpointTest(config());
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0][1].method).toBe('GET');
    expect(result.status).toBe('passed');
    expect(result.source).toBe('rest');
    expect(result.execution.success).toBe(true);
    expect(result.assertions).toEqual([{ name: 'Expected HTTP status', passed: true, expected: 200, actual: 200, reason: null }]);
    expect(result.response.body).toEqual({ data: { id: 1, label: 'extra' }, ok: true });
    expect(result.response.headers['content-type']).toContain('application/json');
    expect(result.response.durationMs).toBeGreaterThanOrEqual(0);
  });

  it.each([
    ['GET', undefined],
    ['POST', { name: 'Ada' }],
    ['PUT', { name: 'Grace' }],
    ['PATCH', { active: true }],
    ['DELETE', undefined],
  ])('sends a %s request to the configured endpoint', async (method, jsonBody) => {
    const fetch = vi.fn(async () => response({ ok: true }));
    vi.stubGlobal('fetch', fetch);
    const endpoint = 'https://api.example.test/v1/items?limit=2&active=true';
    const body = jsonBody === undefined ? undefined : JSON.stringify(jsonBody);
    const result = await runEndpointTest(config({ url: endpoint, method, body }));
    const [actualUrl, init] = fetch.mock.calls[0];

    expect(actualUrl.href).toBe(endpoint);
    expect(init.method).toBe(method);
    if (jsonBody === undefined) {
      expect(init).not.toHaveProperty('body');
    } else {
      expect(init.body).toBe(JSON.stringify(jsonBody));
      expect(init.headers.get('content-type')).toBe('application/json');
    }
    expect(result).toMatchObject({ status: 'passed', request: { url: endpoint, method }, response: { status: 200 } });
  });

  it('marks a matching actual status as PASSED and returns request and response details', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({ id: 10 }, 201)));
    const result = await runEndpointTest(config({ expectedStatus: 201 }));
    expect(result).toMatchObject({
      status: 'passed',
      request: { method: 'GET', url: config().url, expectedStatus: 201 },
      response: { status: 201 },
      execution: { success: true },
    });
    expect(result.summaryError).toBeNull();
  });

  it('passes when the expected response JSON matches completely and ignores object key order', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({ name: 'Product A', id: 1 })));
    const result = await runEndpointTest(config({ expectedResponseJSON: '{"id":1,"name":"Product A"}' }));
    expect(result.status).toBe('passed');
    expect(result.assertions).toMatchObject([
      { name: 'Expected HTTP status', passed: true },
      { name: 'Expected response JSON', passed: true },
    ]);
  });

  it('fails when expected JSON differs even if the status matches', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({ id: 1, name: 'Product A', price: 10 })));
    const result = await runEndpointTest(config({ expectedStatus: 200, expectedResponseJSON: '{"id":1,"name":"Product A"}' }));
    expect(result.status).toBe('failed');
    expect(result.assertions).toMatchObject([
      { name: 'Expected HTTP status', passed: true },
      { name: 'Expected response JSON at price', passed: false, expected: undefined, actual: 10 },
    ]);
    expect(result.summaryError).toContain('Expected response JSON at price');
  });

  it('keeps status validation independent from expected response JSON validation', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({ id: 1 }, 201)));
    const result = await runEndpointTest(config({ expectedStatus: 200, expectedResponseJSON: '{"id":2}' }));
    expect(result.status).toBe('failed');
    expect(result.assertions).toMatchObject([
      { name: 'Expected HTTP status', passed: false, expected: 200, actual: 201 },
      { name: 'Expected response JSON at id', passed: false, expected: 2, actual: 1 },
    ]);
  });

  it('uses status-only behavior when expected response JSON is empty', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({ arbitrary: 'body' })));
    const result = await runEndpointTest(config({ expectedResponseJSON: '  ' }));
    expect(result.status).toBe('passed');
    expect(result.assertions).toEqual([{ name: 'Expected HTTP status', passed: true, expected: 200, actual: 200, reason: null }]);
  });

  it.each([400, 404, 500, 503])('marks HTTP %i as FAILED when it differs from expected status', async (status) => {
    vi.stubGlobal('fetch', vi.fn(async () => response({ error: 'request failed' }, status)));
    const result = await runEndpointTest(config({ expectedStatus: 200 }));
    expect(result).toMatchObject({
      status: 'failed',
      request: { method: 'GET', expectedStatus: 200 },
      response: { status },
      execution: { success: true },
      assertions: [{ passed: false, expected: 200, actual: status, reason: `Expected HTTP status 200, but received ${status}.` }],
    });
    expect(result.summaryError).toBe(`Expected HTTP status 200, but received ${status}.`);
  });

  it('reports network errors and redacts bearer credentials from response bodies', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network unavailable'); }));
    const networkFailure = await runEndpointTest(config({ bearerToken: 'secret' }));
    expect(networkFailure.status).toBe('failed');
    expect(networkFailure.execution.error).toContain('network unavailable');
    expect(networkFailure.summaryError).toContain('network unavailable');

    vi.stubGlobal('fetch', vi.fn(async () => response({ echoed: 'secret' })));
    const result = await runEndpointTest(config({ bearerToken: 'secret' }));
    expect(result.response.body.echoed).toBe('[REDACTED]');
    expect(JSON.stringify(result)).not.toContain('secret');
  });

  it('keeps empty and non-JSON response bodies inspectable without JSON comparison', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response(null, 204)));
    const empty = await runEndpointTest(config({ expectedStatus: 204 }));
    expect(empty.assertions[0].passed).toBe(true);
    expect(empty.response.body).toBeNull();
    expect(empty.status).toBe('passed');

    vi.stubGlobal('fetch', vi.fn(async () => response('plain text', 200, 'text/plain')));
    const nonJson = await runEndpointTest(config());
    expect(nonJson.response.body).toBe('plain text');
    expect(nonJson.status).toBe('passed');
  });

  it('reports malformed Fetch responses as clear execution failures', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ status: 200 })));
    const result = await runEndpointTest(config());
    expect(result.status).toBe('failed');
    expect(result.execution.success).toBe(false);
    expect(result.execution.error).toMatch(/Fetch Response is required/);
    expect(result.summaryError).toBe(result.execution.error);
    expect(result.response).toBeNull();
  });

  it('reports request timeouts as FAILED results with a useful message', async () => {
    const timed = vi.fn(async (_url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true })));
    vi.stubGlobal('fetch', timed);
    const result = await runEndpointTest(config({ timeoutMs: 5 }));
    expect(result.status).toBe('failed');
    expect(result.execution.error).toBe('Request timed out.');
    expect(result.summaryError).toBe('Request timed out.');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRestClient } from '../../src/adapters/rest/rest-client.js';
import { createRestAdapter } from '../../src/adapters/rest/rest-adapter.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function createAdapter(responseOrFetch) {
  const fetchMock = typeof responseOrFetch === 'function'
    ? responseOrFetch
    : vi.fn().mockResolvedValue(responseOrFetch);
  vi.stubGlobal('fetch', fetchMock);
  const restClient = createRestClient({ baseURL: 'https://api.example.test' });
  return { adapter: createRestAdapter(restClient), fetchMock };
}

describe('REST response handling', () => {
  it('normalizes a successful 200 response', async () => {
    const { adapter } = createAdapter(new Response('{"id":1}', {
      status: 200,
      statusText: 'OK',
      headers: { 'Content-Type': 'application/json' },
    }));

    const result = await adapter.get('/users/1');

    expect(result).toMatchObject({ status: 200, ok: true, body: { id: 1 } });
    expect(result.statusText).toBe('OK');
    expect(result.responseTimeMs).toEqual(expect.any(Number));
    expect(result.responseTimeMs).toBeGreaterThanOrEqual(0);
    expect(JSON.parse(JSON.stringify(result))).toMatchObject({
      status: 200,
      statusText: 'OK',
      bodyParsed: true,
      ok: true,
      headers: { 'content-type': 'application/json' },
      body: { id: 1 },
    });
  });

  it.each([
    [404, 'Not Found'],
    [500, 'Internal Server Error'],
  ])('returns HTTP %i as a response with status text', async (status, statusText) => {
    const { adapter } = createAdapter(new Response('failure', { status, statusText }));

    const result = await adapter.get('/failure');

    expect(result.status).toBe(status);
    expect(result.statusText).toBe(statusText);
    expect(result.ok).toBe(false);
  });

  it('returns headers as a plain object with direct lookup and all values', async () => {
    const { adapter } = createAdapter(new Response('ok', {
      headers: { 'Content-Type': 'text/plain', 'X-Request-ID': 'request-42' },
    }));

    const result = await adapter.get('/headers');

    expect(result.headers).not.toBeInstanceOf(Headers);
    expect(Object.getPrototypeOf(result.headers)).toBe(Object.prototype);
    expect(result.headers['content-type']).toBe('text/plain');
    expect(result.headers['x-request-id']).toBe('request-42');
    expect(Object.entries(result.headers)).toContainEqual(['content-type', 'text/plain']);
    expect(Object.entries(result.headers)).toContainEqual(['x-request-id', 'request-42']);
  });

  it('parses JSON response bodies', async () => {
    const { adapter } = createAdapter(new Response('{"items":[1,2]}', {
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    }));

    const result = await adapter.get('/json');

    expect(result.body).toEqual({ items: [1, 2] });
    expect(result.bodyParsed).toBe(true);
    expect(result.bodyParseError).toBeNull();
    expect(Array.isArray(result.body.items)).toBe(true);
  });

  it.each([
    ['null', null],
    ['[]', []],
  ])('marks JSON %s as successfully parsed', async (jsonText, expectedBody) => {
    const { adapter } = createAdapter(new Response(jsonText, {
      headers: { 'Content-Type': 'application/json' },
    }));

    const result = await adapter.get('/json-value');

    expect(result.body).toEqual(expectedBody);
    expect(result.bodyParsed).toBe(true);
    expect(result.bodyParseError).toBeNull();
  });

  it('keeps text response bodies as text', async () => {
    const { adapter } = createAdapter(new Response('plain text', {
      headers: { 'Content-Type': 'text/plain' },
    }));

    const result = await adapter.get('/text');

    expect(result.body).toBe('plain text');
    expect(result.bodyParsed).toBe(false);
    expect(result.bodyParseError).toBeNull();
  });

  it('represents an empty response body as null', async () => {
    const { adapter } = createAdapter(new Response(null, { status: 204 }));

    const result = await adapter.get('/empty');

    expect(result.body).toBeNull();
    expect(result.bodyParsed).toBe(false);
    expect(result.bodyParseError).toBeNull();
  });

  it('preserves invalid JSON as text and exposes the parse error', async () => {
    const { adapter } = createAdapter(new Response('{invalid}', {
      headers: { 'Content-Type': 'application/json' },
    }));

    const result = await adapter.get('/invalid-json');

    expect(result.body).toBe('{invalid}');
    expect(result.bodyParsed).toBe(false);
    expect(result.bodyParseError).toMatchObject({ name: 'SyntaxError' });
    expect(result.bodyParseError.message).toBeTruthy();
    expect(result.status).toBe(200);
    expect(result.ok).toBe(true);
    expect(JSON.parse(JSON.stringify(result))).toMatchObject({
      body: '{invalid}',
      bodyParsed: false,
      bodyParseError: { name: 'SyntaxError' },
      status: 200,
      ok: true,
    });
  });

  it('measures elapsed request time in non-negative milliseconds', async () => {
    const { adapter } = createAdapter(new Response('ok'));
    const now = vi.spyOn(performance, 'now')
      .mockReturnValueOnce(10)
      .mockReturnValueOnce(31);

    const result = await adapter.get('/timed');

    expect(now).toHaveBeenCalledTimes(2);
    expect(result.responseTimeMs).toBe(21);
    expect(result.responseTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('propagates network errors while returning HTTP errors as normalized responses', async () => {
    const networkError = new TypeError('Network unavailable');
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(networkError)
      .mockResolvedValueOnce(new Response('missing', { status: 404 }));
    const { adapter } = createAdapter(fetchMock);

    await expect(adapter.get('/offline')).rejects.toBe(networkError);
    const result = await adapter.get('/missing');
    expect(result.status).toBe(404);
    expect(result.ok).toBe(false);
  });
});

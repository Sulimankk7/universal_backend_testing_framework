import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRestClient } from '../../src/adapters/rest/rest-client.js';

afterEach(() => vi.unstubAllGlobals());

function stubFetch(response = new Response(null, { status: 200 })) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('createRestClient', () => {
  it('requires a valid HTTP base URL', () => {
    expect(() => createRestClient()).toThrow(/configuration/);
    expect(() => createRestClient({ baseURL: '' })).toThrow(/baseURL/);
    expect(() => createRestClient({ baseURL: 'not a URL' })).toThrow(/baseURL/);
    expect(() => createRestClient({ baseURL: 'ftp://example.com' })).toThrow(/HTTP or HTTPS/);
  });

  it.each([
    ['get', 'GET', undefined],
    ['post', 'POST', { name: 'Ada' }],
    ['put', 'PUT', ['updated']],
    ['patch', 'PATCH', null],
    ['delete', 'DELETE', undefined],
  ])('sends %s requests and returns the native response', async (methodName, method, body) => {
    const response = new Response(null, { status: 200 });
    const fetchMock = stubFetch(response);
    const client = createRestClient({ baseURL: 'http://localhost:3000/api/' });

    const result = body === undefined
      ? await client[methodName]('/users')
      : await client[methodName]('users', body);

    expect(result).toBe(response);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0];
    expect(url.href).toBe('http://localhost:3000/api/users');
    expect(options.method).toBe(method);
    if (body !== undefined) expect(options.body).toBe(JSON.stringify(body));
  });

  it('preserves endpoint query strings and the base path prefix', async () => {
    const fetchMock = stubFetch();
    const client = createRestClient({ baseURL: 'https://example.test/v1/api' });
    await client.get('/users?active=true');
    expect(fetchMock.mock.calls[0][0].href).toBe('https://example.test/v1/api/users?active=true');
  });

  it('merges default and request headers case-insensitively without mutation', async () => {
    const fetchMock = stubFetch();
    const defaults = { Authorization: 'Bearer old', Accept: 'application/json' };
    const client = createRestClient({ baseURL: 'https://example.test', headers: defaults });
    await client.get('/users', { headers: { authorization: 'Bearer new', 'X-Request-ID': '123' } });

    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers.get('AUTHORIZATION')).toBe('Bearer new');
    expect(headers.get('accept')).toBe('application/json');
    expect(headers.get('x-request-id')).toBe('123');
    expect(defaults).toEqual({ Authorization: 'Bearer old', Accept: 'application/json' });
  });

  it('sets JSON content type when a JSON body is supplied and permits overrides', async () => {
    const fetchMock = stubFetch();
    const client = createRestClient({ baseURL: 'https://example.test' });
    await client.post('/users', { name: 'Ada' });
    await client.post('/users', { name: 'Grace' }, { headers: { 'content-TYPE': 'application/vnd.example+json' } });

    expect(fetchMock.mock.calls[0][1].headers.get('content-type')).toBe('application/json');
    expect(fetchMock.mock.calls[1][1].headers.get('Content-Type')).toBe('application/vnd.example+json');
  });

  it('does not send GET or DELETE bodies', async () => {
    const fetchMock = stubFetch();
    const client = createRestClient({ baseURL: 'https://example.test' });
    await client.get('/users', { body: 'ignored' });
    await client.delete('/users/1', { body: 'ignored' });
    expect(fetchMock.mock.calls[0][1]).not.toHaveProperty('body');
    expect(fetchMock.mock.calls[1][1]).not.toHaveProperty('body');
  });

  it('rejects invalid endpoint paths and request options', async () => {
    const client = createRestClient({ baseURL: 'https://example.test' });
    await expect(client.get('')).rejects.toThrow(/Endpoint path/);
    await expect(client.get('https://other.test/users')).rejects.toThrow(/relative/);
    await expect(client.get('/users', null)).rejects.toThrow(/Request options/);
  });

  it('propagates network failures and returns HTTP error responses normally', async () => {
    const client = createRestClient({ baseURL: 'https://example.test' });
    const networkError = new TypeError('Network unavailable');
    const fetchMock = vi.fn().mockRejectedValueOnce(networkError)
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(client.get('/offline')).rejects.toBe(networkError);
    expect((await client.get('/missing')).status).toBe(404);
    expect((await client.get('/broken')).status).toBe(500);
  });
});

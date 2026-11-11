import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGraphQLClient } from '../../src/adapters/graphql/graphql-client.js';
import { createGraphQLAdapter } from '../../src/adapters/graphql/graphql-adapter.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function createAdapter(responseOrFetch) {
  const fetchMock = typeof responseOrFetch === 'function'
    ? responseOrFetch
    : vi.fn().mockResolvedValue(responseOrFetch);
  vi.stubGlobal('fetch', fetchMock);
  const client = createGraphQLClient({ endpointURL: 'https://api.example.test/graphql' });
  return { adapter: createGraphQLAdapter(client), fetchMock };
}

describe('GraphQL response handling', () => {
  it('normalizes a successful GraphQL response and preserves the full body', async () => {
    const body = { data: { viewer: { id: 'u1' } }, extensions: { traceId: 'trace-1' } };
    const { adapter } = createAdapter(new Response(JSON.stringify(body), {
      status: 200,
      statusText: 'OK',
      headers: { 'Content-Type': 'application/graphql-response+json; charset=utf-8' },
    }));

    const result = await adapter.query('query { viewer { id } }');

    expect(result).toMatchObject({
      status: 200,
      statusText: 'OK',
      ok: true,
      data: body.data,
      body,
      bodyParsed: true,
      bodyParseError: null,
    });
    expect(result.errors).toBeUndefined();
    expect(result.responseTimeMs).toEqual(expect.any(Number));
    expect(result.responseTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('preserves GraphQL errors independently of HTTP success', async () => {
    const errors = [{ message: 'Not authorized', extensions: { code: 'FORBIDDEN' } }];
    const { adapter } = createAdapter(new Response(JSON.stringify({ errors }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));

    const result = await adapter.query('query { secret }');

    expect(result.status).toBe(200);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual(errors);
    expect(result.body.errors).toEqual(errors);
    expect(result.data).toBeUndefined();
  });

  it('preserves partial data alongside GraphQL errors', async () => {
    const data = { user: { id: 'u1', name: null } };
    const errors = [{ message: 'Name resolver failed', path: ['user', 'name'] }];
    const { adapter } = createAdapter(new Response(JSON.stringify({ data, errors }), {
      headers: { 'Content-Type': 'application/json' },
    }));

    const result = await adapter.query('query { user { id name } }');

    expect(result.data).toEqual(data);
    expect(result.errors).toEqual(errors);
    expect(result.body).toEqual({ data, errors });
  });

  it('preserves an explicit GraphQL data value of null', async () => {
    const { adapter } = createAdapter(new Response('{"data":null}', {
      headers: { 'Content-Type': 'application/json' },
    }));

    const result = await adapter.query('query { viewer { id } }');

    expect(result.bodyParsed).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(result, 'data')).toBe(true);
    expect(result.data).toBeNull();
  });

  it('normalizes an empty body without treating it as a parse failure', async () => {
    const { adapter } = createAdapter(new Response(null, { status: 204 }));

    const result = await adapter.query('query { viewer { id } }');

    expect(result.status).toBe(204);
    expect(result.ok).toBe(true);
    expect(result.body).toBeNull();
    expect(result.bodyParsed).toBe(false);
    expect(result.bodyParseError).toBeNull();
  });

  it('retains invalid JSON text and exposes its parse error', async () => {
    const { adapter } = createAdapter(new Response('{invalid', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));

    const result = await adapter.query('query { viewer { id } }');

    expect(result.body).toBe('{invalid');
    expect(result.bodyParsed).toBe(false);
    expect(result.bodyParseError).toMatchObject({ name: 'SyntaxError' });
    expect(result.status).toBe(200);
    expect(result.ok).toBe(true);
    expect(result.data).toBeUndefined();
    expect(result.errors).toBeUndefined();
  });

  it('retains non-JSON response bodies as text', async () => {
    const { adapter } = createAdapter(new Response('upstream unavailable', {
      status: 502,
      headers: { 'Content-Type': 'text/plain' },
    }));

    const result = await adapter.query('query { viewer { id } }');

    expect(result.status).toBe(502);
    expect(result.ok).toBe(false);
    expect(result.body).toBe('upstream unavailable');
    expect(result.bodyParsed).toBe(false);
    expect(result.bodyParseError).toBeNull();
  });

  it.each([400, 500])('preserves GraphQL errors in an HTTP %i response', async (status) => {
    const errors = [{ message: 'Request rejected' }];
    const { adapter } = createAdapter(new Response(JSON.stringify({ errors }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }));

    const result = await adapter.mutate('mutation { updateViewer }');

    expect(result.status).toBe(status);
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(errors);
    expect(result.body.errors).toEqual(errors);
  });

  it('converts response headers to a plain object', async () => {
    const { adapter } = createAdapter(new Response('{"data":{}}', {
      headers: { 'Content-Type': 'application/json', 'X-Request-ID': 'request-7' },
    }));

    const result = await adapter.query('query { viewer { id } }');

    expect(result.headers).not.toBeInstanceOf(Headers);
    expect(Object.getPrototypeOf(result.headers)).toBe(Object.prototype);
    expect(result.headers['content-type']).toBe('application/json');
    expect(result.headers['x-request-id']).toBe('request-7');
  });

  it('measures response time in non-negative milliseconds', async () => {
    const { adapter } = createAdapter(new Response('{"data":{}}', {
      headers: { 'Content-Type': 'application/json' },
    }));
    const now = vi.spyOn(performance, 'now')
      .mockReturnValueOnce(12)
      .mockReturnValueOnce(39);

    const result = await adapter.query('query { viewer { id } }');

    expect(now).toHaveBeenCalledTimes(2);
    expect(result.responseTimeMs).toBe(27);
    expect(result.responseTimeMs).toBeGreaterThanOrEqual(0);
  });
});

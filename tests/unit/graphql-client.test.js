import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGraphQLClient } from '../../src/adapters/graphql/graphql-client.js';

afterEach(() => vi.unstubAllGlobals());

function stubFetch(...responses) {
  const fetchMock = vi.fn();
  for (const response of responses) fetchMock.mockResolvedValueOnce(response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('createGraphQLClient', () => {
  it('sends a query as JSON to the configured endpoint', async () => {
    const response = new Response('{"data":{"users":[]}}', { status: 200 });
    const fetchMock = stubFetch(response);
    const client = createGraphQLClient({ endpointURL: 'http://localhost:4000/graphql' });
    const document = 'query Users { users { id name } }';

    const result = await client.query(document);

    expect(result).toBe(response);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0];
    expect(url.href).toBe('http://localhost:4000/graphql');
    expect(options.method).toBe('POST');
    expect(options.headers.get('content-type')).toBe('application/json');
    expect(options.headers.get('accept')).toBe('application/json');
    expect(options.body).toBe(JSON.stringify({ query: document }));
  });

  it('sends a mutation document', async () => {
    const fetchMock = stubFetch(new Response('{}', { status: 200 }));
    const client = createGraphQLClient({ endpointURL: 'https://api.example.test/graphql' });
    const document = 'mutation CreateUser { createUser { id } }';

    await client.mutate(document);

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ query: document });
  });

  it('sends GraphQL variables with the document', async () => {
    const fetchMock = stubFetch(new Response('{}', { status: 200 }));
    const client = createGraphQLClient({ endpointURL: 'https://api.example.test/graphql' });
    const document = 'query User($id: ID!) { user(id: $id) { id } }';
    const variables = { id: 'user-123' };

    await client.query(document, { variables });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ query: document, variables });
    expect(variables).toEqual({ id: 'user-123' });
  });

  it('merges request headers over defaults case-insensitively without mutating defaults', async () => {
    const fetchMock = stubFetch(new Response('{}', { status: 200 }));
    const defaults = { Authorization: 'Bearer default', 'X-Client': 'framework' };
    const client = createGraphQLClient({
      endpointURL: 'https://api.example.test/graphql',
      headers: defaults,
    });

    await client.query('query { viewer { id } }', {
      headers: { authorization: 'Bearer request', 'X-Request-ID': 'request-9' },
    });

    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers.get('AUTHORIZATION')).toBe('Bearer request');
    expect(headers.get('x-client')).toBe('framework');
    expect(headers.get('x-request-id')).toBe('request-9');
    expect(defaults).toEqual({ Authorization: 'Bearer default', 'X-Client': 'framework' });
  });

  it('supports authentication supplied through default or request headers', async () => {
    const fetchMock = stubFetch(
      new Response('{}', { status: 200 }),
      new Response('{}', { status: 200 }),
    );
    const client = createGraphQLClient({
      endpointURL: 'https://api.example.test/graphql',
      headers: { Authorization: 'Bearer default-token' },
    });

    await client.query('query { viewer { id } }');
    await client.query('query { viewer { id } }', {
      headers: { Authorization: 'Bearer request-token' },
    });

    expect(fetchMock.mock.calls[0][1].headers.get('authorization')).toBe('Bearer default-token');
    expect(fetchMock.mock.calls[1][1].headers.get('authorization')).toBe('Bearer request-token');
  });

  it('returns HTTP 4xx and 5xx responses normally', async () => {
    const response400 = new Response('{"errors":[]}', { status: 400 });
    const response500 = new Response('{"errors":[]}', { status: 500 });
    const client = createGraphQLClient({ endpointURL: 'https://api.example.test/graphql' });
    stubFetch(response400, response500);

    expect(await client.query('query { users { id } }')).toBe(response400);
    expect(await client.mutate('mutation { clearCache }')).toBe(response500);
  });

  it('propagates Fetch network errors', async () => {
    const client = createGraphQLClient({ endpointURL: 'https://api.example.test/graphql' });
    const networkError = new TypeError('Network unavailable');
    const fetchMock = vi.fn().mockRejectedValue(networkError);
    vi.stubGlobal('fetch', fetchMock);

    await expect(client.query('query { users { id } }')).rejects.toBe(networkError);
  });

  it('validates the endpoint URL and request arguments', async () => {
    expect(() => createGraphQLClient()).toThrow(/configuration/);
    expect(() => createGraphQLClient({ endpointURL: '' })).toThrow(/endpointURL/);
    expect(() => createGraphQLClient({ endpointURL: 'not a URL' })).toThrow(/absolute URL/);
    expect(() => createGraphQLClient({ endpointURL: 'ftp://example.test/graphql' })).toThrow(/HTTP or HTTPS/);

    const client = createGraphQLClient({ endpointURL: 'https://api.example.test/graphql' });
    await expect(client.query('')).rejects.toThrow(/document/);
    await expect(client.query('query { users { id } }', { variables: [] })).rejects.toThrow(/variables/);
  });
});

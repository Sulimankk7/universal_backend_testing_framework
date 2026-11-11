import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { once } from 'node:events';
import ResultCollector from '../../src/core/collection/result-collector.js';
import { TestResultSchema } from '../../src/core/contracts/test-result.schema.js';
import { createGraphQLAdapter } from '../../src/adapters/graphql/graphql-adapter.js';
import { createGraphQLClient } from '../../src/adapters/graphql/graphql-client.js';
import {
  assertDataValue,
  assertGraphQLErrorMessage,
  assertGraphQLErrors,
  assertHttpOk,
  assertHttpStatus,
  assertNoGraphQLErrors,
} from '../../src/adapters/graphql/assertions/graphql-assertions.js';
import { createGraphQLTestAdapter } from '../../src/adapters/graphql/graphql-test-adapter.js';
import { createGraphQLTestServer } from '../fixtures/graphql-test-server.js';

const TEST_FILE = 'tests/integration/graphql-adapter.integration.test.js';

describe('GraphQL Adapter HTTP integration', () => {
  let server;
  let graphql;
  let collector;
  let graphQLTests;
  let baseURL;

  beforeAll(async () => {
    server = createGraphQLTestServer();
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    baseURL = `http://127.0.0.1:${server.address().port}`;

    collector = new ResultCollector();
    graphQLTests = createGraphQLTestAdapter({ collector, testType: 'integration' });
    graphql = createGraphQLAdapter(createGraphQLClient({ endpointURL: `${baseURL}/graphql` }));
  });

  afterAll(async () => {
    if (!server?.listening) return;
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  async function record(name, callback, expectedStatus = 'passed') {
    const result = await graphQLTests.run({ name, file: TEST_FILE, callback });
    expect(TestResultSchema.safeParse(result).success).toBe(true);
    expect(result.source).toBe('graphql');
    expect(result.status).toBe(expectedStatus);
    expect(result.durationMs).toEqual(expect.any(Number));
    expect(result.durationMs).toBeGreaterThanOrEqual(0);

    const matchingResults = collector.getResults().filter(({ id }) => id === result.id);
    expect(matchingResults).toHaveLength(1);
    expect(matchingResults[0]).toMatchObject({
      id: result.id,
      name: result.name,
      status: result.status,
      errors: result.errors,
    });
    return result;
  }

  it('executes a real HTTP Query with GraphQL variables', async () => {
    const result = await record('fetches a user by variable', async () => {
      const response = await graphql.query(
        'query UserById($id: ID!) { user(id: $id) { id name } }',
        { variables: { id: 'user-1' } },
      );

      assertHttpStatus(response, 200);
      assertHttpOk(response);
      assertNoGraphQLErrors(response);
      assertDataValue(response, 'user.id', 'user-1');
      assertDataValue(response, 'user.name', 'Ada Lovelace');
    });

    expect(result.status).toBe('passed');
  });

  it('executes a real HTTP Mutation with variables and reads the created in-memory record', async () => {
    await record('creates a user in isolated memory', async () => {
      const response = await graphql.mutate(
        'mutation CreateUser($name: String!) { createUser(name: $name) { id name } }',
        { variables: { name: 'GraphQL Integration User' } },
      );
      assertHttpStatus(response, 200);
      assertHttpOk(response);
      assertNoGraphQLErrors(response);
      // The operation returns its created identifier for a follow-up query.
      const id = response.data?.createUser?.id;
      if (!id) throw new Error('Mutation did not return the created user ID.');

      const lookup = await graphql.query(
        'query UserById($id: ID!) { user(id: $id) { id name } }',
        { variables: { id } },
      );
      assertHttpOk(lookup);
      assertNoGraphQLErrors(lookup);
      assertDataValue(lookup, 'user.name', 'GraphQL Integration User');
    });
  });

  it('preserves and asserts intentional GraphQL resolver errors over HTTP', async () => {
    await record('reports a GraphQL resolver error', async () => {
      const response = await graphql.query('query TriggerError { explode }');

      assertHttpStatus(response, 200);
      assertHttpOk(response);
      assertGraphQLErrors(response);
      assertGraphQLErrorMessage(response, 'Intentional GraphQL test resolver error.');
    });
  });

  it('captures GraphQL assertion failures through GraphQL Test Adapter and ResultCollector', async () => {
    const result = await record('fails an incorrect GraphQL data assertion', async () => {
      const response = await graphql.query(
        'query UserById($id: ID!) { user(id: $id) { id } }',
        { variables: { id: 'user-1' } },
      );
      assertDataValue(response, 'user.id', 'unexpected-id');
    }, 'failed');

    expect(result.errors[0].name).toBe('AssertionError');
    expect(collector.getResults().find(({ id }) => id === result.id)
      .failureAnalysis[0].category).toBe('assertion_failure');
  });

  it('keeps HTTP 404 responses distinguishable from GraphQL errors and network failures', async () => {
    const missingEndpoint = createGraphQLAdapter(
      createGraphQLClient({ endpointURL: `${baseURL}/missing` }),
    );

    await record('handles an HTTP 404 response', async () => {
      const response = await missingEndpoint.query('query { users { id } }');
      assertHttpStatus(response, 404);
      assertGraphQLErrors(response);
      assertGraphQLErrorMessage(response, 'No GraphQL endpoint');
      expect(response.ok).toBe(false);
    });
  });
});

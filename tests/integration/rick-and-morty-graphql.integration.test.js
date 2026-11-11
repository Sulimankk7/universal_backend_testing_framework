import { describe, expect, it } from 'vitest';

import { createGraphQLAdapter } from '../../src/adapters/graphql/graphql-adapter.js';
import { createGraphQLClient } from '../../src/adapters/graphql/graphql-client.js';
import {
  assertDataProperty,
  assertDataValue,
  assertGraphQLErrorMessage,
  assertGraphQLErrors,
  assertHttpOk,
  assertHttpStatus,
  assertNoGraphQLErrors,
} from '../../src/adapters/graphql/assertions/graphql-assertions.js';
import { createGraphQLTestAdapter } from '../../src/adapters/graphql/graphql-test-adapter.js';
import ResultCollector from '../../src/core/collection/result-collector.js';
import { TestResultSchema } from '../../src/core/contracts/test-result.schema.js';

const ENDPOINT_URL = 'https://rickandmortyapi.com/graphql';
const TEST_FILE = 'tests/integration/rick-and-morty-graphql.integration.test.js';
const collector = new ResultCollector();
const graphqlTests = createGraphQLTestAdapter({ collector, testType: 'integration' });
const graphql = createGraphQLAdapter(createGraphQLClient({ endpointURL: ENDPOINT_URL }));
const scenarioResults = [];

describe('Rick and Morty external GraphQL integration', () => {
  async function recordScenario(name, callback) {
    const countBefore = collector.getResults().length;
    const result = await graphqlTests.run({ name, file: TEST_FILE, callback });
    const parseResult = TestResultSchema.safeParse(result);
    const collected = collector.getResults();

    expect(parseResult.success).toBe(true);
    expect(result.source).toBe('graphql');
    expect(collected).toHaveLength(countBefore + 1);
    expect(collected.filter(({ id }) => id === result.id)).toHaveLength(1);
    expect(collected.at(-1)).toMatchObject({
      id: result.id,
      name: result.name,
      status: result.status,
      errors: result.errors,
    });

    if (result.status !== 'passed') {
      const failure = result.errors.map(({ name: errorName, message }) => `${errorName}: ${message}`).join('; ');
      if (result.errors.some(({ name: errorName }) => errorName === 'ExternalGraphQLNetworkError')) {
        throw new Error(
          `Could not reach ${ENDPOINT_URL} while running "${name}". Check external network access and retry. ${failure}`,
        );
      }
      throw new Error(`External GraphQL scenario "${name}" failed: ${failure}`);
    }

    scenarioResults.push(result);
    return result;
  }

  it('fetches character 1 and verifies Rick Sanchez', async () => {
    await recordScenario('basic query returns Rick Sanchez', async () => {
      const response = await queryWithNetworkContext(
        'query BasicCharacter { character(id: 1) { id name } }',
      );

      assertHttpStatus(response, 200);
      assertHttpOk(response);
      assertNoGraphQLErrors(response);
      assertDataValue(response, 'character.id', '1');
      assertDataValue(response, 'character.name', 'Rick Sanchez');
    });
  });

  it('queries a character with a GraphQL variable', async () => {
    await recordScenario('variable query returns character 1', async () => {
      const response = await queryWithNetworkContext(
        'query CharacterById($id: ID!) { character(id: $id) { id name } }',
        { variables: { id: 1 } },
      );

      assertHttpStatus(response, 200);
      assertHttpOk(response);
      assertNoGraphQLErrors(response);
      assertDataValue(response, 'character.id', '1');
      assertDataValue(response, 'character.name', 'Rick Sanchez');
    });
  });

  it('returns nested origin and location fields', async () => {
    await recordScenario('nested character data includes origin and location', async () => {
      const response = await queryWithNetworkContext(
        'query CharacterLocations { character(id: 1) { id name origin { id name } location { id name } } }',
      );

      assertHttpStatus(response, 200);
      assertHttpOk(response);
      assertNoGraphQLErrors(response);
      assertDataValue(response, 'character.name', 'Rick Sanchez');
      for (const field of ['character.origin.id', 'character.origin.name', 'character.location.id', 'character.location.name']) {
        assertDataProperty(response, field);
      }
    });
  });

  it('detects and checks the message for an invalid GraphQL field', async () => {
    await recordScenario('invalid field is returned as a GraphQL validation error', async () => {
      const response = await queryWithNetworkContext(
        'query InvalidCharacterField { character(id: 1) { id fieldThatDoesNotExistForValidation } }',
      );

      // Validation errors are checked at the GraphQL layer; the external server
      // may choose an HTTP error status for an invalid document.
      assertGraphQLErrors(response);
      assertGraphQLErrorMessage(response, 'fieldThatDoesNotExistForValidation');
    });
  });

  it('records schema-valid GraphQL results once in ResultCollector', async () => {
    expect(scenarioResults).toHaveLength(4);
    const collected = collector.getResults();
    expect(collected).toHaveLength(4);
    expect(new Set(collected.map(({ id }) => id)).size).toBe(4);
    expect(collected.every(({ status }) => status === 'passed')).toBe(true);
    for (const result of scenarioResults) {
      expect(TestResultSchema.safeParse(result).success).toBe(true);
      expect(collected.filter(({ id }) => id === result.id)).toHaveLength(1);
    }
  });
});

async function queryWithNetworkContext(document, options) {
  try {
    return await graphql.query(document, options);
  } catch (cause) {
    const error = new Error(`HTTP request to ${ENDPOINT_URL} failed: ${cause?.message ?? String(cause)}`);
    error.name = 'ExternalGraphQLNetworkError';
    error.cause = cause;
    throw error;
  }
}

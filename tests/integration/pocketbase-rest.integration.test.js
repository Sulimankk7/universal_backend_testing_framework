import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { createRestAdapter } from '../../src/adapters/rest/rest-adapter.js';
import { createRestClient } from '../../src/adapters/rest/rest-client.js';
import {
  assertBodyProperty,
  assertBodyValue,
  assertNotOk,
  assertOk,
  assertStatus,
  assertValidJSON,
} from '../../src/adapters/rest/assertions/response-assertions.js';
import { createRestTestAdapter } from '../../src/adapters/rest/rest-test-adapter.js';
import ResultCollector from '../../src/core/collection/result-collector.js';
import { TestResultSchema } from '../../src/core/contracts/test-result.schema.js';

const API_BASE_URL = 'http://127.0.0.1:8090';
const RECORDS_PATH = 'api/collections/products/records';
const TEST_FILE = 'tests/integration/pocketbase-rest.integration.test.js';

describe('PocketBase REST integration', () => {
  it('validates public products REST operations and collects each logical result once', async () => {
    const collector = new ResultCollector();
    const restTests = createRestTestAdapter({ collector, testType: 'integration' });
    const rest = createRestAdapter(createRestClient({ baseURL: API_BASE_URL }));
    const uniqueName = `Framework validation ${randomUUID()}`;
    const createPayload = { Name: uniqueName, price: 18.75, stock: 12 };
    const updatePayload = { Name: `${uniqueName} updated`, price: 22.5, stock: 7 };
    const logicalResults = [];
    let createdRecordId;
    let deletedRecordId;
    let originalError;
    let cleanupError;

    async function runRestCase(name, callback, expectedStatus = 'passed') {
      const countBefore = collector.getResults().length;
      const result = await restTests.run({ name, file: TEST_FILE, callback });
      const collected = collector.getResults();

      expect(TestResultSchema.safeParse(result).success).toBe(true);
      expect(result.source).toBe('rest');
      expect(collected).toHaveLength(countBefore + 1);
      expect(collected.filter(({ id }) => id === result.id)).toHaveLength(1);
      expect(collected.at(-1)).toMatchObject({
        id: result.id,
        name: result.name,
        status: result.status,
        errors: result.errors,
      });
      expect(result.status).toBe(expectedStatus);
      logicalResults.push(result);
      return result;
    }

    try {
      await runRestCase('GET products records returns a collection page', async () => {
        const response = await rest.get(RECORDS_PATH);
        assertJSONResponse(response, 200);
        assertBodyProperty(response, 'items');
        if (!Array.isArray(response.body.items)) {
          throw new Error('PocketBase products list response did not contain an items array.');
        }
        if (response.body.items.length > 0) {
          for (const field of ['id', 'Name', 'price', 'stock']) {
            assertBodyProperty(response, `items.0.${field}`);
          }
        }
      });

      await runRestCase('POST creates a uniquely named product', async () => {
        const response = await rest.post(RECORDS_PATH, createPayload);
        if (response.body && typeof response.body === 'object') {
          createdRecordId = response.body.id;
        }
        assertJSONResponse(response, 200);
        assertBodyProperty(response, 'id');
        assertBodyValue(response, 'Name', createPayload.Name);
        assertBodyValue(response, 'price', createPayload.price);
        assertBodyValue(response, 'stock', createPayload.stock);
      });

      if (!createdRecordId) {
        throw new Error('PocketBase create response did not provide a record ID; subsequent record checks cannot proceed.');
      }

      await runRestCase('GET by ID retrieves the created product', async () => {
        const response = await rest.get(`${RECORDS_PATH}/${createdRecordId}`);
        assertJSONResponse(response, 200);
        assertBodyValue(response, 'id', createdRecordId);
        assertBodyValue(response, 'Name', createPayload.Name);
        assertBodyValue(response, 'price', createPayload.price);
        assertBodyValue(response, 'stock', createPayload.stock);
      });

      await runRestCase('PATCH updates the created product', async () => {
        const response = await rest.patch(`${RECORDS_PATH}/${createdRecordId}`, updatePayload);
        assertJSONResponse(response, 200);
        assertBodyValue(response, 'id', createdRecordId);
        assertBodyValue(response, 'Name', updatePayload.Name);
        assertBodyValue(response, 'price', updatePayload.price);
        assertBodyValue(response, 'stock', updatePayload.stock);
      });

      await runRestCase('DELETE removes the created product', async () => {
        const response = await rest.delete(`${RECORDS_PATH}/${createdRecordId}`);
        assertStatus(response, 204);
        assertOk(response);
        if (response.body !== null) throw new Error('Expected PocketBase DELETE to return an empty 204 response.');
        deletedRecordId = createdRecordId;
        createdRecordId = undefined;
      });

      await runRestCase('GET by ID returns 404 after deletion', async () => {
        // The deleted ID is retained separately so this check never looks up another record.
        const response = await rest.get(`${RECORDS_PATH}/${deletedRecordId}`);
        assertJSONResponse(response, 404);
      });

      await runRestCase('POST with a missing required field returns HTTP 400', async () => {
        const response = await rest.post(RECORDS_PATH, {
          Name: `Invalid ${randomUUID()}`,
          price: 4,
          // stock is required by the supplied PocketBase collection schema.
        });
        assertStatus(response, 400);
        assertNotOk(response);
        assertValidJSON(response);
      });

      const failureProbe = await runRestCase(
        'framework records an assertion failure from a real HTTP response',
        async () => {
          const response = await rest.get(RECORDS_PATH);
          assertJSONResponse(response, 200);
          assertStatus(response, 418);
        },
        'failed',
      );
      expect(failureProbe.errors[0]?.name).toBe('AssertionError');
      const analyzedFailure = collector.getResults().find(({ id }) => id === failureProbe.id);
      expect(analyzedFailure.failureAnalysis).toHaveLength(1);
      expect(analyzedFailure.failureAnalysis[0].category).toBe('assertion_failure');
    } catch (error) {
      originalError = error;
    } finally {
      if (createdRecordId) {
        try {
          const response = await rest.delete(`${RECORDS_PATH}/${createdRecordId}`);
          if (response.status !== 204 && response.status !== 404) {
            throw new Error(`Cleanup DELETE returned HTTP ${response.status} for test-owned record ${createdRecordId}.`);
          }
        } catch (error) {
          cleanupError = error;
        }
      }
    }

    if (originalError && cleanupError) {
      throw new AggregateError([originalError, cleanupError], 'PocketBase scenario failed and cleanup also failed.');
    }
    if (originalError) throw originalError;
    if (cleanupError) throw cleanupError;

    const collected = collector.getResults();
    expect(collected).toHaveLength(logicalResults.length);
    expect(new Set(collected.map(({ id }) => id)).size).toBe(collected.length);
    expect(collected.some(({ status }) => status === 'passed')).toBe(true);
    expect(collected.some(({ status }) => status === 'failed')).toBe(true);
  }, 45_000);
});

function assertJSONResponse(response, expectedStatus) {
  assertStatus(response, expectedStatus);
  if (response.ok) assertOk(response);
  else assertNotOk(response);
  assertValidJSON(response);
}

import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import ResultCollector from '../../src/core/collection/result-collector.js';
import { TestResultSchema } from '../../src/core/contracts/test-result.schema.js';
import { createRestAdapter } from '../../src/adapters/rest/rest-adapter.js';
import { createRestClient } from '../../src/adapters/rest/rest-client.js';
import {
  assertBodyProperty,
  assertBodyValue,
  assertHeaderValue,
  assertNotOk,
  assertOk,
  assertStatus,
  assertValidJSON,
} from '../../src/adapters/rest/assertions/response-assertions.js';
import { createRestTestAdapter } from '../../src/adapters/rest/rest-test-adapter.js';

const API_BASE_URL = 'http://localhost:3000/api';
const TEST_FILE = 'tests/integration/shared-table-rest.integration.test.js';

describe('Shared Table PostgreSQL REST CRUD integration', () => {
  // This single Vitest case is only a harness. Logical REST operations are
  // collected once by RestTestAdapter, using the dedicated integration config.
  it('validates users and products CRUD and collects each REST result once', async () => {
    const collector = new ResultCollector();
    const restTests = createRestTestAdapter({ collector, testType: 'integration' });
    const rest = createRestAdapter(createRestClient({ baseURL: API_BASE_URL }));
    const token = randomUUID();

    // Payload fields and lengths follow the supplied PostgreSQL DDL.
    const userCreate = {
      name: `REST Test ${token}`,
      email: `rest-${token}@example.test`,
      age: 37,
    };
    const userUpdate = {
      name: `REST Updated ${token}`,
      email: `rest-updated-${token}@example.test`,
      age: 38,
    };
    const productCreate = {
      name: `REST Product ${token}`,
      price: 19.95,
      category: `REST ${token}`,
      stock: 17,
    };
    const productUpdate = {
      name: `REST Product Updated ${token}`,
      price: 24.5,
      category: `REST Updated ${token}`,
      stock: 23,
    };

    let userPostAttempted = false;
    let productPostAttempted = false;
    let userId;
    let productId;
    let userAbsenceConfirmed = false;
    let productAbsenceConfirmed = false;
    const logicalResults = [];

    async function runRestCase(name, callback, { status = 'passed', errorName } = {}) {
      const countBefore = collector.getResults().length;
      const result = await restTests.run({ name, file: TEST_FILE, callback });
      const collected = collector.getResults();

      expect(TestResultSchema.safeParse(result).success).toBe(true);
      expect(collected).toHaveLength(countBefore + 1);
      expect(collected.filter((entry) => entry.id === result.id)).toHaveLength(1);
      expect(result.source).toBe('rest');

      if (result.status !== status) {
        const details = result.errors.map(({ name: error, message }) => `${error}: ${message}`).join('; ');
        throw new Error(
          `REST case "${name}" expected ${status} but got ${result.status}${details ? ` (${details})` : ''}. ` +
          `Confirm the Shared Table API is running at ${API_BASE_URL} and its PostgreSQL DATABASE_URL and tables are configured.`,
        );
      }

      expect(result.status).toBe(status);
      expect(collected.find((entry) => entry.id === result.id)).toMatchObject({
        name: result.name,
        status: result.status,
        errors: result.errors,
      });
      if (errorName) expect(result.errors[0]?.name).toBe(errorName);
      logicalResults.push(result);
      return result;
    }

    const cleanupOwnedRecord = async ({ resource, id, lookupKey, lookupValue, setAbsent }) => {
      let targetId = id;
      if (targetId === undefined || targetId === null) {
        await runRestCase(`cleanup locates the dedicated ${resource} record`, async () => {
          const response = await rest.get(`/${resource}`);
          assertJSONResponse(response, 200);
          if (!Array.isArray(response.body)) {
            throw new Error(`GET /api/${resource} did not return an array during cleanup.`);
          }
          const matches = response.body.filter((record) => record[lookupKey] === lookupValue);
          if (matches.length > 1) {
            throw new Error(`More than one ${resource} record matched the unique test value; cleanup stopped to avoid deleting the wrong record.`);
          }
          targetId = matches[0]?.id;
          if (targetId === undefined || targetId === null) setAbsent(true);
        });
      }

      if (targetId === undefined || targetId === null) return;

      await runRestCase(`cleanup deletes the dedicated ${resource} record`, async () => {
        const response = await rest.delete(`/${resource}/${targetId}`);
        if (response.status === 404) return;
        assertStatus(response, 204);
        assertOk(response);
      });

      await runRestCase(`cleanup verifies the ${resource} record is absent`, async () => {
        const response = await rest.get(`/${resource}/${targetId}`);
        assertJSONResponse(response, 404);
        assertBodyValue(response, 'message', 'Item not found');
      });
      setAbsent(true);
    };

    try {
      await runRestCase('GET /api/users returns a user list', async () => {
        const response = await rest.get('/users');
        assertJSONResponse(response, 200);
        if (!Array.isArray(response.body)) throw new Error('GET /api/users did not return an array.');
        if (response.body.length > 0) {
          for (const field of ['id', 'name', 'email', 'age']) assertBodyProperty(response, `0.${field}`);
        }
      });

      await runRestCase('GET /api/products returns a product list', async () => {
        const response = await rest.get('/products');
        assertJSONResponse(response, 200);
        if (!Array.isArray(response.body)) throw new Error('GET /api/products did not return an array.');
        if (response.body.length > 0) {
          for (const field of ['id', 'name', 'price', 'category', 'stock']) assertBodyProperty(response, `0.${field}`);
        }
      });

      await runRestCase('POST /api/users rejects an empty body with 400', async () => {
        const response = await rest.post('/users', {});
        assertJSONResponse(response, 400);
        assertBodyValue(response, 'message', 'Request body is required');
      });

      await runRestCase('POST /api/products rejects an empty body with 400', async () => {
        const response = await rest.post('/products', {});
        assertJSONResponse(response, 400);
        assertBodyValue(response, 'message', 'Request body is required');
      });

      await runRestCase('PUT /api/users/-1 rejects an empty body with 400', async () => {
        const response = await rest.put('/users/-1', {});
        assertJSONResponse(response, 400);
        assertBodyValue(response, 'message', 'Request body is required');
      });

      await runRestCase('PUT /api/products/-1 rejects an empty body with 400', async () => {
        const response = await rest.put('/products/-1', {});
        assertJSONResponse(response, 400);
        assertBodyValue(response, 'message', 'Request body is required');
      });

      await runRestCase('GET /api/users/-1 returns 404', async () => {
        const response = await rest.get('/users/-1');
        assertJSONResponse(response, 404);
        assertBodyValue(response, 'message', 'Item not found');
      });

      await runRestCase('GET /api/products/-1 returns 404', async () => {
        const response = await rest.get('/products/-1');
        assertJSONResponse(response, 404);
        assertBodyValue(response, 'message', 'Item not found');
      });

      await runRestCase('PUT /api/users/-1 returns 404 for a missing record', async () => {
        const response = await rest.put('/users/-1', userCreate);
        assertJSONResponse(response, 404);
        assertBodyValue(response, 'message', 'Item not found');
      });

      await runRestCase('PUT /api/products/-1 returns 404 for a missing record', async () => {
        const response = await rest.put('/products/-1', productCreate);
        assertJSONResponse(response, 404);
        assertBodyValue(response, 'message', 'Item not found');
      });

      await runRestCase('DELETE /api/users/-1 returns 404 for a missing record', async () => {
        const response = await rest.delete('/users/-1');
        assertJSONResponse(response, 404);
        assertBodyValue(response, 'message', 'Item not found');
      });

      await runRestCase('DELETE /api/products/-1 returns 404 for a missing record', async () => {
        const response = await rest.delete('/products/-1');
        assertJSONResponse(response, 404);
        assertBodyValue(response, 'message', 'Item not found');
      });

      await runRestCase('GET /api/unknown returns 404', async () => {
        const response = await rest.get('/unknown');
        assertJSONResponse(response, 404);
        assertBodyValue(response, 'message', 'Resource not found');
      });

      const expectedAssertionFailure = await runRestCase(
        'an incorrect expected status becomes a failed REST result',
        async () => {
          const response = await rest.get('/users');
          assertStatus(response, 201);
        },
        { status: 'failed', errorName: 'AssertionError' },
      );
      expect(expectedAssertionFailure.errors[0].message).toContain('expected 200 to be 201');
      const failedEntry = collector.getResults().find((entry) => entry.id === expectedAssertionFailure.id);
      expect(failedEntry.errors[0]).toMatchObject(expectedAssertionFailure.errors[0]);
      expect(failedEntry.failureAnalysis[0].category).toBe('assertion_failure');

      const createUser = await runRestCase('POST /api/users creates a dedicated user', async () => {
        userPostAttempted = true;
        const response = await rest.post('/users', userCreate);
        if (response.body && typeof response.body === 'object') userId = response.body.id;
        assertJSONResponse(response, 201);
        assertBodyProperty(response, 'id');
        assertBodyValue(response, 'name', userCreate.name);
        assertBodyValue(response, 'email', userCreate.email);
        assertBodyValue(response, 'age', userCreate.age);
        assertGeneratedId(userId, 'user');
      });
      expect(createUser.status).toBe('passed');

      await runRestCase('GET /api/users/:id retrieves the created user', async () => {
        const response = await rest.get(`/users/${userId}`);
        assertJSONResponse(response, 200);
        assertBodyValue(response, 'id', userId);
        assertBodyValue(response, 'name', userCreate.name);
        assertBodyValue(response, 'email', userCreate.email);
        assertBodyValue(response, 'age', userCreate.age);
      });

      await runRestCase('PUT /api/users/:id updates only the created user', async () => {
        const response = await rest.put(`/users/${userId}`, userUpdate);
        assertJSONResponse(response, 200);
        assertBodyValue(response, 'id', userId);
        assertBodyValue(response, 'name', userUpdate.name);
        assertBodyValue(response, 'email', userUpdate.email);
        assertBodyValue(response, 'age', userUpdate.age);
      });

      await runRestCase('GET /api/users/:id returns the updated user', async () => {
        const response = await rest.get(`/users/${userId}`);
        assertJSONResponse(response, 200);
        assertBodyValue(response, 'id', userId);
        assertBodyValue(response, 'name', userUpdate.name);
        assertBodyValue(response, 'email', userUpdate.email);
        assertBodyValue(response, 'age', userUpdate.age);
      });

      const createProduct = await runRestCase('POST /api/products creates a dedicated product', async () => {
        productPostAttempted = true;
        const response = await rest.post('/products', productCreate);
        if (response.body && typeof response.body === 'object') productId = response.body.id;
        assertJSONResponse(response, 201);
        assertBodyProperty(response, 'id');
        assertBodyValue(response, 'name', productCreate.name);
        assertNumericBodyValue(response, 'price', productCreate.price);
        assertBodyValue(response, 'category', productCreate.category);
        assertBodyValue(response, 'stock', productCreate.stock);
        assertGeneratedId(productId, 'product');
      });
      expect(createProduct.status).toBe('passed');

      await runRestCase('GET /api/products/:id retrieves the created product', async () => {
        const response = await rest.get(`/products/${productId}`);
        assertJSONResponse(response, 200);
        assertBodyValue(response, 'id', productId);
        assertBodyValue(response, 'name', productCreate.name);
        assertNumericBodyValue(response, 'price', productCreate.price);
        assertBodyValue(response, 'category', productCreate.category);
        assertBodyValue(response, 'stock', productCreate.stock);
      });

      await runRestCase('PUT /api/products/:id updates only the created product', async () => {
        const response = await rest.put(`/products/${productId}`, productUpdate);
        assertJSONResponse(response, 200);
        assertBodyValue(response, 'id', productId);
        assertBodyValue(response, 'name', productUpdate.name);
        assertNumericBodyValue(response, 'price', productUpdate.price);
        assertBodyValue(response, 'category', productUpdate.category);
        assertBodyValue(response, 'stock', productUpdate.stock);
      });

      await runRestCase('GET /api/products/:id returns the updated product', async () => {
        const response = await rest.get(`/products/${productId}`);
        assertJSONResponse(response, 200);
        assertBodyValue(response, 'id', productId);
        assertBodyValue(response, 'name', productUpdate.name);
        assertNumericBodyValue(response, 'price', productUpdate.price);
        assertBodyValue(response, 'category', productUpdate.category);
        assertBodyValue(response, 'stock', productUpdate.stock);
      });

      await runRestCase('DELETE /api/users/:id deletes only the created user', async () => {
        const response = await rest.delete(`/users/${userId}`);
        assertStatus(response, 204);
        assertOk(response);
        if (response.body !== null) throw new Error('Expected a 204 response with an empty body.');
      });

      await runRestCase('GET confirms the created user was deleted', async () => {
        const response = await rest.get(`/users/${userId}`);
        assertJSONResponse(response, 404);
        assertBodyValue(response, 'message', 'Item not found');
        userAbsenceConfirmed = true;
      });

      await runRestCase('DELETE /api/products/:id deletes only the created product', async () => {
        const response = await rest.delete(`/products/${productId}`);
        assertStatus(response, 204);
        assertOk(response);
        if (response.body !== null) throw new Error('Expected a 204 response with an empty body.');
      });

      await runRestCase('GET confirms the created product was deleted', async () => {
        const response = await rest.get(`/products/${productId}`);
        assertJSONResponse(response, 404);
        assertBodyValue(response, 'message', 'Item not found');
        productAbsenceConfirmed = true;
      });
    } finally {
      const cleanupErrors = [];
      if (userPostAttempted && !userAbsenceConfirmed) {
        try {
          await cleanupOwnedRecord({
            resource: 'users',
            id: userId,
            lookupKey: 'email',
            lookupValue: userCreate.email,
            setAbsent: (value) => { userAbsenceConfirmed = value; },
          });
        } catch (error) {
          cleanupErrors.push(`user ${userCreate.email}: ${error.message}`);
        }
      }
      if (productPostAttempted && !productAbsenceConfirmed) {
        try {
          await cleanupOwnedRecord({
            resource: 'products',
            id: productId,
            lookupKey: 'name',
            lookupValue: productCreate.name,
            setAbsent: (value) => { productAbsenceConfirmed = value; },
          });
        } catch (error) {
          cleanupErrors.push(`product ${productCreate.name}: ${error.message}`);
        }
      }
      if (cleanupErrors.length > 0) {
        throw new Error(
          `Shared Table cleanup failed: ${cleanupErrors.join(' | ')}. A test record may remain in PostgreSQL.`,
        );
      }
    }

    const collected = collector.getResults();
    expect(collected).toHaveLength(logicalResults.length);
    expect(new Set(collected.map((result) => result.id)).size).toBe(collected.length);
    expect(collected.some((result) => result.status === 'passed')).toBe(true);
    expect(collected.some((result) => result.status === 'failed')).toBe(true);
  }, 60_000);
});

function assertJSONResponse(response, expectedStatus) {
  assertStatus(response, expectedStatus);
  if (response.ok) assertOk(response);
  else assertNotOk(response);
  assertHeaderValue(response, 'content-type', 'application/json; charset=utf-8');
  assertValidJSON(response);
}

function assertGeneratedId(id, resource) {
  if (!Number.isInteger(id) || id < 1) {
    throw new Error(`POST /api/${resource} did not return a positive generated integer ID.`);
  }
}

function assertNumericBodyValue(response, property, expectedValue) {
  assertBodyProperty(response, property);
  const actualValue = Number(response.body[property]);
  if (!Number.isFinite(actualValue) || actualValue !== expectedValue) {
    throw new Error(`Expected ${property} to equal ${expectedValue}, received ${response.body[property]}.`);
  }
}

import { randomUUID } from 'node:crypto';

import { createRestAdapter } from '../src/adapters/rest/rest-adapter.js';
import { createRestClient } from '../src/adapters/rest/rest-client.js';
import {
  assertBodyProperty,
  assertBodyValue,
  assertNotOk,
  assertOk,
  assertStatus,
  assertValidJSON,
} from '../src/adapters/rest/assertions/response-assertions.js';
import { createRestTestAdapter } from '../src/adapters/rest/rest-test-adapter.js';
import ResultCollector from '../src/core/collection/result-collector.js';
import { TestResultSchema } from '../src/core/contracts/test-result.schema.js';

const API_BASE_URL = 'http://127.0.0.1:8090';
const RECORDS_PATH = 'api/collections/products/records';
const SCRIPT_FILE = 'scripts/pocketbase-standalone-validation.js';

async function main() {
  const collector = new ResultCollector();
  const restTests = createRestTestAdapter({ collector, testType: 'integration' });
  const rest = createRestAdapter(createRestClient({ baseURL: API_BASE_URL }));
  const uniqueName = `Standalone validation ${randomUUID()}`;
  const createPayload = { Name: uniqueName, price: 18.75, stock: 12 };
  const updatePayload = { Name: `${uniqueName} updated`, price: 22.5, stock: 7 };
  const scenarioOutcomes = [];
  let createdRecordId;
  let deletedRecordId;
  let originalFailure;
  let cleanupFailure;
  let failureAnalyzerVerified = false;

  async function runScenario(name, callback, expectedStatus = 'passed') {
    const result = await restTests.run({ name, file: SCRIPT_FILE, callback });
    TestResultSchema.parse(result);

    const matchingEntries = collector.getResults().filter(({ id }) => id === result.id);
    if (matchingEntries.length !== 1) {
      throw new Error(`Expected exactly one collected result for "${name}"; found ${matchingEntries.length}.`);
    }

    scenarioOutcomes.push({ name, status: result.status, expectedStatus });
    if (result.status !== expectedStatus) {
      throw new Error(
        `Scenario "${name}" expected status ${expectedStatus}, received ${result.status}: ` +
        result.errors.map(({ message }) => message).join('; '),
      );
    }

    return { result, reportEntry: matchingEntries[0] };
  }

  try {
    await runScenario('GET products collection', async () => {
      const response = await rest.get(RECORDS_PATH);
      assertJSONResponse(response, 200);
      assertBodyProperty(response, 'items');
      if (!Array.isArray(response.body.items)) {
        throw new Error('PocketBase list response did not contain an items array.');
      }
    });

    await runScenario('POST creates a unique product', async () => {
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
      throw new Error('The create response did not return a record ID; record-specific scenarios cannot continue.');
    }

    await runScenario('GET retrieves the created product by ID', async () => {
      const response = await rest.get(`${RECORDS_PATH}/${createdRecordId}`);
      assertJSONResponse(response, 200);
      assertBodyValue(response, 'id', createdRecordId);
      assertBodyValue(response, 'Name', createPayload.Name);
      assertBodyValue(response, 'price', createPayload.price);
      assertBodyValue(response, 'stock', createPayload.stock);
    });

    await runScenario('PATCH updates the created product', async () => {
      const response = await rest.patch(`${RECORDS_PATH}/${createdRecordId}`, updatePayload);
      assertJSONResponse(response, 200);
      assertBodyValue(response, 'id', createdRecordId);
      assertBodyValue(response, 'Name', updatePayload.Name);
      assertBodyValue(response, 'price', updatePayload.price);
      assertBodyValue(response, 'stock', updatePayload.stock);
    });

    await runScenario('DELETE removes the created product', async () => {
      const response = await rest.delete(`${RECORDS_PATH}/${createdRecordId}`);
      assertStatus(response, 204);
      assertOk(response);
      if (response.body !== null) throw new Error('Expected an empty HTTP 204 response from PocketBase.');
      deletedRecordId = createdRecordId;
      createdRecordId = undefined;
    });

    await runScenario('GET of the deleted product returns 404', async () => {
      const response = await rest.get(`${RECORDS_PATH}/${deletedRecordId}`);
      assertJSONResponse(response, 404);
    });

    const failureProbe = await runScenario(
      'FailureAnalyzer classifies a deliberate assertion failure',
      async () => {
        const response = await rest.get(RECORDS_PATH);
        assertJSONResponse(response, 200);
        assertStatus(response, 418);
      },
      'failed',
    );

    if (failureProbe.result.errors[0]?.name !== 'AssertionError') {
      throw new Error('The deliberate failure was not recorded as an AssertionError.');
    }
    if (failureProbe.reportEntry.failureAnalysis[0]?.category !== 'assertion_failure') {
      throw new Error('ResultCollector did not attach the expected FailureAnalyzer classification.');
    }
    failureAnalyzerVerified = true;
  } catch (error) {
    originalFailure = error;
  } finally {
    if (createdRecordId) {
      try {
        const response = await rest.delete(`${RECORDS_PATH}/${createdRecordId}`);
        if (response.status !== 204 && response.status !== 404) {
          throw new Error(`Cleanup returned HTTP ${response.status} for test-owned record ${createdRecordId}.`);
        }
      } catch (error) {
        cleanupFailure = error;
      }
    }
  }

  const collectedResults = collector.getResults();
  printSummary({ collectedResults, scenarioOutcomes, failureAnalyzerVerified });

  if (originalFailure && cleanupFailure) {
    throw new AggregateError(
      [originalFailure, cleanupFailure],
      'Standalone PocketBase validation failed, and cleanup also failed.',
    );
  }
  if (originalFailure) throw originalFailure;
  if (cleanupFailure) throw cleanupFailure;

  if (!failureAnalyzerVerified) {
    throw new Error('FailureAnalyzer verification did not complete.');
  }
}

function assertJSONResponse(response, expectedStatus) {
  assertStatus(response, expectedStatus);
  if (response.ok) assertOk(response);
  else assertNotOk(response);
  assertValidJSON(response);
}

function printSummary({ collectedResults, scenarioOutcomes, failureAnalyzerVerified }) {
  const passed = collectedResults.filter(({ status }) => status === 'passed').length;
  const failed = collectedResults.filter(({ status }) => status === 'failed').length;

  console.log('\nPocketBase standalone validation summary');
  console.log(`Backend: ${API_BASE_URL}`);
  console.log(`Collection endpoint: /${RECORDS_PATH}`);
  console.log(`Scenarios recorded: ${scenarioOutcomes.length}`);
  console.log(`Passed results: ${passed}`);
  console.log(`Failed results: ${failed} (the deliberate assertion failure is expected)`);
  console.log(`FailureAnalyzer verified: ${failureAnalyzerVerified ? 'yes' : 'no'}`);
  console.log('\nScenario statuses:');
  for (const { name, status, expectedStatus } of scenarioOutcomes) {
    console.log(`- ${status === expectedStatus ? 'OK' : 'UNEXPECTED'}: ${name} — ${status}`);
  }

  console.log('\nCollected normalized results (including FailureAnalyzer output):');
  console.log(JSON.stringify(collectedResults, null, 2));
}

main().catch((error) => {
  console.error('\nStandalone validation error:');
  if (error instanceof AggregateError) {
    for (const [index, cause] of error.errors.entries()) {
      console.error(`${index + 1}. ${cause?.stack ?? cause}`);
    }
  } else {
    console.error(error?.stack ?? error);
  }
  process.exitCode = 1;
});

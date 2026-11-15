import { describe, expect, it } from 'vitest';
import * as publicApi from 'universal-backend-testing-framework';

import UniversalReporter from '../../src/adapters/vitest/vitest-reporter.js';
import ResultCollector from '../../src/core/collection/result-collector.js';
import { TestErrorSchema, TestResultSchema } from '../../src/core/contracts/test-result.schema.js';
import { analyzeFailure } from '../../src/core/analysis/failure-analyzer.js';
import { renderHtmlReport, writeHtmlReport } from '../../src/reporting/html/html-report.js';
import { createRestClient } from '../../src/adapters/rest/rest-client.js';
import { createRestAdapter, normalizeResponse } from '../../src/adapters/rest/rest-adapter.js';
import { createRestTestAdapter } from '../../src/adapters/rest/rest-test-adapter.js';
import { createGraphQLClient } from '../../src/adapters/graphql/graphql-client.js';
import { createGraphQLAdapter, normalizeGraphQLResponse } from '../../src/adapters/graphql/graphql-adapter.js';
import { createGraphQLTestAdapter } from '../../src/adapters/graphql/graphql-test-adapter.js';

describe('package public API', () => {
  it('resolves the package name to its root ES module entry point', () => {
    expect(Object.keys(publicApi).sort()).toEqual([
      'ResultCollector',
      'TestErrorSchema',
      'TestResultSchema',
      'UniversalReporter',
      'analyzeFailure',
      'createGraphQLAdapter',
      'createGraphQLClient',
      'createGraphQLTestAdapter',
      'createRestAdapter',
      'createRestClient',
      'createRestTestAdapter',
      'normalizeGraphQLResponse',
      'normalizeResponse',
      'renderHtmlReport',
      'writeHtmlReport',
    ]);
  });

  it('re-exports the supported implementations without wrappers', () => {
    expect(publicApi.UniversalReporter).toBe(UniversalReporter);
    expect(publicApi.ResultCollector).toBe(ResultCollector);
    expect(publicApi.TestErrorSchema).toBe(TestErrorSchema);
    expect(publicApi.TestResultSchema).toBe(TestResultSchema);
    expect(publicApi.analyzeFailure).toBe(analyzeFailure);
    expect(publicApi.renderHtmlReport).toBe(renderHtmlReport);
    expect(publicApi.writeHtmlReport).toBe(writeHtmlReport);
    expect(publicApi.createRestClient).toBe(createRestClient);
    expect(publicApi.createRestAdapter).toBe(createRestAdapter);
    expect(publicApi.normalizeResponse).toBe(normalizeResponse);
    expect(publicApi.createRestTestAdapter).toBe(createRestTestAdapter);
    expect(publicApi.createGraphQLClient).toBe(createGraphQLClient);
    expect(publicApi.createGraphQLAdapter).toBe(createGraphQLAdapter);
    expect(publicApi.normalizeGraphQLResponse).toBe(normalizeGraphQLResponse);
    expect(publicApi.createGraphQLTestAdapter).toBe(createGraphQLTestAdapter);
  });
});

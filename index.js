/**
 * Supported package entry point for Universal Backend Testing Framework.
 * Import from this module to use the stable, documented public API.
 */
export { default as UniversalReporter } from './src/adapters/vitest/vitest-reporter.js';
export { createRestClient } from './src/adapters/rest/rest-client.js';
export { createRestAdapter, normalizeResponse } from './src/adapters/rest/rest-adapter.js';
export { createRestTestAdapter } from './src/adapters/rest/rest-test-adapter.js';
export { createGraphQLClient } from './src/adapters/graphql/graphql-client.js';
export { createGraphQLAdapter, normalizeGraphQLResponse } from './src/adapters/graphql/graphql-adapter.js';
export { createGraphQLTestAdapter } from './src/adapters/graphql/graphql-test-adapter.js';
export { default as ResultCollector } from './src/core/collection/result-collector.js';
export { analyzeFailure } from './src/core/analysis/failure-analyzer.js';
export { TestErrorSchema, TestResultSchema } from './src/core/contracts/test-result.schema.js';
export { renderHtmlReport, writeHtmlReport } from './src/reporting/html/html-report.js';

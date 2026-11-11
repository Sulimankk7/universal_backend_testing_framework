import ResultCollector from '../src/core/collection/result-collector.js';
import { writeHtmlReport } from '../src/reporting/html/html-report.js';

const collector = new ResultCollector();
const missingProductResponse = {
  status: 404,
  statusText: 'Not Found',
  ok: false,
};
const scenarios = [
  {
    name: 'Assertion failure: product price matches expected value',
    error: Object.assign(new Error('expected 19.99 to be 24.99'), { name: 'AssertionError' }),
  },
  {
    name: 'HTTP error: product endpoint returns success',
    error: Object.assign(
      new Error(`Simulated API response: HTTP ${missingProductResponse.status} ${missingProductResponse.statusText}`),
      { name: 'HttpError' },
    ),
  },
  {
    name: 'Runtime error: response body is available',
    error: new TypeError("Cannot read properties of undefined (reading 'body')"),
  },
];

for (const [index, { name, error }] of scenarios.entries()) {
  collector.collect({
    id: `html-error-demo-${index + 1}`,
    name,
    fullName: name,
    file: 'scripts/html-error-demo.js',
    testType: 'demonstration',
    source: 'standalone-demo',
    status: 'failed',
    durationMs: 1,
    errors: [{ name: error.name, message: error.message, stack: error.stack }],
  });
}

const outputPath = await writeHtmlReport(collector.getResults(), {
  outputPath: 'reports/error-demo-report.html',
});
console.log(`Generated isolated error demonstration report: ${outputPath}`);

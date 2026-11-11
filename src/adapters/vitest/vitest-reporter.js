
import ResultCollector from '../../core/collection/result-collector.js';
import { mapVitestTestCase } from './vitest-adapter.js';

/** Vitest lifecycle bridge into the framework's normalized core. */
export default class UniversalReporter {
  /** @param {{ collector?: ResultCollector, testType?: string, report?: (results: object[]) => void }} options */
  constructor({ collector = new ResultCollector(), testType = 'unit', report = null } = {}) {
    this.collector = collector;
    this.testType = testType;
    this.report = report;
  }

  /** Begin a new run by clearing prior normalized results. */
  onTestRunStart() {
    this.collector.reset();

    console.log('\n[Universal Framework] Test run started');
  }

  /** Adapt one Vitest test case and submit its normalized result to core. */
  onTestCaseResult(testCase) {
    const normalizedResult = mapVitestTestCase(testCase, { testType: this.testType });
    this.collector.collect(normalizedResult);
  }

  /** Emit the collected report and call the optional reporting hook. */
  onTestRunEnd() {
    const results = this.collector.getResults();

    console.log('\n[Universal Framework] Test run completed');
    console.log(`Captured results: ${results.length}`);
    console.log(JSON.stringify(results, null, 2));
    this.report?.(results);
  }
}

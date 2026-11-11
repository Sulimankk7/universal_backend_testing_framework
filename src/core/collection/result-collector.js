
import { TestResultSchema } from '../contracts/test-result.schema.js';
import { analyzeFailure } from '../analysis/failure-analyzer.js';

/** Stores validated normalized results and attaches generic failure analysis. */
export default class ResultCollector {
  constructor() {
    this.results = [];
  }

  /** Remove all results from the current collection. */
  reset() {
    this.results = [];
  }

  /** Validate, analyze, and store one normalized result.
   * @param {import('../contracts/test-result.schema.js').TestResult} result
   */
  collect(result) {
    const normalizedResult = TestResultSchema.parse(result);

    const reportEntry = {
      ...normalizedResult,

      failureAnalysis: normalizedResult.errors.map(
        (error) => analyzeFailure(error),
      ),
    };

    this.results.push(reportEntry);

    return reportEntry;
  }

  /** @returns {Array<import('../contracts/test-result.schema.js').TestResult & { failureAnalysis: object[] }>} */
  getResults() {
    return [...this.results];
  }
}

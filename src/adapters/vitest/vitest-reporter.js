
import ResultCollector from '../../core/collection/result-collector.js';
import { analyzeFailure } from '../../core/analysis/failure-analyzer.js';
import { writeHtmlReport } from '../../reporting/html/html-report.js';
import { openHtmlReport } from '../../reporting/html/open-html-report.js';
import { mapVitestTestCase } from './vitest-adapter.js';

/** Vitest lifecycle bridge into the framework's normalized core. */
export default class UniversalReporter {
  /** @param {{ collector?: ResultCollector, testType?: string, report?: (results: object[], reportOptions?: { runErrors: object[], runStatus: string }) => void }} options */
  constructor({ collector = new ResultCollector(), testType = 'unit', report = writeHtmlReport } = {}) {
    this.collector = collector;
    this.testType = testType;
    this.report = report;
    this.failedTestFiles = new Set();
  }

  /** Begin a new run by clearing prior normalized results. */
  onTestRunStart() {
    this.collector.reset();
    this.failedTestFiles.clear();

    console.log('\n[Universal Framework] Test run started');
  }

  /** Adapt one Vitest test case and submit its normalized result to core. */
  onTestCaseResult(testCase) {
    const normalizedResult = mapVitestTestCase(testCase, { testType: this.testType });
    this.collector.collect(normalizedResult);
    if (normalizedResult.status === 'failed') {
      this.failedTestFiles.add(testCase.module.moduleId);
    }
  }

  /** Emit the collected report and call the optional reporting hook. */
  async onTestRunEnd(testModules = [], unhandledErrors = [], runStatus = 'passed') {
    const results = this.collector.getResults();
    const runErrors = collectRunErrors(testModules, unhandledErrors, this.failedTestFiles);

    console.log('\n[Universal Framework] Test run completed');
    console.log(`Captured results: ${results.length}`);
    console.log(JSON.stringify(results, null, 2));
    if (runErrors.length > 0) {
      console.error(`[Universal Framework] Run-level errors: ${runErrors.length}`);
      console.error(JSON.stringify(runErrors, null, 2));
    }
    const reportPath = await this.report?.(results, { runErrors, runStatus });
    if (reportPath) {
      console.log(`[Universal Framework] HTML report saved: ${reportPath}`);
      await openHtmlReport(reportPath);
    }
  }
}

function collectRunErrors(testModules, unhandledErrors, failedTestFiles) {
  const runErrors = [];

  for (const testModule of testModules ?? []) {
    const file = testModule.moduleId ?? testModule.relativeModuleId ?? '<vitest-module>';
    const state = typeof testModule.state === 'function'
      ? testModule.state()
      : testModule.state;
    if (state !== 'failed' || failedTestFiles.has(file)) continue;

    const collectionErrors = typeof testModule.errors === 'function'
      ? testModule.errors()
      : [];
    const resultErrors = typeof testModule.result === 'function'
      ? testModule.result()?.errors
      : [];
    const errors = collectionErrors.length > 0
      ? collectionErrors
      : Array.isArray(resultErrors) && resultErrors.length > 0
        ? resultErrors
        : [{ name: 'Error', message: 'Vitest reported a failed test module without error details.' }];

    for (const error of errors) runErrors.push(normalizeRunError(error, file));
  }

  for (const error of unhandledErrors ?? []) {
    runErrors.push(normalizeRunError(error, '<vitest-run>'));
  }

  return runErrors;
}

function normalizeRunError(error, file) {
  const normalizedError = {
    name: typeof error?.name === 'string' && error.name.length > 0 ? error.name : 'Error',
    message: typeof error?.message === 'string' && error.message.length > 0
      ? error.message
      : 'Unknown Vitest run error.',
    ...(typeof error?.stack === 'string' && error.stack.length > 0 ? { stack: error.stack } : {}),
  };

  return {
    file,
    ...normalizedError,
    failureAnalysis: analyzeFailure(normalizedError),
  };
}

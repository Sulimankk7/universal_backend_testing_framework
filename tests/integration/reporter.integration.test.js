
import { describe, it, expect, vi } from 'vitest';

import UniversalReporter from '../../src/adapters/vitest/vitest-reporter.js';

function createFakeTestCase({
  name = 'should execute a test',
  fullName = 'TestSuite > should execute a test',
  state = 'passed',
  mode = 'run',
  errors,
  duration = 10,
} = {}) {
  return {
    name,
    fullName,

    module: {
      moduleId: 'tests/example.test.js',
    },

    options: {
      mode,
    },

    result: () => ({
      state,
      errors,
    }),

    diagnostic: () => ({
      duration,
    }),
  };
}

describe('UniversalReporter Integration', () => {
  it('should collect a passed test result', () => {
    const reporter = new UniversalReporter();

    reporter.onTestCaseResult(createFakeTestCase());

    const results = reporter.collector.getResults();

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('passed');
    expect(results[0].id).toBeTruthy();
    expect(results[0].errors).toEqual([]);
    expect(results[0].failureAnalysis).toEqual([]);
  });

  it('should collect and analyze a TypeError', () => {
    const reporter = new UniversalReporter();

    reporter.onTestCaseResult(
      createFakeTestCase({
        state: 'failed',
        errors: [
          {
            name: 'TypeError',
            message:
              "Cannot read properties of undefined (reading 'name')",
          },
        ],
      }),
    );

    const results = reporter.collector.getResults();

    expect(results[0].status).toBe('failed');

    expect(results[0].failureAnalysis[0].category).toBe(
      'property_access_error',
    );
  });

  it('should collect and analyze a ReferenceError', () => {
    const reporter = new UniversalReporter();

    reporter.onTestCaseResult(
      createFakeTestCase({
        state: 'failed',
        errors: [
          {
            name: 'ReferenceError',
            message: 'userName is not defined',
          },
        ],
      }),
    );

    const results = reporter.collector.getResults();

    expect(results[0].status).toBe('failed');

    expect(results[0].failureAnalysis[0].category).toBe(
      'reference_error',
    );

    expect(results[0].failureAnalysis[0].evidence.variable).toBe(
      'userName',
    );
  });

  it('should collect a skipped test result', () => {
    const reporter = new UniversalReporter();

    reporter.onTestCaseResult(
      createFakeTestCase({
        state: 'skipped',
        mode: 'skip',
        duration: 0,
      }),
    );

    const results = reporter.collector.getResults();

    expect(results[0].status).toBe('skipped');
  });

  it('should collect a todo test result', () => {
    const reporter = new UniversalReporter();

    reporter.onTestCaseResult(
      createFakeTestCase({
        state: 'skipped',
        mode: 'todo',
        duration: 0,
      }),
    );

    const results = reporter.collector.getResults();

    expect(results[0].status).toBe('todo');
  });

  it('should collect multiple test results', () => {
    const reporter = new UniversalReporter();

    const testCases = [
      createFakeTestCase({
        name: 'passed test',
        state: 'passed',
      }),

      createFakeTestCase({
        name: 'failed test',
        state: 'failed',
        errors: [
          {
            name: 'ReferenceError',
            message: 'userName is not defined',
          },
        ],
      }),

      createFakeTestCase({
        name: 'skipped test',
        state: 'skipped',
        mode: 'skip',
      }),
    ];

    testCases.forEach((testCase) => {
      reporter.onTestCaseResult(testCase);
    });

    const results = reporter.collector.getResults();

    expect(results).toHaveLength(3);

    expect(results.map((result) => result.status)).toEqual([
      'passed',
      'failed',
      'skipped',
    ]);

    expect(new Set(results.map((result) => result.id)).size).toBe(3);
  });

  it('should report module collection errors separately from test result counts', async () => {
    const report = vi.fn(async () => undefined);
    const reporter = new UniversalReporter({ report });
    const error = {
      name: 'SyntaxError',
      message: 'Unexpected token',
      stack: 'SyntaxError: Unexpected token\n    at broken.test.js:1:1',
    };

    await reporter.onTestRunEnd([{
      moduleId: 'tests/broken.test.js',
      relativeModuleId: 'tests/broken.test.js',
      state: () => 'failed',
      errors: () => [error],
      result: () => undefined,
    }], [], 'failed');

    expect(report).toHaveBeenCalledOnce();
    expect(report.mock.calls[0][0]).toEqual([]);
    expect(report.mock.calls[0][1].runErrors).toEqual([expect.objectContaining({
      file: 'tests/broken.test.js',
      name: 'SyntaxError',
      message: 'Unexpected token',
      stack: error.stack,
      failureAnalysis: expect.objectContaining({ category: 'syntax_error' }),
    })]);
  });

  it('should not duplicate a module error when its failed test was already collected', async () => {
    const report = vi.fn(async () => undefined);
    const reporter = new UniversalReporter({ report });
    const testCase = createFakeTestCase({
      state: 'failed',
      errors: [{ name: 'AssertionError', message: 'expected 1 to be 2' }],
    });

    reporter.onTestCaseResult(testCase);
    await reporter.onTestRunEnd([{
      moduleId: 'tests/example.test.js',
      state: () => 'failed',
      errors: () => [{ name: 'Error', message: 'suite failed' }],
    }], [], 'failed');

    expect(report.mock.calls[0][0]).toHaveLength(1);
    expect(report.mock.calls[0][1].runErrors).toEqual([]);
  });

  it('should pass an interrupted run status to the report hook', async () => {
    const report = vi.fn(async () => undefined);
    const reporter = new UniversalReporter({ report });

    await reporter.onTestRunEnd([], [], 'interrupted');

    expect(report.mock.calls[0][1].runStatus).toBe('interrupted');
  });

  it('should pass the configured project name to the report hook', async () => {
    const report = vi.fn(async () => undefined);
    const reporter = new UniversalReporter({ projectName: 'Shared Table Frontend', report });

    await reporter.onTestRunEnd([], [], 'passed');

    expect(report.mock.calls[0][1].projectName).toBe('Shared Table Frontend');
  });

  it('should reset previous test results', () => {
    const reporter = new UniversalReporter();

    reporter.onTestRunStart();

    reporter.onTestCaseResult(createFakeTestCase());

    expect(reporter.collector.getResults()).toHaveLength(1);

    reporter.onTestRunStart();

    expect(reporter.collector.getResults()).toHaveLength(0);
  });
});

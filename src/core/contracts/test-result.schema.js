import { z } from 'zod';

/** @typedef {'passed' | 'failed' | 'skipped' | 'todo'} TestStatus */
/** @typedef {{ name: string, message: string, stack?: string, causes?: Array<{ name: string, message: string }> }} TestError */
/**
 * @typedef {object} TestResult
 * @property {string} id Unique execution identifier.
 * @property {string} name Test name.
 * @property {string} fullName Hierarchical test name.
 * @property {string} file Test file or source location.
 * @property {string} testType Extensible classification such as unit or integration.
 * @property {string} source Identifier of the producing test source.
 * @property {TestStatus} status Normalized execution status.
 * @property {number} durationMs Execution duration in milliseconds.
 * @property {TestError[]} errors Normalized errors produced by the test.
 */

/** Normalized error information shared by all test source adapters. */
export const TestErrorSchema = z.object({
  name: z.string().min(1),
  message: z.string().min(1),
  stack: z.string().optional(),
  causes: z.array(z.object({
    name: z.string().min(1),
    message: z.string().min(1),
  }).strict()).optional(),
}).strict();

/** Canonical, tool independent representation of one test execution. */
export const TestResultSchema = z.object({
  id: z.string().min(1),

  name: z.string().min(1),
  fullName: z.string().min(1),

  file: z.string().min(1),

  testType: z.string().min(1),
  source: z.string().min(1),

  status: z.enum([
    'passed',
    'failed',
    'skipped',
    'todo',
  ]),

  durationMs: z.number().nonnegative(),

  errors: z.array(TestErrorSchema),

}).strict();


/**
 * Heuristically analyzes normalized error information. Classifications are
 * pattern matches and should be treated as diagnostic clues, not certainty.
 *
 * @param {{ name: string, message: string, stack?: string }} error
 * @returns {{ category: string, summary: string, evidence: object, recommendation: string, confidence: 'medium' | 'low' }}
 */
export function analyzeFailure(error) {
  if (!error || !error.message) {
    throw new Error('A valid error object is required.');
  }

  const message = error.message;

  // Rule 1: Assertion Failure
  const assertionMatch = message.match(
    /expected (.+?) to be (.+?)(?:\s*\/\/|$)/i
  );

  if (error.name === 'AssertionError' && assertionMatch) {
    const [, actual, expected] = assertionMatch;

    return {
      category: 'assertion_failure',
      summary: 'The actual value does not match the expected value.',
      evidence: {
        actual: actual.trim(),
        expected: expected.trim(),
      },
      recommendation:
        'Review the expected value and the logic producing the actual value.',
      confidence: 'medium',
    };
  }

  // Rule 2: Property Access Error
  const propertyMatch = message.match(
    /Cannot read properties of (undefined|null) \(reading ['"](.+?)['"]\)/i
  );

  if (error.name === 'TypeError' && propertyMatch) {
    const [, targetValue, property] = propertyMatch;

    return {
      category: 'property_access_error',
      summary:
        `The code tried to access the "${property}" property of ${targetValue}.`,
      evidence: {
        targetValue,
        property,
      },
      recommendation:
        'Check that the value exists before accessing its properties. Consider validating the value or using optional chaining where appropriate.',
      confidence: 'medium',
    };
  }

  // Rule 3: Range Error
  if (error.name === 'RangeError') {
    return {
      category: 'range_error',
      summary: 'A value was outside the allowed range.',
      evidence: {
        originalMessage: message,
      },
      recommendation:
        'Check whether the provided value is within the allowed range.',
      confidence: 'medium',
    };
  }

  // Rule 4: Reference Error
  const referenceMatch = message.match(
    /^([a-zA-Z_$][\w$]*) is not defined$/i
  );

  if (error.name === 'ReferenceError' && referenceMatch) {
    const [, variable] = referenceMatch;

    return {
      category: 'reference_error',
      summary:
        `The variable "${variable}" is not defined in the current scope.`,
      evidence: {
        variable,
      },
      recommendation:
        'Check whether the variable is declared and accessible in the current scope. Verify its spelling and declaration order.',
      confidence: 'medium',
    };
  }

  // Rule 5: Syntax Error
  if (error.name === 'SyntaxError') {
    return {
      category: 'syntax_error',
      summary: 'The JavaScript code contains invalid syntax.',
      evidence: {
        originalMessage: message,
      },
      recommendation:
        'Review the code syntax, including brackets, parentheses, quotes, and operators.',
      confidence: 'medium',
    };
  }

  // Rule 6: Aggregate Error
  if (error.name === 'AggregateError') {
    return {
      category: 'aggregate_error',
      summary:
        'Multiple errors occurred during a single operation.',
      evidence: {
        originalMessage: message,
        errors: Array.isArray(error.causes)
          ? error.causes.map((cause) => cause.message)
          : [],
      },
      recommendation:
        'Review each individual error to identify the underlying causes of the failure.',
      confidence: 'medium',
    };
  }

  // Fallback: Unknown Error
  return {
    category: 'unknown',
    summary:
      'The framework could not identify a specific failure pattern.',
    evidence: {
      originalMessage: message,
    },
    recommendation:
      'Review the original error message and stack trace to investigate the failure.',
    confidence: 'low',
  };
}

import { describe, expect, it } from 'vitest';
import { compareJSON } from '../../src/adapters/rest/assertions/json-comparison.js';

describe('exact structured JSON comparison', () => {
  it('matches identical objects regardless of object key order', () => {
    expect(compareJSON({ id: 1, name: 'Product A' }, { name: 'Product A', id: 1 })).toEqual([]);
  });

  it.each([
    ['different value', { id: 1 }, { id: 2 }, 'id', 'equals', 1, 2, 'Different value'],
    ['missing field', { id: 1 }, {}, 'id', 'exists', 1, undefined, 'Missing field'],
    ['unexpected field', {}, { extra: true }, 'extra', 'absent', undefined, true, 'Unexpected field'],
    ['different data type', { id: 9 }, { id: '9' }, 'id', 'type', 'number', 'string', 'Different data type'],
  ])('returns only the first %s mismatch', (_label, expected, actual, path, assertion, want, got, reason) => {
    const mismatches = compareJSON(expected, actual);
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0]).toMatchObject({ path, assertion, expected: want, actual: got, reason });
  });

  it('reports only array length when a length mismatch exists', () => {
    const mismatches = compareJSON(
      [{ id: 1, value: 'expected' }, { id: 2 }],
      [{ id: 9, value: 'actual' }],
    );
    expect(mismatches).toEqual([{
      path: '$', assertion: 'length', expected: 2, actual: 1,
      reason: 'Array length mismatch', passed: false,
    }]);
  });

  it('reports the first element mismatch and respects array order', () => {
    expect(compareJSON([1, 2], [2, 1])).toEqual([{
      path: '$[0]', assertion: 'equals', expected: 1, actual: 2,
      reason: 'Different value', passed: false,
    }]);
  });

  it('reports the first nested array mismatch at its JSON path', () => {
    expect(compareJSON(
      { products: [{ id: 1, tags: ['a', 'b'] }] },
      { products: [{ id: 1, tags: ['a'] }] },
    )).toEqual([{
      path: 'products[0].tags', assertion: 'length', expected: 2, actual: 1,
      reason: 'Array length mismatch', passed: false,
    }]);
  });

  it('reports only the first mismatch when objects and arrays contain several differences', () => {
    const mismatches = compareJSON(
      { data: [{ id: 1 }, { id: 2 }], extraExpected: true },
      { data: [{ id: 0 }, { id: 3 }], extraActual: true },
    );
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0]).toMatchObject({ path: 'data[0].id', expected: 1, actual: 0 });
  });

  it('detects root structure mismatches and handles empty containers', () => {
    expect(compareJSON({}, [])).toEqual([{
      path: '$', assertion: 'type', expected: 'object', actual: 'array',
      reason: 'Different data type', passed: false,
    }]);
    expect(compareJSON({}, {})).toEqual([]);
    expect(compareJSON([], [1])).toHaveLength(1);
  });
});

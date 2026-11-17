/** Compare complete JSON values. Object key order is ignored; array order is significant. */
export function compareJSON(expected, actual) {
  const mismatch = walk(expected, actual);
  return mismatch ? [mismatch] : [];
}

function walk(want, got, path = '$') {
  if (want === null || typeof want !== 'object') {
    const expectedType = jsonType(want);
    const actualType = jsonType(got);
    if (expectedType !== actualType) return failure(path, 'type', expectedType, actualType, 'Different data type');
    if (!Object.is(want, got)) return failure(path, 'equals', want, got, 'Different value');
    return null;
  }

  if (Array.isArray(want)) {
    if (!Array.isArray(got)) return failure(path, 'type', 'array', jsonType(got), 'Different data type');
    if (want.length !== got.length) return failure(path, 'length', want.length, got.length, 'Array length mismatch');
    for (let index = 0; index < want.length; index += 1) {
      const mismatch = walk(want[index], got[index], `${path}[${index}]`);
      if (mismatch) return mismatch;
    }
    return null;
  }

  if (got === null || typeof got !== 'object' || Array.isArray(got)) {
    return failure(path, 'type', 'object', jsonType(got), 'Different data type');
  }
  for (const key of Object.keys(want)) {
    const childPath = path === '$' ? key : `${path}.${key}`;
    if (!Object.hasOwn(got, key)) return failure(childPath, 'exists', want[key], undefined, 'Missing field');
    const mismatch = walk(want[key], got[key], childPath);
    if (mismatch) return mismatch;
  }
  for (const key of Object.keys(got)) {
    if (!Object.hasOwn(want, key)) {
      const childPath = path === '$' ? key : `${path}.${key}`;
      return failure(childPath, 'absent', undefined, got[key], 'Unexpected field');
    }
  }
  return null;
}

function jsonType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function failure(path, assertion, expected, actual, reason) {
  return { path, assertion, expected, actual, reason, passed: false };
}

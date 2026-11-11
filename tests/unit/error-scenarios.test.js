
import { describe, it, expect } from 'vitest';

describe('Error Scenarios', () => {
  it('should handle undefined property access', () => {
    const user = undefined;

    expect(() => user.name).toThrow(TypeError);
  });

  it('should handle an undefined variable', () => {
    expect(() => userName).toThrow(ReferenceError);
  });

});

import { describe, it, expect } from 'vitest';

// Minimal smoke test — proves vitest runs in this package.
// Full test suite is set up in task 1.7.
describe('smoke', () => {
  it('runs', () => {
    expect(true).toBe(true);
  });
});

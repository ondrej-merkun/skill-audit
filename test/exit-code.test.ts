import { describe, expect, it } from 'vitest';
import { computeExitCode } from '../packages/cli/src/commands/scan.js';

describe('computeExitCode', () => {
  it('returns 0 when all PASS and no options', () => {
    expect(computeExitCode('PASS', {})).toBe(0);
  });

  it('returns 0 for REVIEW with default fail-on FAIL', () => {
    expect(computeExitCode('REVIEW', { failOn: 'FAIL' })).toBe(0);
  });

  it('returns 1 for FAIL with default fail-on FAIL', () => {
    expect(computeExitCode('FAIL', { failOn: 'FAIL' })).toBe(1);
  });

  it('returns 1 for REVIEW when fail-on is REVIEW', () => {
    expect(computeExitCode('REVIEW', { failOn: 'REVIEW' })).toBe(1);
  });

  it('returns 1 for FAIL when fail-on is REVIEW', () => {
    expect(computeExitCode('FAIL', { failOn: 'REVIEW' })).toBe(1);
  });

  it('returns 0 for PASS when fail-on is REVIEW', () => {
    expect(computeExitCode('PASS', { failOn: 'REVIEW' })).toBe(0);
  });

  it('treats REVIEW as exit 1 when strict=true', () => {
    expect(computeExitCode('REVIEW', { strict: true })).toBe(1);
  });

  it('treats FAIL as exit 1 when strict=true', () => {
    expect(computeExitCode('FAIL', { strict: true })).toBe(1);
  });

  it('returns 0 for PASS when strict=true', () => {
    expect(computeExitCode('PASS', { strict: true })).toBe(0);
  });

  it('handles case-insensitive fail-on values', () => {
    expect(computeExitCode('REVIEW', { failOn: 'review' })).toBe(1);
    expect(computeExitCode('REVIEW', { failOn: 'fail' })).toBe(0);
  });

  it('returns 3 for incomplete scan when all skills pass', () => {
    expect(computeExitCode('PASS', { failOn: 'FAIL' }, true)).toBe(3);
  });

  it('returns 1 (not 3) for FAIL verdict even if scan was incomplete', () => {
    expect(computeExitCode('FAIL', { failOn: 'FAIL' }, true)).toBe(1);
  });

  it('returns 1 (not 3) for REVIEW with strict even if incomplete', () => {
    expect(computeExitCode('REVIEW', { strict: true }, true)).toBe(1);
  });
});

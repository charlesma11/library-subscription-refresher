import { describe, it, expect } from 'vitest';
import { isTokenValid } from '../src/auth';

describe('isTokenValid', () => {
  it('returns true when token matches expected', () => {
    expect(isTokenValid('abc123', 'abc123')).toBe(true);
  });

  it('returns false when tokens differ', () => {
    expect(isTokenValid('abc123', 'xyz789')).toBe(false);
  });

  it('returns false when provided token is null/undefined', () => {
    expect(isTokenValid(null, 'abc123')).toBe(false);
    expect(isTokenValid(undefined, 'abc123')).toBe(false);
  });

  it('returns false when expected token is empty', () => {
    expect(isTokenValid('anything', '')).toBe(false);
  });

  it('uses constant-time comparison (same length strings)', () => {
    expect(isTokenValid('abcdefgh', 'abcdefgi')).toBe(false);
    expect(isTokenValid('abcdefgh', 'abcdefgh')).toBe(true);
  });
});

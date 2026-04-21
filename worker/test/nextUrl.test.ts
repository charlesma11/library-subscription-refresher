import { describe, it, expect } from 'vitest';
import { normalizeNextUrl } from '../src/nextUrl';

describe('normalizeNextUrl', () => {
  it('accepts a valid nytimes.com article URL', () => {
    const url = 'https://www.nytimes.com/2026/04/21/opinion/ezra-klein-podcast-alex-bores.html';
    expect(normalizeNextUrl(url)).toBe(url);
  });

  it('accepts www.nytimes.com subdomain', () => {
    expect(normalizeNextUrl('https://www.nytimes.com/')).toBe('https://www.nytimes.com/');
  });

  it('accepts nytimes.com bare domain', () => {
    expect(normalizeNextUrl('https://nytimes.com/foo')).toBe('https://nytimes.com/foo');
  });

  it('defaults to https://www.nytimes.com/ when input is null/empty', () => {
    expect(normalizeNextUrl(null)).toBe('https://www.nytimes.com/');
    expect(normalizeNextUrl('')).toBe('https://www.nytimes.com/');
  });

  it('rejects non-nytimes destinations', () => {
    expect(() => normalizeNextUrl('https://evil.com/steal')).toThrow(/not.*nytimes/i);
  });

  it('rejects javascript: and data: schemes', () => {
    expect(() => normalizeNextUrl('javascript:alert(1)')).toThrow();
    expect(() => normalizeNextUrl('data:text/html,<script>')).toThrow();
  });

  it('rejects nytimes-lookalike hosts', () => {
    expect(() => normalizeNextUrl('https://nytimes.com.evil.com/x')).toThrow();
    expect(() => normalizeNextUrl('https://fakenytimes.com/x')).toThrow();
  });
});

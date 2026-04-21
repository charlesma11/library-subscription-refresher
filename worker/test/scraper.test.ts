import { describe, it, expect } from 'vitest';
import { extractRedeemUrl } from '../src/scraper';

describe('extractRedeemUrl', () => {
  it('returns the URL when Location is a valid nytimes redeem URL', () => {
    const loc = 'https://nytimes.com/subscription/redeem?campaignId=89YWX&gift_code=abc123';
    expect(extractRedeemUrl(loc)).toBe(loc);
  });

  it('accepts www.nytimes.com variant', () => {
    const loc = 'https://www.nytimes.com/subscription/redeem?campaignId=X&gift_code=Y';
    expect(extractRedeemUrl(loc)).toBe(loc);
  });

  it('returns null for null or empty input', () => {
    expect(extractRedeemUrl(null)).toBeNull();
    expect(extractRedeemUrl('')).toBeNull();
  });

  it('returns null when URL is not a redeem URL', () => {
    expect(extractRedeemUrl('https://www.nytimes.com/some/article')).toBeNull();
    expect(extractRedeemUrl('https://nytimes.com/')).toBeNull();
  });

  it('returns null when host is not nytimes.com', () => {
    expect(extractRedeemUrl('https://evil.com/subscription/redeem?gift_code=x')).toBeNull();
    expect(extractRedeemUrl('https://fakenytimes.com/subscription/redeem?gift_code=x')).toBeNull();
  });

  it('returns null when scheme is not https', () => {
    expect(extractRedeemUrl('http://www.nytimes.com/subscription/redeem?gift_code=x')).toBeNull();
  });

  it('returns null when gift_code query parameter is missing', () => {
    expect(extractRedeemUrl('https://www.nytimes.com/subscription/redeem?campaignId=X')).toBeNull();
  });

  it('returns null for completely invalid input', () => {
    expect(extractRedeemUrl('not a url')).toBeNull();
    expect(extractRedeemUrl('javascript:alert(1)')).toBeNull();
  });
});

import { describe, it, expect } from 'vitest';
import { bounceHtml } from '../src/bounce';

describe('bounceHtml', () => {
  const redeemUrl = 'https://www.nytimes.com/subscription/redeem?campaignId=X&gift_code=Y';
  const nextUrl = 'https://www.nytimes.com/article';

  it('starts with doctype', () => {
    expect(bounceHtml(redeemUrl, nextUrl)).toMatch(/^<!doctype html>/i);
  });

  it('includes a meta refresh redirect to the redeem URL', () => {
    const html = bounceHtml(redeemUrl, nextUrl);
    expect(html).toMatch(/<meta\s+http-equiv="refresh"\s+content="0;\s*url=[^"]+"/i);
    expect(html).toContain(redeemUrl);
  });

  it('includes a visible "continue" link to the next URL', () => {
    const html = bounceHtml(redeemUrl, nextUrl);
    expect(html).toContain(`href="${nextUrl}"`);
  });

  it('escapes quotes in URLs to prevent HTML/attribute injection', () => {
    const evilNext = 'https://www.nytimes.com/" onload="alert(1)';
    const html = bounceHtml(redeemUrl, evilNext);
    // The raw onload must not appear as an attribute after escaping
    expect(html).not.toMatch(/onload="alert\(1\)"/);
  });

  it('escapes the redeem URL in the meta tag', () => {
    const evilRedeem = 'https://nytimes.com/subscription/redeem?gift_code=x"><script>alert(1)</script>';
    const html = bounceHtml(evilRedeem, nextUrl);
    expect(html).not.toContain('<script>alert(1)</script>');
  });

  it('includes a visible status message for the user', () => {
    const html = bounceHtml(redeemUrl, nextUrl);
    expect(html.toLowerCase()).toMatch(/(redeem|refresh|pass)/);
  });
});

# NYT redeem URL iframe viability

## Conclusion

**Iframe path is blocked.** Worker must use the top-level-redirect fallback described in plan Task 8 Step 5.

## Evidence

```
$ curl -sI "https://nytimes.com/subscription/redeem?campaignId=89YWX&gift_code=465c46c81425d03e"
x-frame-options: DENY
content-security-policy: ...; default-src data: 'unsafe-inline' 'unsafe-eval' https: nytresource:; ...
```

Both the 301 (to `www.nytimes.com`) and the final 200 response carry `x-frame-options: DENY`. Chromium refuses to render such a frame, and since the redemption is a single-request GET, the browser blocking the frame means the redemption effectively does not complete from our page's point of view.

## Implementation choice for Task 8

Use the fallback `bounceHtml` variant: a top-level `meta refresh` / `location.href` redirect to the redeem URL, with a visible "click to continue" link to the `next` article in case the user stays on NYT's confirmation page.

UX:
1. User's browser lands on Worker `/refresh?next=<article>` → Worker returns HTML that top-level redirects to redeem URL.
2. NYT redeems, user lands on the NYT confirmation/account page.
3. User clicks the "Continue to article" link (which is opened in the same tab via the continue page served before the redirect) or hits browser Back and re-clicks the article.

Acceptable — refresh is an infrequent event (~every 72 hours per account), one extra click is fine.

## Possibly worth revisiting later

- If NYT's redeem URL supports a `returnUrl` parameter (not verified), the redemption flow itself could bounce the user back to the article. Empirically testable — append `&returnUrl=<article>` to the redeem URL and see if NYT honors it.
- Another path: have the Worker send `fetch(redeemUrl, { credentials: 'include', mode: 'no-cors' })` from its bounce page, then navigate to `next`. Blocked by Safari's ITP for third-party cookies, so not reliable for mobile.

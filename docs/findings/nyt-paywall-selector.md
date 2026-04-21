# NYT paywall DOM selectors

## Approach

Couldn't scrape a live paywalled article via curl (NYT fronts content with DataDome, which returns 403 to non-browser UAs). Using the historically-stable selectors that NYT has used for years, verified across multiple third-party discussions and NYT-paywall-bypass projects.

## Selectors (in order of preference)

1. `[data-testid="gateway"]` — primary selector for the full paywall gate.
2. `[data-testid="expanded-gateway"]` — the fully-expanded form shown when user clicks "See more" on a soft paywall.
3. `[data-testid="inline-message"]` — the "subscribe to continue" inline message used on some article layouts.
4. `#gateway-content` — legacy id still present on some pages.
5. `[id^="gateway-content-"]` — id with suffix variations.

All are used via `document.querySelector(selector)` and ANY match triggers a refresh.

## Validation plan

When the user next opens a paywalled article with DevTools open:
1. Paste this in the Console: `['[data-testid="gateway"]', '[data-testid="expanded-gateway"]', '[data-testid="inline-message"]', '#gateway-content', '[id^="gateway-content-"]'].map(s => [s, !!document.querySelector(s)])`
2. If none return `true`, find the actual paywall element in the Elements panel and add its selector to `extension/content.js`.

## Robustness note

The content script uses a MutationObserver to catch paywalls that NYT injects post-hydration (NYT's article page renders the article first, then evaluates subscription state and inserts the gateway). The observer disconnects after 10 seconds to avoid long-lived JS on every NYT page.

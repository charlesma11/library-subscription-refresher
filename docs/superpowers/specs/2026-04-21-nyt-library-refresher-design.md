# NYT Library-Subscription Refresher — Design

**Status:** Approved for planning
**Date:** 2026-04-21
**Target user:** Single user (charles.fn.ma@gmail.com), HBPL library card 21119011001966

## Purpose

Give one user seamless, continuous access to any NYT article on their Mac and iPhone by automating the redemption of their Huntington Beach Public Library (HBPL) 72-hour NYT passes against their existing Google-linked NYT account. When a paywall appears, refresh the pass and return to the article — no manual steps.

## Key insight that shapes the design

Access granted by NYT's library-redemption flow lives on the **NYT account**, not on a browser cookie jar. Once a gift code is redeemed against the account, every device signed into that account (Mac Chrome, iPhone Safari, NYT iOS app) gets 72 hours of full access. The user is already signed into NYT via Google on all devices, so the automation only needs to perform the redemption itself — no per-device cookie plumbing.

Today's manual flow:
1. Visit HBPL digital-library page, click "Go" for NYT.
2. Redirected to `https://www.nytimes.com/subscription/redeem?campaignId=89YWX&gift_code=<code>`.
3. NYT consumes the code (user is signed in via Google), grants 72 hours to the account.
4. All signed-in devices have access.

The user reports the gift code returned by HBPL appears sticky (same code on repeated clicks), suggesting either a per-session cached code or a pool/TTL-based reissue. Either way, automation only needs to fetch HBPL's current "Go" URL and navigate to it in a browser where the NYT account is signed in.

## Architecture

Three small components sharing one contract.

### 1. Cloudflare Worker ("the brain")

- Hosted on Cloudflare Workers free tier at a `*.workers.dev` subdomain.
- One endpoint: `GET /refresh?next=<article-url>&t=<shared-secret>`.
- Responsibilities:
  - Validate the shared-secret token (reject unauthorized callers).
  - Fetch the HBPL page that renders the NYT "Go" button.
  - Extract the current `nytimes.com/subscription/redeem?...&gift_code=...` URL via regex/HTML parse.
  - Return an HTML bounce page (see *Refresh flow* below) that uses the user's browser to perform the redemption and then navigate to `next`.
- Secrets stored via `wrangler secret put`: library card number, PIN (reserved — not used in v1 but available if HBPL auth is ever required), shared-secret token.
- Stateless. No KV, no Durable Objects, no database.

### 2. Chrome extension ("desktop UX")

- Manifest V3.
- Content script on `*://www.nytimes.com/*` detects paywall (specific DOM signals: subscribe-gate modal, "Subscribe" CTA, `.css-*-subscribe` classes — exact selector determined during implementation).
- On paywall detection, redirects the current tab to `https://<worker>.workers.dev/refresh?next=<current-url>&t=<secret>`.
- Worker URL and shared secret stored in `chrome.storage.sync`; one-time setup via the extension's options page.
- No background service worker logic beyond storing config.

### 3. iOS Shortcut ("mobile fallback")

- Installed on iPhone from a shared iCloud link.
- Lives on the Safari share sheet.
- When triggered with an NYT URL as input, opens `https://<worker>.workers.dev/refresh?next=<url>&t=<secret>` in Safari.
- Only needed when 72 hours have lapsed without a Mac-side refresh. In normal usage (Mac used daily) mobile refresh is never triggered.

## Refresh flow (core mechanism)

The Worker's HTML response executes the redemption inside the user's own browser so that the NYT account's first-party cookies are attached to the redeem request.

**Primary path — hidden iframe:**

```
1. Browser navigates to: https://<worker>/refresh?next=<article>&t=<secret>
2. Worker server-side:
   a. Validates token.
   b. HTTP GET the HBPL page that renders the NYT "Go" button.
   c. Parse out the current redeem URL (contains campaignId + gift_code).
3. Worker responds with HTML:
   <iframe src="<redeem_url>" hidden></iframe>
   <script>
     setTimeout(() => { location.href = "<next>"; }, 2500);
   </script>
4. Browser loads the iframe → NYT processes the redemption in a first-party
   context with the user's signed-in cookies → account gets 72 hours.
5. After 2.5s the top-level page navigates to <next>; article loads unlocked.
```

**Fallback path — if NYT sets `X-Frame-Options: DENY` on the redeem URL:**

Worker returns HTML that top-level-redirects to the redeem URL with `next` embedded in a fragment. After redemption the redeem page lands the user on the NYT homepage (or a confirmation page). Since we can't script that page, we degrade to: a small confirmation page served by the Worker before the redirect that says "Pass refreshed — click to continue" with a link to `next`. One extra click, but only in the fallback case. Whether this fallback is ever needed will be determined during implementation by a direct iframe test.

## Error handling

- **Worker can't find gift code on HBPL page:** Return 502 + a minimal HTML page explaining the parse failed and linking the user directly to the HBPL page. Most common cause would be HBPL restructuring their site.
- **User is signed out of NYT:** The iframe redeem request will land on NYT's sign-in wall. The user sees the article (via top-level redirect) still paywalled; they sign in once; next paywall hit succeeds normally. Not worth engineering around.
- **Invalid/missing shared-secret token:** Worker returns 401.
- **Gift code already used / expired:** NYT's redeem page handles this; on next pass-hit the flow re-runs and fetches HBPL's currently-issued code. If HBPL's code is exhausted for the day, the user falls back to manual use until HBPL reissues.

## Security

- **Credentials stored only in Worker secrets** (card + PIN reserved for future; shared-secret token required for v1).
- **Shared-secret token in URL** prevents randoms from burning passes against the user's account. Token is a 32-char random string; rotatable via `wrangler secret put`.
- **No third-party dependencies** in the Worker beyond what Cloudflare runtime provides (`fetch`, `HTMLRewriter`).
- **Extension** only communicates with the user-configured Worker URL; no telemetry, no analytics.

## Component boundaries

- The Worker knows HBPL and NYT URL structure, but knows nothing about the extension or the Shortcut.
- The extension knows the Worker URL and token; nothing about HBPL.
- The Shortcut knows the Worker URL and token; nothing about HBPL.

All three speak one protocol: `GET /refresh?next=<url>&t=<token>` in, an HTML bounce out.

## Testing

Acceptance test (manual, end-to-end):

1. Sign out of NYT account to establish a fresh paywall state on the test article.
2. Sign back in via Google on Mac Chrome.
3. Visit the target article: `https://www.nytimes.com/2026/04/21/opinion/ezra-klein-podcast-alex-bores.html`
4. Confirm paywall appears.
5. Install extension with configured Worker URL + token.
6. Reload the article.
7. Expected: extension fires `/refresh`, iframe redemption completes, tab lands on the article with full content visible within ~3 seconds.
8. Open the same article on iPhone Safari — full content visible (account-level access).
9. Wait (or force) paywall state again, invoke iOS Shortcut on an NYT URL, confirm Safari unlocks.

Unit tests (Worker):
- `extractRedeemUrl(html)` — given saved snapshots of the HBPL page, returns the correct `redeem?campaignId=...&gift_code=...` URL.
- Token-missing / token-wrong returns 401.
- Missing `next` defaults to `https://www.nytimes.com/`.
- Malformed `next` (non-nytimes.com origin) is rejected.

## Open questions resolved during implementation

1. **Exact HBPL page containing the "Go" button.** Not on `/digital-library/home` or the A-Z list as checked during brainstorm. Will inspect via curl across the subject subpages and any JS-rendered widgets.
2. **Whether `X-Frame-Options` blocks the iframe path.** Test with a simple HTML page before wiring the Worker fully.
3. **Gift code lifetime / reuse.** Observe a few clicks over hours; if reliably reusable within a window, Worker can cache; otherwise fetch fresh each time. Cost is trivial either way.
4. **Paywall DOM signal selector.** Inspect a paywalled article in DevTools and pick the most stable class/aria label.

## Non-goals (YAGNI)

- No multi-user support.
- No proactive refresh on a schedule; reactive (on-paywall) only.
- No metric collection, no dashboards.
- No retry/backoff beyond what Cloudflare's fetch already provides.
- No support for non-Chromium desktop browsers (user confirmed Chrome).
- No NYT iOS app-triggered refresh (unnecessary — account-level access covers it).

## Repository layout (to be created by the plan)

```
/
├── worker/              # Cloudflare Worker source
│   ├── src/index.ts
│   ├── wrangler.toml
│   └── package.json
├── extension/           # Chrome MV3 extension
│   ├── manifest.json
│   ├── content.js
│   ├── options.html
│   └── options.js
├── shortcut/            # iOS Shortcut
│   └── README.md        # install instructions + icloud link
└── docs/
    └── superpowers/specs/2026-04-21-nyt-library-refresher-design.md
```

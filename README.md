# library-subscription-refresher

Automates redeeming the Huntington Beach Public Library 72-hour NYT pass against your NYT account, so any NYT article opens unlocked on Mac and iPhone.

## How it works

A tiny Cloudflare Worker fetches HBPL's NYT redirect endpoint (`hbpl.libguides.com/nyt`), pulls the one-shot redeem URL out of the `Location` header, and returns a small HTML page that top-level-redirects your browser to NYT's `subscription/redeem` URL. Because you're signed in to your NYT account (via Google), NYT applies the 72-hour pass to the *account* — so every device signed into the same NYT account (Mac Chrome, iPhone Safari, NYT iOS app) gets access.

A Chrome MV3 extension triggers the Worker automatically when it detects the paywall DOM on nytimes.com. An iOS Shortcut on the share sheet triggers the same Worker from Safari when the Mac hasn't refreshed in 72+ hours.

## Layout

```
worker/             Cloudflare Worker (TypeScript, Vitest)
extension/          Chrome MV3 extension
shortcut/           iOS Shortcut build instructions
docs/
  superpowers/
    specs/          design doc
    plans/          implementation plan
  findings/         discovery notes
```

## Setup

1. **Deploy the Worker:**
   ```
   cd worker
   npm install
   npx wrangler login
   openssl rand -hex 32           # generate shared secret, save it
   echo <secret> | npx wrangler secret put SHARED_SECRET
   npx wrangler deploy            # prints your *.workers.dev URL
   ```
2. **Install the extension:** `chrome://extensions` → Developer mode on → Load unpacked → select `extension/`. Open the extension's Options, paste the Worker URL and shared secret, Save.
3. **Install the Shortcut (optional):** follow `shortcut/README.md` on iPhone.

## Day-to-day behavior

- Clicking any NYT link works. If the pass has lapsed, the extension briefly routes the tab through the Worker and back to the article (~2 seconds, one extra flash).
- When the Mac refreshes the pass, iPhone Safari and the NYT iOS app inherit access automatically since it's on the account.
- Use the iOS Shortcut only if the Mac has been off for >72 hours and you hit a paywall on the phone.

## Known behavior

- **NYT's redeem page asks for sign-in each time.** If you visit the redeem URL and NYT shows "Log in to apply this pass", that's NYT confirming which account gets the pass — it's not a bug in this project, and there's no way to suppress it. Once you're signed into NYT in a given browser the cookie persists for ~a year, so in normal usage you just stay signed in and the flow is seamless.
- **Paywall detection is DOM-based** and uses a short list of selectors that NYT has kept stable for a long time (see `docs/findings/nyt-paywall-selector.md`). If NYT changes their markup, paywall detection may miss — the fix is a one-line selector update in `extension/content.js`.
- **Gift-code rotation.** The `gift_code` HBPL returns is sticky (same code on rapid repeat requests). If NYT rate-limits a specific code or HBPL's pool resets, the Worker will just start returning a new code on the next refresh. No code changes needed.
- **DataDome on nytimes.com** blocks non-browser user agents. End-to-end testing has to happen in a real browser (not curl) for article pages. The Worker itself is unaffected since it only talks to HBPL.

## Testing the Worker without waiting 72 hours

Visit the Worker directly in a signed-in Chrome:

```
https://<your-worker>.workers.dev/refresh?t=<your-secret>&next=https://www.nytimes.com/
```

You should see "Redeeming your NYT library pass…" briefly, then NYT's redeem confirmation, then the NYT homepage. If NYT shows a confirmation or "pass already active / renewed", the chain is working. Unit tests cover the Worker logic (`cd worker && npm test` → 35 tests).

## Secrets

- **Shared secret:** stored in the Worker (`wrangler secret put SHARED_SECRET`), the Chrome extension (`chrome.storage.sync`), and the iOS Shortcut (baked in). Never committed.
- **Library card / PIN:** not required — HBPL's NYT redirect is a public endpoint.

## Troubleshooting

- **Extension doesn't fire:** DevTools Console on an NYT article should log `[nyt-refresher] paywall detected; refreshing via …` when it triggers. If you see `not configured`, open the extension's Options. If you see nothing on a paywalled page, the selectors in `extension/content.js` may need updating — paste the diagnostic snippet from `docs/findings/nyt-paywall-selector.md` into the Console to see which selector hits.
- **Worker returns 502:** HBPL's endpoint didn't return a valid redeem URL. Probable causes: HBPL changed their URL structure, or HBPL's NYT pass pool is empty (rare). Check `curl -sI https://hbpl.libguides.com/nyt` — it should be a 302 with a `nytimes.com/subscription/redeem?...` `Location` header.
- **Worker returns 401:** Your shared secret doesn't match. Re-save it in the extension Options and verify `wrangler secret list` shows `SHARED_SECRET` is set.

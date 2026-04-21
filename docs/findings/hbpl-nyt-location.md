# HBPL NYT "Go" button location

## Summary

The "Go" button for New York Times on HBPL is a **plain 302 redirect endpoint** — no HTML scraping required.

## Path to the button

1. User-facing page: `https://hbpl.libguides.com/digital-library/gov-law`
2. The "New York Times" entry on that page links to the A-Z database page: `https://hbpl.libguides.com/az/new-york-times`
3. The "Go" / "View Resource" button on that page links to: `https://hbpl.libguides.com/nyt`
4. `https://hbpl.libguides.com/nyt` returns **HTTP 302** with header:
   `Location: https://nytimes.com/subscription/redeem?campaignId=89YWX&gift_code=<16-hex>`

## Evidence

```
$ curl -sI "https://hbpl.libguides.com/nyt" | head -6
HTTP/2 302
server: nginx
date: Tue, 21 Apr 2026 22:53:34 GMT
content-type: text/html; charset=UTF-8
location: https://nytimes.com/subscription/redeem?campaignId=89YWX&gift_code=465c46c81425d03e
```

## Code rotation behavior

Three consecutive requests with 1s spacing returned the **same** `gift_code`:

```
location: https://nytimes.com/subscription/redeem?campaignId=89YWX&gift_code=465c46c81425d03e
location: https://nytimes.com/subscription/redeem?campaignId=89YWX&gift_code=465c46c81425d03e
location: https://nytimes.com/subscription/redeem?campaignId=89YWX&gift_code=465c46c81425d03e
```

The code appears stable — likely rotates on a schedule (daily) or when the pool for the current code is exhausted. For v1, scraping fresh on every Worker request is fine; a cache could be added later if needed.

## Auth requirements

None. `https://hbpl.libguides.com/nyt` is a fully public endpoint. No card + PIN, no cookies required. The library card entry only matters when redeeming specific databases behind EZProxy — the NYT pass is a group subscription that HBPL simply distributes via this public redirect.

## Implications for the Worker

Replace the plan's HTML-parsing `extractRedeemUrl(html)` with a Location-header read. In the Worker:

```ts
const r = await fetch('https://hbpl.libguides.com/nyt', { redirect: 'manual' });
const location = r.headers.get('location'); // the nytimes.com redeem URL
```

The fixture saved at `worker/test/fixtures/hbpl-response.txt` documents the expected response shape.

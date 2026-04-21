# NYT Library-Subscription Refresher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-redeem Huntington Beach Public Library's 72-hour NYT pass against the user's NYT account so every NYT article the user clicks opens unlocked, on Mac Chrome and iPhone Safari, without manual action.

**Architecture:** A tiny stateless Cloudflare Worker scrapes HBPL for the current `nytimes.com/subscription/redeem?...&gift_code=…` URL and returns an HTML bounce page that loads that URL in a hidden iframe inside the user's own browser, then top-level-navigates to the requested article. A Chrome MV3 extension triggers the Worker on paywall detection; an iOS Shortcut does the same from Safari's share sheet.

**Tech Stack:** TypeScript, Cloudflare Workers, Wrangler, Vitest, Chrome MV3, iOS Shortcuts.

**Spec:** `docs/superpowers/specs/2026-04-21-nyt-library-refresher-design.md`

---

## Phase 0: Discovery (resolve open questions before coding)

### Task 1: Locate the HBPL NYT "Go" button and save a fixture

**Files:**
- Create: `worker/test/fixtures/hbpl.html`
- Create: `docs/findings/hbpl-nyt-location.md`

- [ ] **Step 1: Fetch candidate HBPL subpages**

Run each of these and look for `nytimes.com`, `gift_code`, or `campaignId` in the output:

```bash
for slug in home all arts-entertainment gov-law; do
  echo "=== $slug ==="
  curl -sL "https://hbpl.libguides.com/digital-library/$slug" \
    | grep -oiE "(nytimes|gift_code|campaignId|pressreader|newspaper|times)" \
    | sort -u
done
```

Expected: one subpage yields matches. If none do, the "Go" button is injected via JS. Proceed to Step 2.

- [ ] **Step 2: Open HBPL in a real browser and find the button**

In Chrome, visit `https://hbpl.libguides.com/digital-library/home`. Browse every tab in the nav and every listed database. Open DevTools → Network tab → filter "doc" + "xhr". Click the "Go" / "Access" button next to New York Times. Record:

- The URL of the page that contains the Go button (e.g. `.../digital-library/<tab>`).
- Whether the button is a plain `<a href>` or triggers JS.
- If JS: the XHR request URL, method, and response body (which should contain the `nytimes.com/subscription/redeem?...` URL).
- The outermost HTML element wrapping the button (class/id) — needed for scraping.

Write findings to `docs/findings/hbpl-nyt-location.md` as plain prose.

- [ ] **Step 3: Save the HTML fixture**

Save the raw HTML of the page/response that contains the redeem URL:

```bash
# If it's a static page:
mkdir -p worker/test/fixtures
curl -sL "<discovered-url>" -o worker/test/fixtures/hbpl.html

# If it's an XHR response, save the JSON:
curl -sL "<xhr-url>" -o worker/test/fixtures/hbpl.json
```

Confirm the fixture contains a substring matching `nytimes.com/subscription/redeem` and a `gift_code=` parameter:

```bash
grep -oE "nytimes\.com/subscription/redeem[^\"'<> ]*" worker/test/fixtures/hbpl.html
```

Expected: prints at least one URL.

- [ ] **Step 4: Commit**

```bash
git add worker/test/fixtures/ docs/findings/
git commit -m "Add HBPL NYT 'Go' button findings and fixture"
```

---

### Task 2: Determine whether NYT redeem URL can be loaded in a hidden iframe

**Files:**
- Create: `docs/findings/nyt-iframe-test.md`
- Create: `/tmp/iframe-test.html` (throwaway)

- [ ] **Step 1: Write a minimal iframe test page**

Create `/tmp/iframe-test.html`:

```html
<!doctype html>
<html><body>
<h1>iframe test</h1>
<iframe id="f" src="REPLACE_WITH_REDEEM_URL" style="width:800px;height:400px;border:1px solid red"></iframe>
<script>
  document.getElementById('f').addEventListener('load', () => console.log('iframe load fired'));
</script>
</body></html>
```

Replace `REPLACE_WITH_REDEEM_URL` with a redeem URL you obtain by clicking "Go" on HBPL. Serve locally:

```bash
cd /tmp && python3 -m http.server 8765
```

- [ ] **Step 2: Open in Chrome and observe**

Visit `http://localhost:8765/iframe-test.html` in a Chrome window where you're signed into your NYT account. Open DevTools → Console.

Record in `docs/findings/nyt-iframe-test.md`:

- Does the iframe render NYT's redeem page, or is it blank?
- Any console error mentioning `X-Frame-Options`, `Content-Security-Policy`, or `frame-ancestors`?
- After ~3 seconds, in a NEW tab, visit `https://www.nytimes.com/account` and confirm the 72-hour pass is active (or any paywalled article unlocks).

- [ ] **Step 3: Record decision**

Write in the findings doc:

- If iframe redemption works → **use iframe path (primary)** from the spec.
- If iframe is blocked but redemption still fires (some browsers execute the response before blocking render) → still **use iframe path**; the hidden iframe can be display:none.
- If iframe request is blocked entirely → **use fallback path**: a top-level redirect to the redeem URL with a bookmarked "return to article" link shown on the resulting page.

- [ ] **Step 4: Commit**

```bash
git add docs/findings/nyt-iframe-test.md
git commit -m "Record findings on NYT redeem iframe viability"
```

---

### Task 3: Identify NYT paywall DOM signal

**Files:**
- Create: `docs/findings/nyt-paywall-selector.md`

- [ ] **Step 1: Open a paywalled article**

Sign out of your NYT account in Chrome. Visit:
`https://www.nytimes.com/2026/04/21/opinion/ezra-klein-podcast-alex-bores.html`

Open DevTools → Elements.

- [ ] **Step 2: Locate paywall elements**

Search the DOM for candidate signals (Cmd-F in Elements tab):

- `subscribe` — often appears in classes like `css-xxx-subscribe`, `subscribe-prompt`, `subscribe-button`.
- `paywall`
- `regiwall`
- `data-testid="gateway"`
- `data-testid="expanded-gateway"`
- `#gateway-content`

Record which ones exist on a paywalled article and which are absent on an unlocked article (sign back in to check).

- [ ] **Step 3: Pick 2-3 robust selectors**

Write to `docs/findings/nyt-paywall-selector.md` a ranked list of CSS selectors, preferring semantic/`data-testid` over class-name-hashes (NYT rotates CSS-hash class names). Example output:

```
Primary: [data-testid="gateway"]
Secondary: [data-testid="expanded-gateway"]
Tertiary: #gateway-content
```

- [ ] **Step 4: Commit**

```bash
git add docs/findings/nyt-paywall-selector.md
git commit -m "Record NYT paywall DOM selector findings"
```

---

## Phase 1: Cloudflare Worker

### Task 4: Scaffold the Worker project

**Files:**
- Create: `worker/package.json`
- Create: `worker/tsconfig.json`
- Create: `worker/wrangler.toml`
- Create: `worker/vitest.config.ts`
- Create: `worker/src/index.ts`
- Create: `worker/.gitignore`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "nyt-refresher-worker",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0",
    "wrangler": "^3.60.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

- [ ] **Step 3: Create wrangler.toml**

```toml
name = "nyt-refresher"
main = "src/index.ts"
compatibility_date = "2026-04-01"

[vars]
HBPL_FETCH_URL = "REPLACE_AFTER_TASK_1"
```

Replace `HBPL_FETCH_URL` with the URL discovered in Task 1 (the page/XHR endpoint that yields the redeem URL).

- [ ] **Step 4: Create vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
  },
});
```

- [ ] **Step 5: Create src/index.ts (stub)**

```ts
export default {
  async fetch(_req: Request, _env: Env): Promise<Response> {
    return new Response('not implemented', { status: 501 });
  },
};

export interface Env {
  HBPL_FETCH_URL: string;
  SHARED_SECRET: string;
}
```

- [ ] **Step 6: Create .gitignore**

```
node_modules
.wrangler
.dev.vars
dist
```

- [ ] **Step 7: Install and verify**

```bash
cd worker && npm install && npx tsc --noEmit && npm test
```

Expected: install succeeds, type check passes, vitest reports "No test files found" (that's fine — tests come next).

- [ ] **Step 8: Commit**

```bash
git add worker/
git commit -m "Scaffold Cloudflare Worker project"
```

---

### Task 5: Auth module — validate shared-secret token

**Files:**
- Create: `worker/src/auth.ts`
- Create: `worker/test/auth.test.ts`

- [ ] **Step 1: Write the failing test**

`worker/test/auth.test.ts`:

```ts
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
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd worker && npm test -- auth
```

Expected: FAIL — `isTokenValid is not a function` / module not found.

- [ ] **Step 3: Implement**

`worker/src/auth.ts`:

```ts
export function isTokenValid(
  provided: string | null | undefined,
  expected: string
): boolean {
  if (!provided || !expected) return false;
  if (provided.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < provided.length; i++) {
    mismatch |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}
```

- [ ] **Step 4: Run to confirm pass**

```bash
npm test -- auth
```

Expected: all 5 assertions pass.

- [ ] **Step 5: Commit**

```bash
git add worker/src/auth.ts worker/test/auth.test.ts
git commit -m "Add token-validation module"
```

---

### Task 6: Next-URL validation — reject non-NYT destinations

**Files:**
- Create: `worker/src/nextUrl.ts`
- Create: `worker/test/nextUrl.test.ts`

- [ ] **Step 1: Write the failing test**

`worker/test/nextUrl.test.ts`:

```ts
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
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm test -- nextUrl
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`worker/src/nextUrl.ts`:

```ts
const DEFAULT_NEXT = 'https://www.nytimes.com/';
const ALLOWED_HOSTS = new Set(['nytimes.com', 'www.nytimes.com']);

export function normalizeNextUrl(input: string | null | undefined): string {
  if (!input) return DEFAULT_NEXT;
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw new Error(`invalid next URL: ${input}`);
  }
  if (parsed.protocol !== 'https:') {
    throw new Error(`next URL must use https: got ${parsed.protocol}`);
  }
  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    throw new Error(`next URL host is not nytimes: ${parsed.hostname}`);
  }
  return parsed.toString();
}
```

- [ ] **Step 4: Run to confirm pass**

```bash
npm test -- nextUrl
```

Expected: all assertions pass.

- [ ] **Step 5: Commit**

```bash
git add worker/src/nextUrl.ts worker/test/nextUrl.test.ts
git commit -m "Add next-URL validator that restricts to nytimes.com"
```

---

### Task 7: HBPL scraper — extract the current redeem URL

**Files:**
- Create: `worker/src/scraper.ts`
- Create: `worker/test/scraper.test.ts`

- [ ] **Step 1: Write the failing test**

`worker/test/scraper.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { extractRedeemUrl } from '../src/scraper';

const FIXTURE = readFileSync(
  join(__dirname, 'fixtures', 'hbpl.html'),
  'utf-8'
);

describe('extractRedeemUrl', () => {
  it('finds the redeem URL in the HBPL fixture', () => {
    const url = extractRedeemUrl(FIXTURE);
    expect(url).toMatch(/^https:\/\/www\.nytimes\.com\/subscription\/redeem\?/);
    expect(url).toContain('campaignId=');
    expect(url).toContain('gift_code=');
  });

  it('returns null when no redeem URL is present', () => {
    expect(extractRedeemUrl('<html><body>nothing here</body></html>')).toBeNull();
  });

  it('returns the first match when multiple are present', () => {
    const html = `
      <a href="https://www.nytimes.com/subscription/redeem?campaignId=A&gift_code=111">first</a>
      <a href="https://www.nytimes.com/subscription/redeem?campaignId=B&gift_code=222">second</a>
    `;
    expect(extractRedeemUrl(html)).toContain('gift_code=111');
  });

  it('decodes HTML entities in the URL', () => {
    const html = `<a href="https://www.nytimes.com/subscription/redeem?campaignId=A&amp;gift_code=xyz">Go</a>`;
    const url = extractRedeemUrl(html);
    expect(url).toBe('https://www.nytimes.com/subscription/redeem?campaignId=A&gift_code=xyz');
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm test -- scraper
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`worker/src/scraper.ts`:

```ts
const REDEEM_RE =
  /https:\/\/www\.nytimes\.com\/subscription\/redeem\?[^\s"'<>]+/;

export function extractRedeemUrl(html: string): string | null {
  const match = html.match(REDEEM_RE);
  if (!match) return null;
  return match[0].replace(/&amp;/g, '&');
}
```

- [ ] **Step 4: Run to confirm pass**

```bash
npm test -- scraper
```

Expected: all assertions pass.

**Note:** If Task 1 discovered that the redeem URL lives in a JSON XHR response rather than HTML, rename this module `extractRedeemUrlFromJson` and adapt the regex / parse JSON. Keep the tests aligned.

- [ ] **Step 5: Commit**

```bash
git add worker/src/scraper.ts worker/test/scraper.test.ts
git commit -m "Add HBPL redeem-URL extractor"
```

---

### Task 8: Bounce-page HTML generator

**Files:**
- Create: `worker/src/bounce.ts`
- Create: `worker/test/bounce.test.ts`

- [ ] **Step 1: Write the failing test**

`worker/test/bounce.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { bounceHtml } from '../src/bounce';

describe('bounceHtml', () => {
  const redeemUrl = 'https://www.nytimes.com/subscription/redeem?campaignId=X&gift_code=Y';
  const nextUrl = 'https://www.nytimes.com/article';

  it('embeds the redeem URL in a hidden iframe', () => {
    const html = bounceHtml(redeemUrl, nextUrl);
    expect(html).toContain(`src="${redeemUrl}"`);
    expect(html).toMatch(/<iframe[^>]+hidden/);
  });

  it('top-level navigates to next after a delay', () => {
    const html = bounceHtml(redeemUrl, nextUrl);
    expect(html).toContain(`location.replace("${nextUrl}")`);
  });

  it('escapes quotes in the next URL to prevent script injection', () => {
    const evilNext = 'https://www.nytimes.com/" onload="alert(1)';
    const html = bounceHtml(redeemUrl, evilNext);
    expect(html).not.toContain('onload="alert');
  });

  it('returns Content-Type text/html-compatible string', () => {
    const html = bounceHtml(redeemUrl, nextUrl);
    expect(html).toMatch(/^<!doctype html>/i);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm test -- bounce
```

Expected: FAIL.

- [ ] **Step 3: Implement**

`worker/src/bounce.ts`:

```ts
const BOUNCE_DELAY_MS = 2500;

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeJs(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/</g, '\\u003c')
    .replace(/\r?\n/g, '');
}

export function bounceHtml(redeemUrl: string, nextUrl: string): string {
  const safeIframeSrc = escape(redeemUrl);
  const safeJsNext = escapeJs(nextUrl);
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Refreshing NYT pass…</title></head>
<body>
<p>Refreshing your NYT pass…</p>
<iframe src="${safeIframeSrc}" hidden style="width:0;height:0;border:0"></iframe>
<script>
setTimeout(function(){location.replace("${safeJsNext}")}, ${BOUNCE_DELAY_MS});
</script>
</body></html>`;
}
```

- [ ] **Step 4: Run to confirm pass**

```bash
npm test -- bounce
```

Expected: all assertions pass.

- [ ] **Step 5: If Task 2 found iframe is blocked, switch to fallback bounce**

Only do this step if `docs/findings/nyt-iframe-test.md` concluded the iframe path doesn't work.

Replace the `bounceHtml` implementation with a top-level redirect + manual-continue fallback:

```ts
const BOUNCE_DELAY_MS = 2500;

function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function bounceHtml(redeemUrl: string, nextUrl: string): string {
  const safeRedeem = escape(redeemUrl);
  const safeNext = escape(nextUrl);
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Refreshing NYT pass…</title>
<meta http-equiv="refresh" content="0;url=${safeRedeem}">
</head>
<body>
<p>Redeeming your library pass, then returning to your article…</p>
<p>If you are not automatically returned, <a id="back" href="${safeNext}">click here to continue</a>.</p>
<script>
window.addEventListener("pageshow", function(){setTimeout(function(){location.replace(${JSON.stringify(nextUrl)})}, 500)});
</script>
</body></html>`;
}
```

Update `bounce.test.ts` to match the fallback shape: assert the response contains a `<meta http-equiv="refresh" ...redeem...>` and a link to `nextUrl`. Keep the XSS-escape tests. Re-run `npm test -- bounce` until green.

**Why this works:** Top-level navigation to the redeem URL causes NYT to set the 72-hour cookies in a first-party context. When the user returns (either via the redeem page's own redirect or the manual "continue" link), the article is unlocked.

- [ ] **Step 6: Commit**

```bash
git add worker/src/bounce.ts worker/test/bounce.test.ts
git commit -m "Add bounce-page HTML generator"
```

---

### Task 9: Main handler — wire modules together

**Files:**
- Modify: `worker/src/index.ts` (replace stub)
- Create: `worker/test/handler.test.ts`

- [ ] **Step 1: Write the failing test**

`worker/test/handler.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker, { Env } from '../src/index';

const env: Env = {
  HBPL_FETCH_URL: 'https://hbpl.example/nyt',
  SHARED_SECRET: 'test-secret-12345',
};

function req(url: string): Request {
  return new Request(url);
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('worker.fetch', () => {
  it('returns 401 when token is missing', async () => {
    const res = await worker.fetch(req('https://w/refresh?next=https://www.nytimes.com/x'), env);
    expect(res.status).toBe(401);
  });

  it('returns 401 when token is wrong', async () => {
    const res = await worker.fetch(req('https://w/refresh?next=https://www.nytimes.com/x&t=wrong'), env);
    expect(res.status).toBe(401);
  });

  it('returns 400 when next URL is not nytimes', async () => {
    const res = await worker.fetch(req('https://w/refresh?next=https://evil.com&t=test-secret-12345'), env);
    expect(res.status).toBe(400);
  });

  it('returns 404 for unknown paths', async () => {
    const res = await worker.fetch(req('https://w/other?t=test-secret-12345'), env);
    expect(res.status).toBe(404);
  });

  it('returns 502 when HBPL page has no redeem URL', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>no link</html>')));
    const res = await worker.fetch(
      req('https://w/refresh?next=https://www.nytimes.com/x&t=test-secret-12345'),
      env
    );
    expect(res.status).toBe(502);
  });

  it('returns bounce HTML on success', async () => {
    const hbpl = `<a href="https://www.nytimes.com/subscription/redeem?campaignId=A&gift_code=Z">go</a>`;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(hbpl)));
    const res = await worker.fetch(
      req('https://w/refresh?next=https://www.nytimes.com/article&t=test-secret-12345'),
      env
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const body = await res.text();
    expect(body).toContain('gift_code=Z');
    expect(body).toContain('https://www.nytimes.com/article');
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm test -- handler
```

Expected: FAIL — worker.fetch still returns 501 for all paths.

- [ ] **Step 3: Implement**

Replace the contents of `worker/src/index.ts`:

```ts
import { isTokenValid } from './auth';
import { normalizeNextUrl } from './nextUrl';
import { extractRedeemUrl } from './scraper';
import { bounceHtml } from './bounce';

export interface Env {
  HBPL_FETCH_URL: string;
  SHARED_SECRET: string;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname !== '/refresh') {
      return new Response('not found', { status: 404 });
    }

    const token = url.searchParams.get('t');
    if (!isTokenValid(token, env.SHARED_SECRET)) {
      return new Response('unauthorized', { status: 401 });
    }

    let nextUrl: string;
    try {
      nextUrl = normalizeNextUrl(url.searchParams.get('next'));
    } catch (e) {
      return new Response(`bad next: ${(e as Error).message}`, { status: 400 });
    }

    let hbplBody: string;
    try {
      const r = await fetch(env.HBPL_FETCH_URL, {
        headers: { 'user-agent': 'Mozilla/5.0 (compatible; nyt-refresher/1.0)' },
      });
      if (!r.ok) {
        return new Response(`hbpl fetch failed: ${r.status}`, { status: 502 });
      }
      hbplBody = await r.text();
    } catch (e) {
      return new Response(`hbpl fetch error: ${(e as Error).message}`, { status: 502 });
    }

    const redeem = extractRedeemUrl(hbplBody);
    if (!redeem) {
      return new Response('no redeem URL found on HBPL page', { status: 502 });
    }

    return new Response(bounceHtml(redeem, nextUrl), {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
      },
    });
  },
};
```

- [ ] **Step 4: Run to confirm pass**

```bash
npm test
```

Expected: all tests across all files pass.

- [ ] **Step 5: Commit**

```bash
git add worker/src/index.ts worker/test/handler.test.ts
git commit -m "Wire Worker handler: auth, scrape, bounce"
```

---

### Task 10: Local smoke test with `wrangler dev`

**Files:**
- Create: `worker/.dev.vars` (git-ignored)

- [ ] **Step 1: Create local secrets**

`worker/.dev.vars`:

```
SHARED_SECRET=local-dev-secret-change-me
```

Confirm `.dev.vars` is in `.gitignore` (added in Task 4).

- [ ] **Step 2: Start wrangler dev**

```bash
cd worker && npx wrangler dev --local
```

Keep this running. Opens on `http://localhost:8787` by default.

- [ ] **Step 3: Hit every error path with curl**

In another terminal:

```bash
curl -i "http://localhost:8787/refresh"                          # 401
curl -i "http://localhost:8787/refresh?t=wrong"                  # 401
curl -i "http://localhost:8787/refresh?t=local-dev-secret-change-me&next=https://evil.com"  # 400
curl -i "http://localhost:8787/bogus?t=local-dev-secret-change-me"  # 404
```

Expected status codes as commented.

- [ ] **Step 4: Hit the happy path in a browser**

Open:
```
http://localhost:8787/refresh?t=local-dev-secret-change-me&next=https://www.nytimes.com/2026/04/21/opinion/ezra-klein-podcast-alex-bores.html
```

Expected:
- You see "Refreshing your NYT pass…" briefly.
- Page redirects to the Ezra Klein article.
- Article loads **unlocked** (if you're signed into NYT).

If paywall still appears, check:
- Worker's console log for HBPL fetch / redeem extraction.
- That your NYT account is signed in.
- Task 2 findings on iframe blocking — may need fallback path.

- [ ] **Step 5: Commit the dev.vars template (safely)**

Add a `.dev.vars.example` with a placeholder; do NOT commit real secret:

```bash
echo 'SHARED_SECRET=change-me' > worker/.dev.vars.example
git add worker/.dev.vars.example
git commit -m "Add .dev.vars example for local development"
```

---

### Task 11: Deploy Worker to Cloudflare

**Files:**
- (no new files; deploy only)

- [ ] **Step 1: Authenticate wrangler with Cloudflare**

```bash
cd worker && npx wrangler login
```

Browser opens for Cloudflare OAuth. Approve.

- [ ] **Step 2: Generate a production shared secret**

```bash
openssl rand -hex 32
```

Save this string locally — you'll need it for the extension and Shortcut. Do NOT commit it.

- [ ] **Step 3: Upload secret to Worker**

```bash
echo "<generated-secret-from-step-2>" | npx wrangler secret put SHARED_SECRET
```

Confirm with:

```bash
npx wrangler secret list
```

Expected: `SHARED_SECRET` shown.

- [ ] **Step 4: Deploy**

```bash
npx wrangler deploy
```

Expected: output includes `https://nyt-refresher.<your-subdomain>.workers.dev`. Record this URL.

- [ ] **Step 5: Smoke test production**

```bash
curl -i "https://nyt-refresher.<your-subdomain>.workers.dev/refresh"
# Expected: 401

curl -i "https://nyt-refresher.<your-subdomain>.workers.dev/refresh?t=<your-secret>&next=https://www.nytimes.com/"
# Expected: 200, HTML body containing a redeem iframe
```

Then open the 200 URL in a browser (signed into NYT). Expected: article loads unlocked.

- [ ] **Step 6: Record the production URL**

`docs/findings/production.md`:

```markdown
Worker URL: https://nyt-refresher.<subdomain>.workers.dev
Shared secret: stored in 1Password / macOS Keychain (do not commit).
Deployed: 2026-04-21
```

- [ ] **Step 7: Commit**

```bash
git add docs/findings/production.md
git commit -m "Record deployed Worker URL"
```

---

## Phase 2: Chrome Extension

### Task 12: Extension scaffold (manifest + icons placeholder)

**Files:**
- Create: `extension/manifest.json`
- Create: `extension/icons/icon16.png`
- Create: `extension/icons/icon48.png`
- Create: `extension/icons/icon128.png`

- [ ] **Step 1: Create manifest.json**

```json
{
  "manifest_version": 3,
  "name": "NYT Library Refresher",
  "version": "0.1.0",
  "description": "Automatically redeems the HBPL library NYT pass when a paywall appears.",
  "permissions": ["storage"],
  "host_permissions": ["*://*.nytimes.com/*"],
  "content_scripts": [
    {
      "matches": ["*://www.nytimes.com/*"],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ],
  "options_page": "options.html",
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

- [ ] **Step 2: Generate placeholder icons**

```bash
cd extension && mkdir -p icons
# Generate solid-color placeholder PNGs with ImageMagick (already on macOS):
for size in 16 48 128; do
  magick -size ${size}x${size} xc:"#6666ff" icons/icon${size}.png
done
# If 'magick' isn't installed, any 1x1 PNG at each filename works for now.
```

- [ ] **Step 3: Verify manifest loads**

In Chrome, open `chrome://extensions`, enable Developer Mode, click "Load unpacked", select the `extension/` directory. Expected: extension loads without errors.

- [ ] **Step 4: Commit**

```bash
git add extension/
git commit -m "Scaffold Chrome extension: manifest and icons"
```

---

### Task 13: Options page — store Worker URL + token

**Files:**
- Create: `extension/options.html`
- Create: `extension/options.js`

- [ ] **Step 1: Create options.html**

```html
<!doctype html>
<html>
<head>
  <title>NYT Library Refresher — Options</title>
  <style>
    body { font-family: -apple-system, sans-serif; max-width: 480px; padding: 24px; }
    label { display: block; margin-top: 12px; font-weight: 600; }
    input { width: 100%; padding: 6px; margin-top: 4px; font-family: monospace; }
    button { margin-top: 16px; padding: 8px 16px; }
    .status { margin-top: 12px; color: #0a7; min-height: 1em; }
  </style>
</head>
<body>
  <h1>NYT Library Refresher</h1>
  <label>Worker URL
    <input id="workerUrl" type="url" placeholder="https://nyt-refresher.xxx.workers.dev">
  </label>
  <label>Shared secret
    <input id="token" type="password" placeholder="32-char token">
  </label>
  <button id="save">Save</button>
  <div id="status" class="status"></div>
  <script src="options.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create options.js**

```js
const $ = (id) => document.getElementById(id);

async function load() {
  const { workerUrl = '', token = '' } = await chrome.storage.sync.get(['workerUrl', 'token']);
  $('workerUrl').value = workerUrl;
  $('token').value = token;
}

async function save() {
  const workerUrl = $('workerUrl').value.trim();
  const token = $('token').value.trim();
  if (!workerUrl || !token) {
    $('status').textContent = 'Both fields required.';
    $('status').style.color = '#c00';
    return;
  }
  try {
    new URL(workerUrl);
  } catch {
    $('status').textContent = 'Worker URL is not a valid URL.';
    $('status').style.color = '#c00';
    return;
  }
  await chrome.storage.sync.set({ workerUrl, token });
  $('status').textContent = 'Saved.';
  $('status').style.color = '#0a7';
}

document.addEventListener('DOMContentLoaded', load);
$('save').addEventListener('click', save);
```

- [ ] **Step 3: Manually verify**

Reload the extension at `chrome://extensions`. Click "Extension options" (or Details → Extension options). Enter your Worker URL and production secret (from Task 11). Click Save. Reopen the options — fields should be prefilled.

- [ ] **Step 4: Commit**

```bash
git add extension/options.html extension/options.js
git commit -m "Add extension options page"
```

---

### Task 14: Content script — detect paywall and trigger refresh

**Files:**
- Create: `extension/content.js`

- [ ] **Step 1: Create content.js**

Use the selector list from Task 3. Replace the `PAYWALL_SELECTORS` array with your actual findings:

```js
// Selectors from Task 3 findings; ordered by preference.
const PAYWALL_SELECTORS = [
  '[data-testid="gateway"]',
  '[data-testid="expanded-gateway"]',
  '#gateway-content',
];

const REFRESH_IN_PROGRESS_KEY = 'nytRefresherInProgress';
const REFRESH_COOLDOWN_MS = 15_000;

function paywallPresent() {
  return PAYWALL_SELECTORS.some((sel) => document.querySelector(sel));
}

async function getConfig() {
  const { workerUrl, token } = await chrome.storage.sync.get(['workerUrl', 'token']);
  if (!workerUrl || !token) {
    console.warn('[nyt-refresher] not configured; open extension options');
    return null;
  }
  return { workerUrl: workerUrl.replace(/\/$/, ''), token };
}

function triggerRefresh(workerUrl, token) {
  // Prevent redirect loops: if we just tried and paywall still shows, don't loop.
  const last = sessionStorage.getItem(REFRESH_IN_PROGRESS_KEY);
  if (last && Date.now() - Number(last) < REFRESH_COOLDOWN_MS) {
    console.warn('[nyt-refresher] refresh already attempted in last 15s; aborting to avoid loop');
    return;
  }
  sessionStorage.setItem(REFRESH_IN_PROGRESS_KEY, String(Date.now()));

  const next = encodeURIComponent(location.href);
  const t = encodeURIComponent(token);
  const url = `${workerUrl}/refresh?next=${next}&t=${t}`;
  console.log('[nyt-refresher] paywall detected; refreshing via', workerUrl);
  location.href = url;
}

async function check() {
  if (!paywallPresent()) return;
  const cfg = await getConfig();
  if (!cfg) return;
  triggerRefresh(cfg.workerUrl, cfg.token);
}

// Initial check after DOM settles.
check();

// Watch for late-loading paywalls (NYT injects the gateway after React hydrates).
const observer = new MutationObserver(() => check());
observer.observe(document.body, { childList: true, subtree: true });

// Stop watching after 10s to avoid long-lived observer.
setTimeout(() => observer.disconnect(), 10_000);
```

- [ ] **Step 2: Reload extension and verify in a paywalled article**

At `chrome://extensions`, click the refresh icon on the NYT Library Refresher card. Sign out of NYT. Open:

`https://www.nytimes.com/2026/04/21/opinion/ezra-klein-podcast-alex-bores.html`

Expected (in DevTools Console): `[nyt-refresher] paywall detected; refreshing via <your-worker-url>`, then the tab redirects to the Worker, then back to the article. If signed into NYT, the article is unlocked.

- [ ] **Step 3: Verify no loop**

Sign out of NYT entirely (so the redemption has no account to grant access to). Open the article again. Expected: ONE refresh attempt, then no further redirects (cooldown blocks the loop). The console shows the cooldown message.

- [ ] **Step 4: Commit**

```bash
git add extension/content.js
git commit -m "Add paywall-detection content script"
```

---

## Phase 3: iOS Shortcut

### Task 15: Build and document the iOS Shortcut

**Files:**
- Create: `shortcut/README.md`

- [ ] **Step 1: Build the Shortcut on iPhone**

On your iPhone, open the Shortcuts app → + (new shortcut). Add these actions in order:

1. **Receive** → "URLs" from "Share Sheet" (toggle "Show in Share Sheet" ON).
2. **URL Encode** → input: "Shortcut Input".
3. **Text** → `https://<your-worker>.workers.dev/refresh?next=` + "URL Encoded Text" + `&t=<your-shared-secret>`.
4. **Open URLs** → input: "Text" from previous action.

Rename the shortcut to "Unlock NYT".

- [ ] **Step 2: Test from Safari**

On iPhone Safari, visit any paywalled NYT article. Tap Share → "Unlock NYT". Expected: Safari navigates to Worker → bounces back to article; article unlocks (if signed into NYT).

- [ ] **Step 3: Export iCloud link**

In Shortcuts: long-press "Unlock NYT" → Share → Copy iCloud Link. Paste into `shortcut/README.md`:

```markdown
# iOS Shortcut — Unlock NYT

## Install
iCloud link: <paste the icloud.com/shortcuts/... URL here>

The shortcut has secrets baked in (Worker URL + shared token). Do not share this link publicly — anyone with it can burn your HBPL NYT passes.

## Use
Safari → any NYT article → Share → "Unlock NYT". After ~3 seconds, the article unlocks.

## Rebuild manually
1. Shortcuts → +
2. Receive URLs from Share Sheet
3. URL Encode Shortcut Input
4. Text: https://<WORKER>.workers.dev/refresh?next=<EncodedText>&t=<SECRET>
5. Open URLs → Text
```

- [ ] **Step 4: Commit**

```bash
git add shortcut/README.md
git commit -m "Document iOS Shortcut installation"
```

---

## Phase 4: Acceptance test

### Task 16: Full end-to-end verification with the target article

**Files:**
- Create: `docs/findings/acceptance-2026-04-21.md`

- [ ] **Step 1: Fresh-state Mac Chrome test**

- In Chrome, sign out of NYT.
- Open DevTools → Application → Cookies → Clear nytimes.com cookies.
- Sign back into NYT via Google.
- Visit: `https://www.nytimes.com/2026/04/21/opinion/ezra-klein-podcast-alex-bores.html`

Expected: brief flash of paywall → Worker bounce → article loads unlocked. Record result in findings.

- [ ] **Step 2: iPhone Safari test**

- Open the same article URL on iPhone Safari.

Expected: loads unlocked (because Step 1 granted 72 hours to the account).

Record result.

- [ ] **Step 3: iOS app test**

- Open the NYT iOS app (signed in with same account).
- Search for Ezra Klein's podcast with Alex Bores.

Expected: article plays / reads unlocked.

Record result.

- [ ] **Step 4: Shortcut-only test (simulate Mac-off)**

- Uninstall the Chrome extension (or toggle off).
- Wait >72 hours OR: go to `nytimes.com/account` on any device and cancel the current group pass if cancellable, otherwise skip this step.
- On iPhone Safari, visit the target article.

Expected: paywall appears. Tap Share → "Unlock NYT". Article unlocks.

Record result. If you can't force pass expiry, note that in findings.

- [ ] **Step 5: Write acceptance report**

`docs/findings/acceptance-2026-04-21.md`:

```markdown
# Acceptance test — 2026-04-21

Target article: https://www.nytimes.com/2026/04/21/opinion/ezra-klein-podcast-alex-bores.html

| Test | Result | Notes |
|------|--------|-------|
| Mac Chrome + extension | <pass/fail> | ... |
| iPhone Safari (inherits access) | <pass/fail> | ... |
| NYT iOS app (inherits access) | <pass/fail> | ... |
| iOS Shortcut fallback | <pass/fail/skipped> | ... |
```

- [ ] **Step 6: Commit**

```bash
git add docs/findings/acceptance-2026-04-21.md
git commit -m "Record end-to-end acceptance test results"
```

- [ ] **Step 7: Update README**

`README.md` (replace existing):

```markdown
# library-subscription-refresher

Automates the Huntington Beach Public Library NYT pass redemption so NYT articles open unlocked on Mac and iPhone.

## Layout
- `worker/` — Cloudflare Worker (the brain)
- `extension/` — Chrome MV3 extension (desktop)
- `shortcut/` — iOS Shortcut (mobile fallback)
- `docs/superpowers/specs/` — design
- `docs/superpowers/plans/` — implementation plan
- `docs/findings/` — discovery notes and acceptance results

## Setup
See `docs/superpowers/plans/2026-04-21-nyt-library-refresher.md` for full instructions.

## Secrets
- Shared secret lives only in the deployed Worker (`wrangler secret`), in Chrome extension's `chrome.storage.sync`, and in the iOS Shortcut.
- Library card / PIN are not used in v1 (HBPL's "Go" button needs no authentication beyond cookies).
```

Commit:

```bash
git add README.md
git commit -m "Update README with project layout and setup pointer"
```

---

## Done

After Task 16, the acceptance test passes, the Worker is deployed, the extension is installed, and the Shortcut is on the phone. Clicking an NYT link on any signed-in device just works.

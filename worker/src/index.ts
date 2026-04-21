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

    let location: string | null;
    try {
      const r = await fetch(env.HBPL_FETCH_URL, {
        redirect: 'manual',
        headers: { 'user-agent': 'Mozilla/5.0 (compatible; nyt-refresher/1.0)' },
      });
      location = r.headers.get('location');
    } catch (e) {
      // Network-level failure — return early with a specific 502 message.
      return new Response(`hbpl fetch error: ${(e as Error).message}`, { status: 502 });
    }

    const redeem = extractRedeemUrl(location);
    if (!redeem) {
      return new Response('no valid redeem URL from HBPL', { status: 502 });
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

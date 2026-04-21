import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker, { Env } from '../src/index';

const env: Env = {
  HBPL_FETCH_URL: 'https://hbpl.example/nyt',
  SHARED_SECRET: 'test-secret-12345',
};

function req(url: string): Request {
  return new Request(url);
}

function mockHbpl302(location: string | null): Response {
  const headers = new Headers();
  if (location !== null) headers.set('location', location);
  return new Response('', { status: 302, headers });
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

  it('returns 502 when HBPL response has no Location header', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockHbpl302(null)));
    const res = await worker.fetch(
      req('https://w/refresh?next=https://www.nytimes.com/x&t=test-secret-12345'),
      env
    );
    expect(res.status).toBe(502);
  });

  it('returns 502 when HBPL Location is not a valid redeem URL', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockHbpl302('https://elsewhere.com/')));
    const res = await worker.fetch(
      req('https://w/refresh?next=https://www.nytimes.com/x&t=test-secret-12345'),
      env
    );
    expect(res.status).toBe(502);
  });

  it('returns 502 when HBPL fetch errors out', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    const res = await worker.fetch(
      req('https://w/refresh?next=https://www.nytimes.com/x&t=test-secret-12345'),
      env
    );
    expect(res.status).toBe(502);
  });

  it('returns 200 + bounce HTML on success', async () => {
    const redeem = 'https://www.nytimes.com/subscription/redeem?campaignId=A&gift_code=Z';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockHbpl302(redeem)));
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

  it('calls fetch with redirect: manual to avoid following HBPL 302', async () => {
    const redeem = 'https://www.nytimes.com/subscription/redeem?campaignId=A&gift_code=Z';
    const fetchSpy = vi.fn().mockResolvedValue(mockHbpl302(redeem));
    vi.stubGlobal('fetch', fetchSpy);
    await worker.fetch(
      req('https://w/refresh?next=https://www.nytimes.com/x&t=test-secret-12345'),
      env
    );
    const opts = fetchSpy.mock.calls[0][1];
    expect(opts?.redirect).toBe('manual');
  });
});

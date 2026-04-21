const ALLOWED_HOSTS = new Set(['nytimes.com', 'www.nytimes.com']);
const REDEEM_PATH = '/subscription/redeem';

export function extractRedeemUrl(location: string | null | undefined): string | null {
  if (!location) return null;
  let parsed: URL;
  try {
    parsed = new URL(location);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  if (!ALLOWED_HOSTS.has(parsed.hostname)) return null;
  if (parsed.pathname !== REDEEM_PATH) return null;
  if (!parsed.searchParams.get('gift_code')) return null;
  return parsed.toString();
}

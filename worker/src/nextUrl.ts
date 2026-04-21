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

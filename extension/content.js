// Paywall selectors — order-of-preference list from docs/findings/nyt-paywall-selector.md.
// If a new paywall variant appears, add its selector here.
const PAYWALL_SELECTORS = [
  '[data-testid="gateway"]',
  '[data-testid="expanded-gateway"]',
  '[data-testid="inline-message"]',
  '#gateway-content',
  '[id^="gateway-content-"]',
];

const COOLDOWN_KEY = 'nytRefresherLastAttempt';
const COOLDOWN_MS = 15_000;
const OBSERVER_TIMEOUT_MS = 10_000;

function paywallPresent() {
  return PAYWALL_SELECTORS.some((sel) => document.querySelector(sel));
}

async function getConfig() {
  const { workerUrl, token } = await chrome.storage.sync.get(['workerUrl', 'token']);
  if (!workerUrl || !token) {
    console.warn('[nyt-refresher] extension not configured; open Options to set Worker URL and token');
    return null;
  }
  return { workerUrl: workerUrl.replace(/\/$/, ''), token };
}

function recentlyAttempted() {
  const last = sessionStorage.getItem(COOLDOWN_KEY);
  if (!last) return false;
  return Date.now() - Number(last) < COOLDOWN_MS;
}

function triggerRefresh(workerUrl, token) {
  if (recentlyAttempted()) {
    console.warn('[nyt-refresher] refresh already attempted within cooldown; aborting to avoid loop');
    return;
  }
  sessionStorage.setItem(COOLDOWN_KEY, String(Date.now()));
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

check();

const observer = new MutationObserver(() => check());
observer.observe(document.documentElement, { childList: true, subtree: true });

setTimeout(() => observer.disconnect(), OBSERVER_TIMEOUT_MS);

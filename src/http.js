// Polite HTTP client: honest User-Agent with contact, fixed delay between
// requests to the same host, timeout and a few retries on network/5xx errors.

export const USER_AGENT =
  'RevoSellBot/0.1 (+https://prostoyy17.github.io/Discounts/; bezzimeni17@gmail.com)';

const lastRequestAt = new Map();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function politeFetch(url, { delayMs = 2000, retries = 3, timeoutMs = 30000, method = 'GET' } = {}) {
  const host = new URL(url).host;
  for (let attempt = 0; ; attempt++) {
    const wait = (lastRequestAt.get(host) ?? 0) + delayMs - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt.set(host, Date.now());
    try {
      const res = await fetch(url, {
        method,
        headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'tr-TR,tr;q=0.9' },
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'follow',
      });
      if (res.status >= 500 && attempt < retries) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (err) {
      if (attempt >= retries) throw new Error(`${url}: ${err.message}`);
      await sleep(2000 * 2 ** attempt);
    }
  }
}

export async function fetchText(url, opts) {
  const res = await politeFetch(url, opts);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

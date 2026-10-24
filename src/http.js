// Polite HTTP client: honest User-Agent with contact, fixed delay between
// requests to the same host, timeout and a few retries on network/5xx errors.

export const USER_AGENT =
  'RevoSellBot/0.1 (+https://prostoyy17.github.io/Discounts/; bezzimeni17@gmail.com)';

const lastRequestAt = new Map();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// `lane` lets a few crawls of one site run side by side, each keeping its own
// pause (e.g. one lane per Магнит store); `headers` adds request headers.
export async function politeFetch(url, { delayMs = 2000, retries = 3, timeoutMs = 30000, method = 'GET', headers = {}, lane = '' } = {}) {
  const host = new URL(url).host + (lane ? `#${lane}` : '');
  for (let attempt = 0; ; attempt++) {
    const wait = (lastRequestAt.get(host) ?? 0) + delayMs - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt.set(host, Date.now());
    try {
      const res = await fetch(url, {
        method,
        headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'tr-TR,tr;q=0.9', ...headers },
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

// JPEG, PNG, GIF, WebP, AVIF/HEIF signatures.
const IMAGE_MAGIC = [
  (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46,
  (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45,
  (b) => b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70,
];

/**
 * Checks that an image URL really serves an image. Some CDNs (Migros) send
 * real JPEGs as application/octet-stream — browsers still show them in <img>,
 * so when the header is not image/* we look at the file's first bytes.
 * Returns null when fine, or a problem description.
 */
export async function imageProblem(url) {
  try {
    const head = await politeFetch(url, { method: 'HEAD', delayMs: 300 });
    if (!head.ok) return `görsel: HTTP ${head.status}`;
    if ((head.headers.get('content-type') ?? '').startsWith('image/')) return null;
    const res = await politeFetch(url, { delayMs: 300 });
    const bytes = new Uint8Array(await res.arrayBuffer()).subarray(0, 16);
    return IMAGE_MAGIC.some((f) => f(bytes)) ? null : `görsel değil: ${head.headers.get('content-type')}`;
  } catch (e) {
    return `görsel açılmadı: ${e.message}`;
  }
}

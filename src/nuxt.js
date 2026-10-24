// Reads the data a Nuxt 3 page ships in <script id="__NUXT_DATA__">: a flat
// JSON array where objects and arrays hold indexes of their values
// ("devalue" format). Wrappers like ["ShallowReactive", i] are unwrapped.

const WRAPPERS = new Set(['ShallowReactive', 'Reactive', 'Ref', 'ShallowRef', 'EmptyRef', 'EmptyShallowRef', 'NuxtError', 'Island', 'JSON', 'Set', 'Map']);

export function nuxtData(html) {
  const m = html.match(/<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('__NUXT_DATA__ yok');
  const arr = JSON.parse(m[1]);
  const memo = new Map();
  const rev = (i) => {
    if (i === -1) return undefined;
    if (i < 0) return null; // -2 hole, -3 NaN, ... never used for prices
    if (memo.has(i)) return memo.get(i);
    const v = arr[i];
    if (Array.isArray(v)) {
      if (v[0] === 'Date') return v[1];
      if (WRAPPERS.has(v[0])) { const out = rev(v[1]); memo.set(i, out); return out; }
      const out = []; memo.set(i, out);
      for (const x of v) out.push(rev(x));
      return out;
    }
    if (v && typeof v === 'object') {
      const out = {}; memo.set(i, out);
      for (const [k, x] of Object.entries(v)) out[k] = rev(x);
      return out;
    }
    memo.set(i, v);
    return v;
  };
  return rev(0);
}

/** The first entry of payload.data whose key starts with `prefix`. */
export function dataEntry(payload, prefix) {
  const hit = Object.entries(payload?.data ?? {}).find(([k]) => k.startsWith(prefix));
  return hit ? hit[1] : null;
}

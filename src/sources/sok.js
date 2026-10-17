// ŞOK Market (www.sokmarket.com.tr) — online catalog: "Market" groceries plus
// "Ekstra" (electronics, white goods, clothing…, shipped by partners).
//
// Page layout (checked 17.10.2026):
//   - Next.js app router: page data is streamed as `self.__next_f.push([1,"…"])`
//     JS string chunks. Joined, they contain plain JSON objects.
//   - Category listing (/<slug>-c-<id>, /ekstra/<slug>-c-<id>) holds
//     "initialSearchResult": { results: [...20 products], page: { totalElements,
//     totalPages, number } }. Further pages: ?page=2, ?page=3 … (1-based in the
//     URL, `number` is 0-based).
//   - Product: { product: { id, name, brand.name, images[{host,path}], path },
//     prices: { discounted.value, original.value }, hasStock, serviceType,
//     sku.breadCrumbs[...] }. A discount is original > discounted.
//   - Detail page (/<path>) holds "productData" with the same shape.
//   - Prices are the online shop's default-store prices (no address chosen).

export const BASE = 'https://www.sokmarket.com.tr';
export const ENTRY_URLS = [`${BASE}/`, `${BASE}/ekstra`];
// The default order (SCORE_DESC) repeats a few items across neighbouring
// pages; paging in price order (?siralama=PRICE_ASC) is stable.
export const SORT_ASC = 'PRICE_ASC';
export const SORT_DESC = 'PRICE_DESC';
export const pageUrl = (path, n, sort = SORT_ASC) => `${BASE}/${path}?siralama=${sort}${n > 1 ? `&page=${n}` : ''}`;

const clean = (s) => (s ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

/** Joins the Next.js flight chunks into one string. */
export function flightData(html) {
  const out = [];
  const re = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/gs;
  for (const m of html.matchAll(re)) out.push(JSON.parse(m[1]));
  return out.join('');
}

/** Parses the JSON value that follows `"key":` (first occurrence). */
export function jsonAfterKey(s, key) {
  const marker = `"${key}":`;
  const at = s.indexOf(marker);
  if (at < 0) return undefined;
  let i = at + marker.length;
  const open = s[i];
  const close = open === '{' ? '}' : open === '[' ? ']' : null;
  if (!close) return undefined;
  let depth = 0, inStr = false;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (inStr) {
      if (c === '\\') j++;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === open) depth++;
    else if (c === close && --depth === 0) return JSON.parse(s.slice(i, j + 1));
  }
  return undefined;
}

/** Root categories of Market and Ekstra from the entry pages' navigation. */
export function parseCategories(html) {
  const seen = new Map();
  for (const m of html.matchAll(/href="\/((?:ekstra\/)?[a-z0-9-]+-c-(\d+))"/g)) {
    const [, path, id] = m;
    const key = `${path.startsWith('ekstra/') ? 'ekstra' : 'market'}-${id}`;
    if (!seen.has(key)) seen.set(key, { id, path, kind: path.startsWith('ekstra/') ? 'ekstra' : 'market' });
  }
  return [...seen.values()];
}

/**
 * Listing page -> { results, page, canonicalPath }.
 * Menu links are not always canonical ("giyim-ve-ayakkabi-ve-aksesuar-c-20886"
 * vs canonical "giyim-ayakkabi-ve-aksesuar-c-20886"), and on a non-canonical
 * URL ŞOK ignores ?page= and keeps serving page 1. searchParams holds the
 * canonical slug, so later pages must be requested with canonicalPath.
 */
export function parseListing(html) {
  const flight = flightData(html);
  const r = jsonAfterKey(flight, 'initialSearchResult');
  if (!r || !Array.isArray(r.results) || !r.page) return null;
  const sp = jsonAfterKey(flight, 'searchParams');
  const canonicalPath = sp?.name && sp?.categoryId ? `${sp.name}${sp.isPLP ?? '-c-'}${sp.categoryId}` : null;
  return { results: r.results, page: r.page, canonicalPath };
}

function imageUrl(images) {
  const img = images?.[0];
  return img?.host && img?.path ? `${img.host.replace(/\/$/, '')}/${img.path.replace(/^\//, '')}` : null;
}

/** One search result (or detail productData) -> RevoSell product record. */
export function normalize(r, { category } = {}) {
  const prod = r.product ?? {};
  const price = r.prices?.discounted?.value ?? null;
  const original = r.prices?.original?.value ?? null;
  const discounted = price != null && original != null && original > price;
  const crumbs = r.sku?.breadCrumbs ?? [];
  const root = crumbs.find((c) => c.parentId != null) ?? crumbs[1] ?? null;
  return {
    store: 'sok',
    id: prod.id ? `sok-${prod.id}` : null,
    sourceId: prod.id ?? null,
    section: discounted ? 'indirim' : 'katalog',
    channel: r.serviceType === 'DROPSHIPPING' ? 'ekstra' : 'market',
    category: clean(root?.label) || category || null,
    brand: clean(prod.brand?.name) || null,
    name: clean(prod.name),
    quantity: null,
    price: typeof price === 'number' ? Math.round(price * 100) / 100 : null,
    oldPrice: discounted ? Math.round(original * 100) / 100 : null,
    discountPercent: discounted ? Math.round((1 - price / original) * 100) : null,
    currency: 'TRY',
    inStock: r.hasStock !== false,
    promotions: [...(r.promotions ?? []), ...(r.badgePromotions ?? [])]
      .map((p) => clean(p?.name ?? p?.title ?? p?.label ?? '')).filter(Boolean),
    image: imageUrl(prod.images),
    url: prod.path ? `${BASE}/${prod.path.replace(/^\//, '')}` : null,
    validFrom: null,
    validTo: null,
  };
}

/** Detail page -> same record shape (used by the verifier). */
export function parseDetail(html) {
  const flight = flightData(html);
  const data = jsonAfterKey(flight, 'productData');
  if (!data) return null;
  // Detail pages carry the live price on "initialVariant", not on productData.
  const variant = jsonAfterKey(flight, 'initialVariant');
  return normalize({ ...data, prices: variant?.prices ?? data.prices, hasStock: variant?.hasStock ?? data.hasStock });
}

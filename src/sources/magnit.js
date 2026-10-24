// Магнит (magnit.ru) — the online catalogue /catalog.
//
// Page layout (checked 24.10.2026):
//   - Nuxt 3 server-rendered pages; the goods are in __NUXT_DATA__ under
//     "goods-search:<hash>": { goods[33], pagination { total, pageSize, page },
//     category { id, title } }.
//   - /catalog?page=N (robots.txt only forbids ?page=1 and filter/sort
//     parameters). The order is stable between requests.
//   - Good: price "129.99", oldPrice "159.99" ("" = no discount), salePercent
//     "-18%", quantity (stock in the store), weighted { isWeighted,
//     shelfLabel "600г" } — weighed goods are priced for that shelf weight.
//   - Product page /product/<id>-<slug>: "goods-detail:…" with price and
//     promotion.oldPrice in kopecks.
//   - Prices are for the store the site picks for visitors without an
//     address: Магнит in Краснодар (shopCode 992301).

import { nuxtData, dataEntry } from '../nuxt.js';

export const BASE = 'https://magnit.ru';
export const pageUrl = (path, n) => `${BASE}${path}${n > 1 ? `?page=${n}` : ''}`;

const clean = (s) => (s ?? '').replace(/\s+/g, ' ').trim();
const num = (s) => {
  const n = Number(String(s ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
};

/** One catalogue page -> { total, pageSize, page, category, cards, products }. */
export function parseListing(html) {
  const g = dataEntry(nuxtData(html), 'goods-search');
  if (!g || !Array.isArray(g.goods) || !g.pagination) throw new Error('goods-search bulunamadı');
  const category = g.category?.title ?? null;
  const products = g.goods.map((x) => {
    const price = num(x.price), old = num(x.oldPrice);
    const discounted = old != null && price != null && old > price;
    const w = x.weighted?.isWeighted ? x.weighted : null;
    return {
      store: 'magnit',
      id: x.id ? `magnit-${x.id}` : null,
      sourceId: x.id ?? null,
      section: discounted ? 'indirim' : 'katalog',
      category,
      brand: null,
      name: clean(x.title),
      quantity: w?.shelfLabel ?? null,
      // Weighed goods: the price is for the shelf weight ("389.99 for 600г").
      unit: w?.shelfLabel ?? null,
      price,
      oldPrice: discounted ? old : null,
      discountPercent: discounted ? Number(String(x.salePercent ?? '').replace(/[^\d]/g, '')) || Math.round((1 - price / old) * 100) : null,
      priceCondition: null,
      currency: 'RUB',
      inStock: (x.quantity ?? 0) > 0,
      adult: !!x.adult,
      promotions: [],
      image: x.image || null,
      url: x.link ? new URL(x.link.split('?')[0], BASE).href : null,
      validFrom: null,
      validTo: null,
    };
  });
  return { total: g.pagination.total, pageSize: g.pagination.pageSize, page: g.pagination.page, category, cards: g.goods.length, products };
}

/** Product page -> { id, name, price, oldPrice, inStock } for the verifier. */
export function parseDetail(html) {
  const d = dataEntry(nuxtData(html), 'goods-detail');
  if (!d) throw new Error('goods-detail bulunamadı');
  const kop = (v) => (typeof v === 'number' && v > 0 ? Math.round(v) / 100 : null);
  const price = kop(d.price);
  const old = d.promotion?.isPromotion ? kop(d.promotion.oldPrice) : null;
  return {
    id: d.id ? `magnit-${d.id}` : null,
    name: clean(d.name),
    price,
    oldPrice: old != null && price != null && old > price ? old : null,
    inStock: !d.isMissing && (d.quantity ?? 0) > 0,
    weighted: !!d.weighted?.isWeighted,
  };
}

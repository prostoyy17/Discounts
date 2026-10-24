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

// Badges that are deals: "-25% от 2 шт" (multi-buy). cashback: bonus points
// ("25 бонусов") on the Магнит Плюс card. Other badges ("Финальная цена",
// "+5% с Премиум", "Только у нас", "+1 шанс на приз") are not price deals.
function catalogPromos(x) {
  const out = [];
  for (const b of x.badges ?? []) {
    const m = String(b.text ?? '').match(/^-\s*(\d+)\s*%\s*от\s*(\d+)\s*шт/);
    if (m) out.push(`−${m[1]}% при покупке от ${m[2]} шт`);
  }
  if (x.cashback > 0) out.push(`+${x.cashback} бонусов на карту Магнит Плюс`);
  return out;
}

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
      promotions: catalogPromos(x),
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

/**
 * One promo-catalog page (the store's leaflet) -> { total, pageSize, page,
 * cards, items }. Only "Скидка" items with a price are deals we can show;
 * "Акция" (prize games, charity, bonuses without a price), category discounts
 * and collections are left out and counted.
 */
export function parsePromoPage(html) {
  const g = dataEntry(nuxtData(html), 'promotions');
  if (!g || !Array.isArray(g.goods) || !g.pagination) throw new Error('promotions bulunamadı');
  const items = [];
  for (const x of g.goods) {
    const price = num(x.price), old = num(x.oldPrice);
    if (String(x.promoType) !== '1' || price == null) continue;
    const discounted = old != null && old > price;
    const productId = (String(x.image ?? '').match(/\/images\/(\d{7,})/) ?? [])[1] ?? null;
    items.push({
      store: 'magnit',
      id: `magnit-p${x.id}`,
      sourceId: String(x.id),
      productId, // catalogue product id taken from the leaflet image name, when there is one
      section: discounted ? 'indirim' : 'katalog',
      category: null,
      brand: null,
      name: clean(x.title),
      quantity: null,
      unit: null,
      price,
      oldPrice: discounted ? old : null,
      discountPercent: discounted ? Number(String(x.salePercent ?? '').replace(/[^\d]/g, '')) || Math.round((1 - price / old) * 100) : null,
      // In the store, at the till, with the Магнит Плюс card.
      priceCondition: /карт\S* Магнит Плюс/i.test(x.description ?? '') ? 'loyalty' : null,
      currency: 'RUB',
      inStock: true,
      adult: !!x.adult,
      promotions: discounted ? [] : ['Спеццена в магазине'],
      image: x.image || null,
      url: x.link ? new URL(x.link.split('?')[0], BASE).href : null,
      validFrom: x.startDate || null,
      validTo: x.endDate || null,
    });
  }
  return { total: g.pagination.total, pageSize: g.pagination.pageSize, page: g.pagination.page, cards: g.goods.length, items };
}

/** Promo page /promo-product/<id>-<slug> -> { id, name, price, oldPrice, category, validTo } (prices in kopecks there). */
export function parsePromoDetail(html) {
  const x = Object.entries(nuxtData(html)?.data ?? {}).find(([k]) => k.startsWith('promotions-item'))?.[1]?.promo;
  if (!x) throw new Error('promotions-item bulunamadı');
  const kop = (v) => (typeof v === 'number' && v > 0 ? Math.round(v) / 100 : null);
  const price = kop(x.price), old = kop(x.oldPrice);
  return { id: `magnit-p${x.id}`, name: clean(x.name), price, oldPrice: old != null && price != null && old > price ? old : null, category: x.categoryName || null, validTo: x.endDate || null };
}

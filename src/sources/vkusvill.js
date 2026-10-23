// ВкусВилл (vkusvill.ru) — раздел «Акции» /offers/.
//
// Page layout (checked 23.10.2026):
//   - /offers/?PAGEN_1=N — 24 cards per page; the last page number is the
//     largest PAGEN_1 link. robots.txt allows /offers/ (Crawl-delay: 2).
//   - Card: div.ProductCard[data-id] with hidden datalayer spans
//     .js-datalayer-catalog-list-price (price now) and …-price-old (before),
//     title .js-product-v-tizer__title-text, weight .ProductCard__linkWeight,
//     image .ProductCard__imageImg, link a.js-product-detail-link,
//     condition text .ProductCard__notice ("Скидка по карте лояльности по 25.10",
//     "При покупке от 2 шт по 26.10", "По карте лояльности … только онлайн",
//     "Исчезающий вид").
//   - Detail page /goods/<slug>-<id>/ carries the same datalayer spans and notice.
//   - Prices are for the site's default region (Moscow) without an address.

import * as cheerio from 'cheerio';

export const BASE = 'https://vkusvill.ru';
export const pageUrl = (n, section = '') => `${BASE}/offers/${section ? section + '/' : ''}${n > 1 ? `?PAGEN_1=${n}` : ''}`;

/** Section slugs of /offers/ (dairy, bakery, …) from the filter links. */
export function parseSections(html) {
  const out = new Set();
  for (const m of html.matchAll(/href="\/offers\/([a-z0-9-]+)\/"/g)) out.add(m[1]);
  return [...out];
}

const clean = (s) => (s ?? '').replace(/ |&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const num = (s) => {
  const n = Number(clean(s).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
};

/** "по 25.10" -> ISO date, picking the year closest to `today`. */
export function untilDate(text, today = new Date()) {
  const m = clean(text).match(/по\s+(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?/i);
  if (!m) return null;
  const d = +m[1], mo = +m[2];
  let y = m[3] ? +(m[3].length === 2 ? '20' + m[3] : m[3]) : null;
  if (!y) {
    const t = today.getTime(), base = today.getUTCFullYear();
    y = [base - 1, base, base + 1].sort((a, b) => Math.abs(Date.UTC(a, mo - 1, d) - t) - Math.abs(Date.UTC(b, mo - 1, d) - t))[0];
  }
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Condition text -> { priceCondition, promotions[], onlineOnly }. */
export function parseNotice(text) {
  const t = clean(text);
  const out = { priceCondition: null, promotions: [], onlineOnly: /только онлайн/i.test(t) };
  if (!t) return out;
  if (/карте лояльности/i.test(t)) out.priceCondition = 'loyalty';
  const multi = t.match(/при покупке от\s*([\d.,]+\s*(?:шт|кг|г|л))/i);
  if (multi) out.promotions.push(`Цена при покупке от ${multi[1].replace(/\s+/g, ' ')}`);
  if (/исчезающий вид/i.test(t)) out.promotions.push('Исчезающий вид');
  return out;
}

const pick = ($el) => ({
  id: $el.attr('data-id'),
  price: num($el.find('.js-datalayer-catalog-list-price').first().text()),
  old: num($el.find('.js-datalayer-catalog-list-price-old').first().text()),
});

/** One /offers/ page -> { cards, products, lastPage }. */
export function parseListing(html, today = new Date()) {
  const $ = cheerio.load(html);
  let lastPage = 1;
  $('a[href*="PAGEN_1="]').each((_, a) => {
    const n = Number(($(a).attr('href').match(/PAGEN_1=(\d+)/) ?? [])[1]);
    if (n > lastPage) lastPage = n;
  });
  const products = [];
  const cards = $('div.ProductCard.js-product-cart[data-id]');
  cards.each((_, el) => {
    const c = $(el);
    const { id, price, old } = pick(c);
    const link = c.find('a.js-product-detail-link').first().attr('href');
    const notice = c.find('.ProductCard__notice').first().text();
    // "741 руб/шт" or "2363 руб/кг" — weighed goods are priced per kg.
    const unitMatch = clean(c.find('.ProductCard__price .Price--label').first().text()).match(/\/\s*(шт|кг|л|г|уп)/);
    const n = parseNotice(notice);
    const discounted = old != null && price != null && old > price;
    products.push({
      store: 'vkusvill',
      id: id ? `vkusvill-${id}` : null,
      sourceId: id ?? null,
      section: discounted ? 'indirim' : 'katalog',
      category: clean(c.find('.js-datalayer-catalog-list-category').first().text()).split('//')[0] || null,
      brand: null,
      name: clean(c.find('.js-product-v-tizer__title-text').first().text()),
      quantity: clean(c.find('.ProductCard__linkWeight').first().text()) || null,
      unit: unitMatch ? unitMatch[1] : null,
      price,
      oldPrice: discounted ? old : null,
      discountPercent: discounted ? Math.round((1 - price / old) * 100) : null,
      priceCondition: discounted ? n.priceCondition : null,
      onlineOnly: n.onlineOnly,
      currency: 'RUB',
      inStock: true,
      promotions: n.promotions,
      notice: clean(notice) || null,
      // Lazy cards have a placeholder in src and the real image in data-src.
      image: (() => { const img = c.find('img.ProductCard__imageImg').first(); return img.attr('data-src') || img.attr('src') || null; })(),
      url: link ? new URL(link, BASE).href : null,
      validFrom: null,
      validTo: untilDate(notice, today),
    });
  });
  return { cards: cards.length, products, lastPage };
}

/** Detail page -> { id, name, price, oldPrice, notice } for the verifier. */
export function parseDetail(html) {
  const $ = cheerio.load(html);
  const box = $('.js-datalayer-product-detail').first();
  const { id, price, old } = pick(box);
  return {
    id: id ? `vkusvill-${id}` : null,
    name: clean($('h1').first().text()),
    price,
    oldPrice: old != null && price != null && old > price ? old : null,
    notice: clean(box.find('.ProductCard__notice').first().text()) || null,
  };
}

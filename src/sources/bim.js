// BİM "Aktüel Ürünler" + "İndirim" parser (www.bim.com.tr).
//
// Page layout (checked 16.10.2026):
//   - Every aktüel page carries a menu table: column "AKTÜEL ÜRÜNLER" lists sale
//     days ("06 Ekim Salı"), column "İNDİRİM" lists discount periods ("10-16 Ekim").
//     Each link is .../aktuel-urunler.aspx?top=1&Bim_AktuelTarihKey=<key>.
//   - A listing page holds div.product cards; div.product.justImage is a banner
//     without price and is skipped. Lazy-loaded cards use <img xsrc> instead of src.
//   - Price: ".gButton .quantify" = "7.950," + ".kusurArea .number" = "00".
//     Discount cards add ".CountButton.strikethrough .quantify" (old price) and
//     ".DiscountButton" ("% 21").

import * as cheerio from 'cheerio';

export const BASE = 'https://www.bim.com.tr';
export const START_URL = `${BASE}/Categories/100/aktuel-urunler.aspx`;
export const pageUrl = (key) => `${START_URL}?top=1&Bim_AktuelTarihKey=${key}`;

const MONTHS = {
  ocak: 1, şubat: 2, mart: 3, nisan: 4, mayıs: 5, haziran: 6,
  temmuz: 7, ağustos: 8, eylül: 9, ekim: 10, kasım: 11, aralık: 12,
};

const clean = (s) => (s ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

/** "7.950," + "00" -> 7950 ; "379,00" -> 379 ; returns null when not a price. */
export function parseTrPrice(text) {
  const s = clean(text).replace(/[₺\s]/g, '');
  if (!/^\d{1,3}(\.\d{3})*(,\d{0,2})?$|^\d+(,\d{0,2})?$/.test(s)) return null;
  const n = Number(s.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function isoDate(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Pick the year that puts month/day closest to `today` (handles Dec↔Jan). */
function nearestYear(month, day, today) {
  return rangeYear(month, day, month, day, today);
}

/**
 * Year for a start..end range: the one whose range contains `today`, else the
 * one closest to it. If end month < start month the range crosses New Year.
 */
function rangeYear(m1, d1, m2, d2, today) {
  const y = today.getUTCFullYear();
  const t = today.getTime();
  let best = y, bestDiff = Infinity;
  for (const cand of [y - 1, y, y + 1]) {
    const from = Date.UTC(cand, m1 - 1, d1);
    const to = Date.UTC(m2 < m1 ? cand + 1 : cand, m2 - 1, d2, 23, 59);
    const diff = t < from ? from - t : t > to ? t - to : 0;
    if (diff < bestDiff) { best = cand; bestDiff = diff; }
  }
  return best;
}

/**
 * Menu labels -> date range.
 *   "06 Ekim Salı"      -> { start: 2026-10-06, end: null }   (aktüel: on sale from that day)
 *   "10-16 Ekim"        -> { start: 2026-10-10, end: 2026-10-16 }
 *   "24 Mart-31 Aralık" -> { start: 2026-03-24, end: 2026-12-31 }
 */
export function parseDateLabel(label, today = new Date()) {
  const s = clean(label).toLocaleLowerCase('tr');
  const month = (name) => MONTHS[name];
  let m = s.match(/^(\d{1,2})\s*-\s*(\d{1,2})\s+([a-zçğıöşü]+)/);
  if (m && month(m[3])) {
    const mo = month(m[3]);
    const y = rangeYear(mo, +m[1], mo, +m[2], today);
    return { start: isoDate(y, mo, +m[1]), end: isoDate(y, mo, +m[2]) };
  }
  m = s.match(/^(\d{1,2})\s+([a-zçğıöşü]+)\s*-\s*(\d{1,2})\s+([a-zçğıöşü]+)/);
  if (m && month(m[2]) && month(m[4])) {
    const m1 = month(m[2]), m2 = month(m[4]);
    const y1 = rangeYear(m1, +m[1], m2, +m[3], today);
    const y2 = m2 < m1 ? y1 + 1 : y1;
    return { start: isoDate(y1, m1, +m[1]), end: isoDate(y2, m2, +m[3]) };
  }
  m = s.match(/^(\d{1,2})\s+([a-zçğıöşü]+)/);
  if (m && month(m[2])) {
    const mo = month(m[2]);
    return { start: isoDate(nearestYear(mo, +m[1], today), mo, +m[1]), end: null };
  }
  return { start: null, end: null };
}

/** Reads the sub-menu table: [{ key, label, section: 'aktuel'|'indirim', url }]. */
export function parseMenu(html) {
  const $ = cheerio.load(html);
  const table = $('.subMenu.aktuelsubmenu table').first();
  const headers = table.find('th').map((_, th) => clean($(th).text()).toLocaleLowerCase('tr')).get();
  const seen = new Map();
  table.find('tr').each((_, tr) => {
    $(tr).find('td').each((col, td) => {
      const a = $(td).find('a');
      const key = (a.attr('href') ?? '').match(/Bim_AktuelTarihKey=(\d+)/)?.[1];
      if (!key || seen.has(key)) return;
      const section = (headers[col] ?? '').includes('indirim') ? 'indirim' : 'aktuel';
      seen.set(key, { key, label: clean(a.text()), section, url: pageUrl(key) });
    });
  });
  return [...seen.values()];
}

/**
 * BİM writes a price either whole ("36,50") or split into ".quantify" "36,"
 * + ".kusurArea .number" "50" — the listing and the detail page use different
 * forms for the same old price, so always read both parts.
 */
function readPrice($, box) {
  if (!box || box.length === 0) return null;
  const text = clean(box.find('.quantify').first().text()) + clean(box.find('.kusurArea .number').first().text());
  return text ? parseTrPrice(text) : null;
}

/**
 * Parses one listing page. Returns { products, cardCount, bannerCount }.
 * cardCount = number of non-banner cards found, so the caller can assert
 * that every card became a product (nothing silently dropped).
 */
export function parseListing(html, page, today = new Date()) {
  const $ = cheerio.load(html);
  const { start, end } = parseDateLabel(page.label, today);
  const products = [];
  const errors = [];
  let cardCount = 0, bannerCount = 0;

  $('.productArea div.product').each((_, el) => {
    const card = $(el);
    if (card.hasClass('justImage')) { bannerCount++; return; }
    cardCount++;

    const href = card.find('.imageArea a').attr('href') ?? card.find('a.gButton').attr('href');
    const img = card.find('.imageArea img');
    const imgSrc = img.attr('src') || img.attr('xsrc') || img.attr('data-src');
    const btn = card.find('a.gButton').first();
    const priceText = clean(btn.find('.quantify').first().text()) + clean(btn.find('.kusurArea .number').first().text());
    const oldBox = card.find('.CountButton.strikethrough').first();
    const discText = clean(card.find('.DiscountButton').first().text());
    const id = card.find('.shareArea a[data-id]').attr('data-id');

    const p = {
      store: 'bim',
      id: id ? `bim-${id}` : null,
      sourceId: id ?? null,
      section: page.section,
      periodKey: page.key,
      periodLabel: page.label,
      validFrom: start,
      validTo: end,
      brand: clean(card.find('.subTitle').first().text()) || null,
      name: clean(card.find('h2.title').first().text()),
      quantity: clean(card.find('.gramajadet').first().text()).replace(/^•\s*/, '') || null,
      price: parseTrPrice(priceText),
      oldPrice: readPrice($, oldBox),
      discountPercent: discText ? Number(discText.replace(/[^\d]/g, '')) || null : null,
      currency: 'TRY',
      image: imgSrc ? new URL(imgSrc, BASE).href : null,
      url: href && !href.startsWith('#') ? new URL(href, BASE).href : null,
      sourcePage: page.url,
    };
    if (!p.name || p.price == null) errors.push({ card: cardCount, name: p.name, priceText });
    products.push(p);
  });

  return { products, cardCount, bannerCount, errors };
}

/** Detail page (used by the verifier): name, price, old price, big image. */
export function parseDetail(html) {
  const $ = cheerio.load(html);
  const area = $('.detailArea').first();
  return {
    name: clean(area.find('.titleArea h2.title').first().text()),
    price: readPrice($, area.find('.priceArea a.gButton').first()),
    oldPrice: readPrice($, area.find('.priceArea .CountButton.strikethrough').first()),
    image: area.find('.leftSide img').first().attr('src') ?? null,
    id: area.find('.titleArea .shareArea a[data-id]').attr('data-id') ?? null,
  };
}

/**
 * BİM sometimes gives several products the same detail URL (e.g. "Sek Ayran"
 * 10 ₺ and "Yörsan Ayran" 79.5 ₺ both -> /ayran-12-10/), and that page always
 * shows only one of them; no id-based URL exists. For those products, link to
 * the period page where the right card is listed and keep the shared link as
 * detailUrl. Mutates and returns the number of products relinked.
 */
export function relinkSharedDetailUrls(products) {
  const users = new Map();
  for (const p of products) users.set(p.url, (users.get(p.url) ?? 0) + 1);
  let n = 0;
  for (const p of products) {
    if (users.get(p.url) > 1) {
      p.detailUrl = p.url;
      p.url = p.sourcePage;
      p.sharedDetailUrl = true;
      n++;
    }
  }
  return n;
}

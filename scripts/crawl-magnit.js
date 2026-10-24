// Crawls Магнит for one store format and writes site/data/<format>.json with
// only the deals that are the same in every checked store of that format.
//
//   node scripts/crawl-magnit.js --format magnit|magnitgm [--save-dir DIR] [--from-dir DIR]
//
// Why several stores: magnit.ru shows the catalogue and the leaflet of one
// store (chosen with the shopCode cookie, as when a visitor picks a store).
// Checked on 24.10.2026 across 20 stores in 9 cities: discounts depend on the
// store format, not on the city or district — Москва vs Санкт-Петербург agree
// as closely as two shops on one street (~95 % of deals identical) — and the
// rest are store-level exceptions. So a deal is published only when every
// checked store that sells the product has it at the same price; such a deal
// holds in any store of the format. The old price differs more between
// regions, so the lowest one is shown (the saving is never overstated).

import fs from 'node:fs/promises';
import path from 'node:path';
import { fetchText } from '../src/http.js';
import { pageUrl, parseListing, parsePromoPage, BASE } from '../src/sources/magnit.js';
import { productProblems, productWarnings } from '../src/validate.js';

export const FORMATS = {
  // «Магнит у дома»: the leaflet is the same all over Russia.
  magnit: {
    name: 'Магнит у дома', minProducts: 1500,
    stores: [['773797', 'Москва'], ['552928', 'Санкт-Петербург'], ['462535', 'Казань'], ['862371', 'Новосибирск'], ['611885', 'Ростов-на-Дону']],
  },
  // «Магнит Семейный» / «Магнит Экстра» (hypermarkets).
  magnitgm: {
    name: 'Магнит Семейный / Экстра', minProducts: 3000,
    stores: [['995402', 'Новосибирск'], ['995101', 'Мурманск'], ['992606', 'Ставрополь'], ['992344', 'Краснодар']],
  },
};

// Top-level catalogue sections (the site menu). Together they hold 99.8 % of
// the goods of the plain /catalog list, which itself stops after 10 000 goods.
export const CATEGORIES = [
  '47161-alkogol_core_mm_gm', '4998-ryba_moreprodukty', '63791-testmmvoda_i_napitki', '63829-testmmsneki',
  '63873-testmmchay_kofe_kakao', '63905-testmmovoshchi_i_frukty', '63963-testmmmolochnyy_prilavok', '64121-testmmbakaleya',
  '64199-testmmkonservy', '64243-testmmptitsa_myaso_ryba', '64419-testmmdlya_detey_1_uroven', '64467-testmmzamorozka',
  '64603-testmmdom', '64697-testmmsladosti', '64799-testmmdlya_zhivotnykh', '64893-testmmgigiena_i_ukhod1',
  '65001-testmmkhleb_i_vypechka', '65055-testmmgotovaya_eda', '100183-test_mm_igrushki', '100189-test_mm_odezhda_i_aksessuary',
  '107359-tekhnika_dlya_krasoty', '117798-sezonnye_avtotovary', '118228-sportivnoe_pitanie_2',
].map((c) => `/catalog/${c}`);

const arg = (name) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null);
const formatId = arg('--format') || 'magnit';
const FORMAT = FORMATS[formatId];
if (!FORMAT) { console.error(`bilinmeyen format: ${formatId}`); process.exit(2); }
const OUT = path.resolve(`site/data/${formatId}.json`);
const saveDir = arg('--save-dir'), fromDir = arg('--from-dir');
const fileFor = (dir, code, key, n) => path.join(dir, code, `${key.replace(/[^\w-]+/g, '_')}_${n}.html`);

// One lane per store: the stores are crawled side by side, each with its own
// 3 s pause (≈1.7 requests/s to magnit.ru in total for five stores).
async function get(code, url, key, n) {
  if (fromDir) { try { return await fs.readFile(fileFor(fromDir, code, key, n), 'utf8'); } catch { return null; } }
  let html;
  try {
    html = await fetchText(url, { delayMs: 3000, retries: 5, timeoutMs: 60000, lane: code, headers: { Cookie: `shopCode=${code}` } });
  } catch (e) {
    if (/HTTP 404/.test(e.message)) return null; // section not sold in this store format
    throw e;
  }
  if (saveDir) { await fs.mkdir(path.dirname(fileFor(saveDir, code, key, n)), { recursive: true }); await fs.writeFile(fileFor(saveDir, code, key, n), html); }
  return html;
}

async function crawlStore(code, city) {
  const fatal = [], products = new Map(), leaflet = new Map();
  let rows = 0, sections = 0;
  for (const cat of CATEGORIES) {
    let last = 1;
    for (let n = 1; n <= last; n++) {
      const html = await get(code, pageUrl(cat, n), cat, n);
      if (html == null) { if (n > 1) fatal.push(`${cat} s.${n}: sayfa yok`); break; }
      let r;
      try { r = parseListing(html); } catch (e) { fatal.push(`${cat} s.${n}: ${e.message}`); break; }
      if (n === 1) { last = Math.ceil(r.total / r.pageSize); sections++; }
      if (r.cards !== r.products.length) fatal.push(`${cat} s.${n}: kart ${r.cards}, ürün ${r.products.length}`);
      // The site drops out-of-stock goods from a page after paging, so a page
      // can be a little short; an empty or tiny page means something broke.
      if (n < last && r.cards < r.pageSize * 0.5) fatal.push(`${cat} s.${n}: ${r.cards} kart (beklenen ${r.pageSize})`);
      rows += r.products.length;
      // A good can sit in two sections; the first one names its category.
      for (const p of r.products) if (!products.has(p.id)) products.set(p.id, p);
    }
  }
  // The leaflet: /promo-catalog?shopCode=… (its links carry the store code back).
  let last = 1;
  for (let n = 1; n <= last; n++) {
    const url = `${BASE}/promo-catalog?shopCode=${code}${n > 1 ? `&page=${n}` : ''}`;
    const html = await get(code, url, 'promo', n);
    if (html == null) { fatal.push(`yaprak s.${n}: sayfa yok`); break; }
    let r;
    try { r = parsePromoPage(html); } catch (e) { fatal.push(`yaprak s.${n}: ${e.message}`); break; }
    if (n === 1) last = Math.ceil(r.total / r.pageSize);
    if (!html.includes(`shopCode=${code}`)) fatal.push(`yaprak s.${n}: mağaza kodu ${code} sayfada yok`);
    for (const it of r.items) leaflet.set(it.id, it);
  }
  if (products.size < FORMAT.minProducts) fatal.push(`çok az ürün: ${products.size}`);
  console.log(`${code} ${city.padEnd(16)} ${sections} bölüm, ${rows} satır, ${products.size} ürün, yaprakta ${leaflet.size} fiyatlı fırsat${fatal.length ? `, ${fatal.length} HATA` : ''}`);
  return { code, city, products, leaflet, fatal };
}

const sameDeal = (a, b) => a.price === b.price && !!a.oldPrice === !!b.oldPrice && a.promotions.join('|') === b.promotions.join('|');

const results = await Promise.all(FORMAT.stores.map(([code, city]) => crawlStore(code, city).catch((e) => ({ code, city, fatal: [e.message], products: new Map(), leaflet: new Map() }))));
const ok = results.filter((r) => !r.fatal.length);
const fatal = results.flatMap((r) => r.fatal.map((f) => `${r.code} ${r.city}: ${f}`));
if (ok.length < Math.min(3, FORMAT.stores.length)) fatal.push(`yalnız ${ok.length} mağaza tamam — karşılaştırma için en az 3 gerekli`);

// Consensus over the stores that were crawled completely.
const stats = { stores: ok.length, candidates: 0, agreed: 0, differs: 0, single: 0, leafletCandidates: 0, leafletAgreed: 0 };
const byId = new Map();
const ids = new Set(ok.flatMap((r) => [...r.products.keys()]));
for (const id of ids) {
  const seenIn = ok.filter((r) => r.products.get(id)?.inStock);
  const seen = seenIn.map((r) => r.products.get(id));
  const deal = seen.filter((p) => p.oldPrice || p.promotions.length);
  if (!deal.length) continue;
  stats.candidates++;
  if (seen.length < 2) { stats.single++; continue; } // sold in one checked store only: cannot confirm
  if (!seen.every((p) => sameDeal(p, seen[0]))) { stats.differs++; continue; }
  const p = { ...seen[0], store: formatId };
  if (p.oldPrice) {
    p.oldPrice = Math.min(...seen.map((x) => x.oldPrice));
    p.discountPercent = Math.round((1 - p.price / p.oldPrice) * 100);
  }
  p.checkedIn = seenIn.map((r) => r.code); // the stores that confirmed it (the verifier checks one of them)
  byId.set(id, p);
  stats.agreed++;
}
// Leaflet deals: the same item at the same price in every store's leaflet.
const leafIds = new Set(ok.flatMap((r) => [...r.leaflet.keys()]));
const catalogById = new Map(ok.flatMap((r) => [...r.products]).reverse());
for (const id of leafIds) {
  stats.leafletCandidates++;
  const seen = ok.map((r) => r.leaflet.get(id));
  if (seen.some((x) => !x) || !seen.every((x) => x.price === seen[0].price && x.oldPrice === seen[0].oldPrice)) continue;
  const it = { ...seen[0], store: formatId };
  const prod = it.productId ? catalogById.get(`magnit-${it.productId}`) : null;
  if (prod) {
    it.category = prod.category;
    it.image = prod.image; // leaflet images are signed links that expire after a day
    byId.delete(prod.id); // the in-store leaflet price wins over the online one
  }
  delete it.productId;
  it.checkedIn = ok.map((r) => r.code);
  byId.set(it.id, it);
  stats.leafletAgreed++;
}

const products = [], rejected = [], warnings = [];
for (const p of byId.values()) {
  const probs = productProblems(p);
  if (probs.length) { rejected.push({ id: p.id, name: p.name, problems: probs }); continue; }
  const warn = productWarnings(p);
  if (warn.length) warnings.push({ id: p.id, name: p.name, warnings: warn });
  products.push(p);
}
if (byId.size && rejected.length / byId.size > 0.02) fatal.push(`hatalı ürün oranı yüksek: ${rejected.length}/${byId.size}`);
if (products.length < 100) fatal.push(`çok az fırsat: ${products.length}`);

for (const r of rejected) console.warn(`  ✗ ${r.name} | ${r.problems.join(', ')}`);
console.log(`\nAday ${stats.candidates}: hepsinde aynı ${stats.agreed}, mağazaya göre farklı ${stats.differs}, tek mağazada ${stats.single}; yaprak ${stats.leafletAgreed}/${stats.leafletCandidates}`);
if (fatal.length) { console.error('\nTARAMA REDDEDİLDİ:\n - ' + fatal.join('\n - ')); process.exit(1); }

const data = {
  store: formatId, storeName: FORMAT.name, source: `${BASE}/catalog`, fetchedAt: new Date().toISOString(),
  checkedStores: ok.map((r) => ({ code: r.code, city: r.city, products: r.products.size })),
  stats: { ...stats, products: products.length, rejected: rejected.length, warnings: warnings.length },
  warnings, rejected, products,
};
await fs.mkdir(path.dirname(OUT), { recursive: true });
await fs.writeFile(OUT, JSON.stringify(data));
console.log(`✓ ${products.length} fırsat → ${path.relative(process.cwd(), OUT)}`);

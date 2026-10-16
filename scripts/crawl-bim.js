// Crawls BİM aktüel + indirim pages, validates everything and writes
// site/data/bim.json. Exits non-zero (and writes nothing) if the result
// looks wrong, so a site change never replaces good data with garbage.
//
//   node scripts/crawl-bim.js [--from-dir DIR]   (DIR: saved p<key>.html + index.html, offline)

import fs from 'node:fs/promises';
import path from 'node:path';
import { fetchText } from '../src/http.js';
import { START_URL, parseMenu, parseListing } from '../src/sources/bim.js';
import { productProblems, pageProblems } from '../src/validate.js';

const OUT = path.resolve('site/data/bim.json');
const MIN_PRODUCTS = 50;
const MAX_BAD_RATIO = 0.02;

const fromDir = process.argv.includes('--from-dir') ? process.argv[process.argv.indexOf('--from-dir') + 1] : null;
const load = (url, key) => fromDir
  ? fs.readFile(path.join(fromDir, key ? `p${key}.html` : 'index.html'), 'utf8')
  : fetchText(url);

const today = new Date();
const fatal = [];

const menu = parseMenu(await load(START_URL));
if (menu.length === 0) fatal.push('menü boş: sayfa yapısı değişmiş olabilir');

const all = [];
const rejected = [];
const periods = [];
for (const page of menu) {
  let html;
  try { html = await load(page.url, page.key); }
  catch (e) { fatal.push(`${page.label}: ${e.message}`); continue; }
  const res = parseListing(html, page, today);
  const pp = pageProblems(res);
  if (pp.length) fatal.push(`${page.label}: ${pp.join('; ')}`);
  let ok = 0;
  for (const p of res.products) {
    const probs = productProblems(p);
    if (probs.length) rejected.push({ id: p.id, name: p.name, page: page.label, problems: probs });
    else { all.push(p); ok++; }
  }
  periods.push({ ...page, ...{ validFrom: res.products[0]?.validFrom ?? null, validTo: res.products[0]?.validTo ?? null }, count: ok, banners: res.bannerCount });
  console.log(`${page.section.padEnd(8)} ${page.label.padEnd(20)} kart=${res.cardCount} ok=${ok}`);
}

// The same product id can be listed under two days; keep one row per id+period.
const seen = new Set();
const products = all.filter((p) => { const k = `${p.id}|${p.periodKey}`; if (seen.has(k)) return false; seen.add(k); return true; });

const total = products.length + rejected.length;
if (products.length < MIN_PRODUCTS) fatal.push(`çok az ürün: ${products.length}`);
if (total && rejected.length / total > MAX_BAD_RATIO) fatal.push(`hatalı ürün oranı yüksek: ${rejected.length}/${total}`);

for (const r of rejected) console.warn(`  ✗ ${r.page} | ${r.name} | ${r.problems.join(', ')}`);
if (fatal.length) {
  console.error('\nTARAMA REDDEDİLDİ:\n - ' + fatal.join('\n - '));
  process.exit(1);
}

const data = {
  store: 'bim',
  storeName: 'BİM',
  source: START_URL,
  fetchedAt: new Date().toISOString(),
  stats: {
    products: products.length,
    rejected: rejected.length,
    indirim: products.filter((p) => p.section === 'indirim').length,
    aktuel: products.filter((p) => p.section === 'aktuel').length,
  },
  periods,
  products,
};
await fs.mkdir(path.dirname(OUT), { recursive: true });
await fs.writeFile(OUT, JSON.stringify(data, null, 1));
console.log(`\n✓ ${products.length} ürün yazıldı (${rejected.length} reddedildi) → ${path.relative(process.cwd(), OUT)}`);

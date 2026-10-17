// Crawls every Migros department page by page, validates the records and
// writes site/data/migros.json. Exits non-zero (writing nothing) when the
// result looks wrong, so good data is never replaced by garbage.
//
//   node scripts/crawl-migros.js [--save-dir DIR]   keep raw JSON for debugging
//   node scripts/crawl-migros.js --from-dir DIR     re-run offline from saved JSON

import fs from 'node:fs/promises';
import path from 'node:path';
import { fetchText } from '../src/http.js';
import { BASE, ROOT_CATEGORIES, SORT_ASC, SORT_DESC, listUrl, parseListing, normalize } from '../src/sources/migros.js';
import { productProblems, productWarnings } from '../src/validate.js';

const OUT = path.resolve('site/data/migros.json');
const MIN_PRODUCTS = 5000;
const MAX_BAD_RATIO = 0.02;
const MAX_MISSING_RATIO = 0.02;

const arg = (name) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null);
const saveDir = arg('--save-dir');
const fromDir = arg('--from-dir');
const fileFor = (dir, url) => path.join(dir, url.replace(BASE, '').replace(/[^a-z0-9]+/gi, '_') + '.json');
const get = async (url) => {
  const text = fromDir ? await fs.readFile(fileFor(fromDir, url), 'utf8') : await fetchText(url);
  if (saveDir && !fromDir) {
    await fs.mkdir(saveDir, { recursive: true });
    await fs.writeFile(fileFor(saveDir, url), text);
  }
  return JSON.parse(text);
};

const fatal = [];
const byId = new Map();
const rejected = [];
const warnings = [];
const catStats = [];
let seenRows = 0;
for (const cat of ROOT_CATEGORIES) {
  let total = null, rows = 0, visible = null;
  const uniq = new Set();
  // Pass 1 in ascending price order; if items still slipped between pages,
  // pass 2 in descending order fills the gaps.
  for (const sort of [SORT_ASC, SORT_DESC]) {
    if (sort === SORT_DESC && visible != null && uniq.size >= visible) break;
    let pages = 1, served = 0;
    for (let n = 1; n <= pages; n++) {
      let res;
      try { res = parseListing(await get(listUrl(cat, n, sort))); }
      catch (e) { fatal.push(`${cat} ${sort} s.${n}: ${e.message}`); break; }
      if (!res) { fatal.push(`${cat} s.${n}: ürün listesi bulunamadı (API yapısı değişmiş olabilir)`); break; }
      if (n === 1) { total ??= res.hitCount; pages = res.pageCount; }
      served += res.items.length;
      rows += res.items.length;
      for (const item of res.items) {
        seenRows++;
        const p = normalize(item);
        if (!p.id || uniq.has(p.id)) continue;
        uniq.add(p.id);
        const probs = productProblems(p);
        if (probs.length) { rejected.push({ id: p.id, name: p.name, category: cat, problems: probs }); continue; }
        const warn = productWarnings(p);
        if (warn.length) warnings.push({ id: p.id, name: p.name, warnings: warn });
        if (!byId.has(p.id)) byId.set(p.id, p);
      }
    }
    // hitCount also counts items Migros then filters out of the response
    // (pages come back with 28–29 of 30). What the site really shows is the
    // number of rows served; that is what we must have collected.
    if (sort === SORT_ASC) visible = served;
  }
  const got = uniq.size;
  const hidden = total != null && visible != null ? total - visible : 0;
  const missing = visible == null ? 0 : visible - got;
  if (visible && missing / visible > MAX_MISSING_RATIO) fatal.push(`${cat}: sitede görünen ${visible}, toplanan ${got}`);
  catStats.push({ path: cat, total, visible, hiddenByStore: hidden, got });
  console.log(`${cat.padEnd(36)} hitCount=${String(total).padStart(5)} görünen=${String(visible).padStart(5)} toplanan=${String(got).padStart(5)}${hidden ? ` (Migros gizledi ${hidden})` : ''}`);
}

const products = [...byId.values()];
if (products.length < MIN_PRODUCTS) fatal.push(`çok az ürün: ${products.length}`);
if (seenRows && rejected.length / seenRows > MAX_BAD_RATIO) fatal.push(`hatalı ürün oranı yüksek: ${rejected.length}/${seenRows}`);

for (const w of warnings.slice(0, 50)) console.warn(`  ! ${w.name} | ${w.warnings.join(', ')}`);
for (const r of rejected) console.warn(`  ✗ ${r.category} | ${r.name} | ${r.problems.join(', ')}`);
if (fatal.length) {
  console.error('\nTARAMA REDDEDİLDİ:\n - ' + fatal.join('\n - '));
  process.exit(1);
}

const data = {
  store: 'migros',
  storeName: 'Migros',
  source: BASE,
  fetchedAt: new Date().toISOString(),
  stats: {
    products: products.length,
    rejected: rejected.length,
    warnings: warnings.length,
    indirim: products.filter((p) => p.section === 'indirim').length,
    promotions: products.filter((p) => p.promotions.length).length,
    outOfStock: products.filter((p) => !p.inStock).length,
  },
  categories: catStats,
  warnings,
  rejected,
  products,
};
await fs.mkdir(path.dirname(OUT), { recursive: true });
await fs.writeFile(OUT, JSON.stringify(data));
console.log(`\n✓ ${products.length} ürün (${data.stats.indirim} Money indirimli, ${data.stats.promotions} kampanyalı) yazıldı; ${rejected.length} reddedildi → ${path.relative(process.cwd(), OUT)}`);

// Crawls every ŞOK Market + Ekstra category page by page, validates the
// records and writes site/data/sok.json. Exits non-zero (writing nothing)
// when the result looks wrong, so good data is never replaced by garbage.
//
//   node scripts/crawl-sok.js [--save-dir DIR]   keep raw HTML for debugging
//   node scripts/crawl-sok.js --from-dir DIR     re-run offline from saved HTML

import fs from 'node:fs/promises';
import path from 'node:path';
import { fetchText } from '../src/http.js';
import { BASE, ENTRY_URLS, SORT_ASC, SORT_DESC, pageUrl, parseCategories, parseListing, normalize } from '../src/sources/sok.js';
import { productProblems, productWarnings } from '../src/validate.js';

const OUT = path.resolve('site/data/sok.json');
const MIN_PRODUCTS = 1000;
const MAX_BAD_RATIO = 0.02;
const MAX_MISSING_RATIO = 0.02; // listing can shift slightly while we page through it

const arg = (name) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null);
const saveDir = arg('--save-dir');
const fromDir = arg('--from-dir');
const fileFor = (dir, url) => path.join(dir, url.replace(BASE, '').replace(/[^a-z0-9]+/gi, '_') + '.html');
const get = async (url) => {
  if (fromDir) return fs.readFile(fileFor(fromDir, url), 'utf8');
  const html = await fetchText(url);
  if (saveDir) {
    await fs.mkdir(saveDir, { recursive: true });
    await fs.writeFile(fileFor(saveDir, url), html);
  }
  return html;
};

const fatal = [];
const categories = [];
for (const u of ENTRY_URLS) {
  for (const c of parseCategories(await get(u))) if (!categories.some((x) => x.kind === c.kind && x.id === c.id)) categories.push(c);
}
if (categories.length < 10) fatal.push(`kategori sayısı şüpheli: ${categories.length}`);

const byId = new Map();
const rejected = [];
const warnings = [];
const catStats = [];
let seenRows = 0;
for (const cat of categories) {
  let total = null, rows = 0;
  const uniq = new Set();
  // Menu links may be non-canonical, and there ŞOK ignores ?page/?siralama.
  // Resolve the canonical slug first, then page only through that.
  try { cat.canonical = parseListing(await get(`${BASE}/${cat.path}`))?.canonicalPath ?? cat.path; }
  catch (e) { fatal.push(`${cat.path}: ${e.message}`); continue; }
  // Pass 1 in ascending price order; pass 2 (descending) only if items are
  // still missing.
  for (const sort of [SORT_ASC, SORT_DESC]) {
    if (sort === SORT_DESC && total != null && uniq.size >= total) break;
    let pages = 1;
    for (let n = 1; n <= pages; n++) {
      let res;
      try { res = parseListing(await get(pageUrl(cat.canonical, n, sort))); }
      catch (e) { fatal.push(`${cat.path} ${sort} s.${n}: ${e.message}`); break; }
      if (!res) { fatal.push(`${cat.path} s.${n}: ürün listesi bulunamadı (sayfa yapısı değişmiş olabilir)`); break; }
      if (n === 1) {
        total ??= res.page.totalElements;
        pages = res.page.totalPages;
        if (res.canonicalPath && res.canonicalPath !== cat.canonical) fatal.push(`${cat.path}: kanonik adres değişti (${res.canonicalPath})`);
      }
      if (res.page.number !== n - 1) fatal.push(`${cat.path} ${sort} s.${n}: sayfa numarası ${res.page.number}`);
      rows += res.results.length;
      for (const r of res.results) {
        seenRows++;
        const p = normalize(r);
        if (!p.id || uniq.has(p.id)) continue;
        uniq.add(p.id);
        const probs = productProblems(p);
        if (probs.length) { rejected.push({ id: p.id, name: p.name, category: cat.path, problems: probs }); continue; }
        const warn = productWarnings(p);
        if (warn.length) warnings.push({ id: p.id, name: p.name, warnings: warn });
        if (!byId.has(p.id)) byId.set(p.id, p);
      }
    }
  }
  // ŞOK's pages sometimes repeat a few items across neighbouring pages, so
  // completeness is judged on unique products, not rows.
  const got = uniq.size;
  const missing = total == null ? 0 : total - got;
  if (total && missing / total > MAX_MISSING_RATIO) fatal.push(`${cat.path}: sitede ${total}, toplanan ${got}`);
  catStats.push({ id: cat.id, path: cat.canonical ?? cat.path, kind: cat.kind, total, got, repeatedRows: rows - got });
  console.log(`${cat.kind.padEnd(6)} ${cat.path.padEnd(58)} site=${String(total).padStart(4)} benzersiz=${String(got).padStart(4)}${rows > got ? ` (tekrar ${rows - got})` : ''}`);
}

const products = [...byId.values()];
if (products.length < MIN_PRODUCTS) fatal.push(`çok az ürün: ${products.length}`);
if (seenRows && rejected.length / seenRows > MAX_BAD_RATIO) fatal.push(`hatalı ürün oranı yüksek: ${rejected.length}/${seenRows}`);

for (const w of warnings) console.warn(`  ! ${w.name} | ${w.warnings.join(', ')}`);
for (const r of rejected) console.warn(`  ✗ ${r.category} | ${r.name} | ${r.problems.join(', ')}`);
if (fatal.length) {
  console.error('\nTARAMA REDDEDİLDİ:\n - ' + fatal.join('\n - '));
  process.exit(1);
}

const data = {
  store: 'sok',
  storeName: 'ŞOK',
  source: BASE,
  fetchedAt: new Date().toISOString(),
  stats: {
    products: products.length,
    rejected: rejected.length,
    warnings: warnings.length,
    indirim: products.filter((p) => p.section === 'indirim').length,
    ekstra: products.filter((p) => p.channel === 'ekstra').length,
    outOfStock: products.filter((p) => !p.inStock).length,
  },
  categories: catStats,
  warnings,
  rejected,
  products,
};
await fs.mkdir(path.dirname(OUT), { recursive: true });
await fs.writeFile(OUT, JSON.stringify(data));
console.log(`\n✓ ${products.length} ürün (${data.stats.indirim} indirimli, ${data.stats.ekstra} Ekstra) yazıldı; ${rejected.length} reddedildi → ${path.relative(process.cwd(), OUT)}`);

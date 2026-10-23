// Crawls every page of ВкусВилл "Акции" (/offers/), validates the records and
// writes site/data/vkusvill.json. Exits non-zero (writing nothing) when the
// result looks wrong, so good data is never replaced by garbage.
//
//   node scripts/crawl-vkusvill.js [--save-dir DIR] [--from-dir DIR]
//
// Walks the main /offers/ list and every section list (/offers/<section>/).

import fs from 'node:fs/promises';
import path from 'node:path';
import { fetchText } from '../src/http.js';
import { BASE, pageUrl, parseListing, parseSections } from '../src/sources/vkusvill.js';
import { productProblems, productWarnings } from '../src/validate.js';

const OUT = path.resolve('site/data/vkusvill.json');
const PER_PAGE = 24;
const MIN_PRODUCTS = 100;
const MAX_BAD_RATIO = 0.02;

const arg = (name) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null);
const saveDir = arg('--save-dir');
const fromDir = arg('--from-dir');
const fileFor = (dir, n, sec) => path.join(dir, `offers_${sec ? sec + '_' : ''}${n}.html`);
const get = async (n, sec = '') => {
  if (fromDir) return fs.readFile(fileFor(fromDir, n, sec), 'utf8');
  const html = await fetchText(pageUrl(n, sec), { delayMs: 2500 }); // robots.txt: Crawl-delay 2
  if (saveDir) { await fs.mkdir(saveDir, { recursive: true }); await fs.writeFile(fileFor(saveDir, n, sec), html); }
  return html;
};

const fatal = [];
const byId = new Map();
const rejected = [];
const warnings = [];
const seenIn = new Map(); // id -> how many listings showed it
let rows = 0, mainRows = 0;
const mainIds = new Set();

// The list has no stable sort, so items can shift between pages while we walk
// it. We walk the main list AND every section list; the union is complete.
async function walk(sec) {
  let lastPage = 1, html1 = null;
  const ids = new Set();
  for (let n = 1; n <= lastPage; n++) {
    let html, res;
    try { html = await get(n, sec); res = parseListing(html); }
    catch (e) { fatal.push(`${sec || 'ana'} s.${n}: ${e.message}`); break; }
    if (n === 1) { lastPage = res.lastPage; html1 = html; }
    if (res.cards !== res.products.length) fatal.push(`${sec || 'ana'} s.${n}: kart ${res.cards}, ürün ${res.products.length}`);
    if (n < lastPage && res.cards !== PER_PAGE) fatal.push(`${sec || 'ana'} s.${n}: ${res.cards} kart (beklenen ${PER_PAGE})`);
    rows += res.products.length;
    if (!sec) mainRows += res.products.length;
    for (const p of res.products) {
      ids.add(p.id);
      if (!sec) mainIds.add(p.id);
      if (byId.has(p.id) || rejected.some((r) => r.id === p.id)) continue;
      if (sec && !p.category) p.category = null;
      const probs = productProblems(p);
      if (probs.length) { rejected.push({ id: p.id, name: p.name, page: `${sec || 'ana'} ${n}`, problems: probs }); continue; }
      const warn = productWarnings(p);
      if (warn.length) warnings.push({ id: p.id, name: p.name, warnings: warn });
      byId.set(p.id, p);
    }
  }
  for (const id of ids) seenIn.set(id, (seenIn.get(id) ?? 0) + 1);
  console.log(`${(sec || 'ANA LİSTE').padEnd(36)} ${lastPage} sayfa, ${ids.size} ürün`);
  return html1;
}

const firstHtml = await walk('');
const sections = firstHtml ? parseSections(firstHtml) : [];
if (sections.length < 10) fatal.push(`bölüm sayısı şüpheli: ${sections.length}`);
for (const sec of sections) await walk(sec);

const products = [...byId.values()];
const onlyMain = [...mainIds].filter((id) => (seenIn.get(id) ?? 0) === 1).length;
const onlySections = products.length - [...mainIds].filter((id) => byId.has(id)).length;
const repeated = mainRows - mainIds.size;
if (products.length < MIN_PRODUCTS) fatal.push(`çok az ürün: ${products.length}`);
if (rows && rejected.length / rows > MAX_BAD_RATIO) fatal.push(`hatalı ürün oranı yüksek: ${rejected.length}/${rows}`);
// Both views must agree: anything only one of them shows is a sign of a
// layout change, not of normal page shifting.
if ((onlyMain + onlySections) / products.length > 0.05) fatal.push(`ana liste ve bölümler uyuşmuyor: sadece ana ${onlyMain}, sadece bölüm ${onlySections}`);

for (const w of warnings) console.warn(`  ! ${w.name} | ${w.warnings.join(', ')}`);
for (const r of rejected) console.warn(`  ✗ s.${r.page} | ${r.name} | ${r.problems.join(', ')}`);
if (fatal.length) { console.error('\nTARAMA REDDEDİLDİ:\n - ' + fatal.join('\n - ')); process.exit(1); }

const data = {
  store: 'vkusvill', storeName: 'ВкусВилл', source: `${BASE}/offers/`, fetchedAt: new Date().toISOString(),
  stats: { products: products.length, rows, mainRepeated: repeated, onlyMain, onlySections, sections: sections.length, rejected: rejected.length, warnings: warnings.length },
  warnings, rejected, products,
};
await fs.mkdir(path.dirname(OUT), { recursive: true });
await fs.writeFile(OUT, JSON.stringify(data));
console.log(`\n✓ ${products.length} ürün (ana listede tekrar ${repeated}, sadece ana ${onlyMain}, sadece bölümlerde ${onlySections}, ${rejected.length} reddedildi) → ${path.relative(process.cwd(), OUT)}`);

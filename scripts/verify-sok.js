// Independent second check for ŞOK: open each sampled product's own page and
// compare name / price / old price / id with the listing record; confirm the
// image loads.
//
//   node scripts/verify-sok.js [--sample N] [--all] [--only sok-1,sok-2]

import fs from 'node:fs/promises';
import { politeFetch, fetchText, imageProblem } from '../src/http.js';
import { parseDetail } from '../src/sources/sok.js';

const args = process.argv;
const all = args.includes('--all');
const N = args.includes('--sample') ? Number(args[args.indexOf('--sample') + 1]) : 12;
const data = JSON.parse(await fs.readFile('site/data/sok.json', 'utf8'));
let list = data.products;
if (args.includes('--only')) {
  const only = new Set(args[args.indexOf('--only') + 1].split(','));
  list = list.filter((p) => only.has(p.id));
}

// Sample: discounted items first (they matter most), then spread over categories.
const shuffle = (a) => a.map((x) => [Math.random(), x]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
const pick = all || args.includes('--only') ? list
  : [...shuffle(list.filter((p) => p.oldPrice)).slice(0, Math.ceil(N / 2)),
     ...shuffle(list.filter((p) => !p.oldPrice)).slice(0, Math.floor(N / 2))];

const norm = (s) => (s ?? '').toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim();
let failed = 0;
for (const p of pick) {
  const issues = [];
  try {
    const d = parseDetail(await fetchText(p.url));
    if (!d) issues.push('detay sayfasında ürün verisi yok');
    else {
      if (d.id !== p.id) issues.push(`id: liste ${p.id} / detay ${d.id}`);
      if (norm(d.name) !== norm(p.name)) issues.push(`ad: liste "${p.name}" / detay "${d.name}"`);
      // Size variants can be priced differently; then the listing must match
      // one of the variants that is in stock.
      const inStock = (d.variantPrices ?? []).filter((v) => v.inStock);
      const match = d.price === p.price && (d.oldPrice ?? null) === (p.oldPrice ?? null)
        || inStock.some((v) => v.price === p.price && (v.oldPrice ?? null) === (p.oldPrice ?? null));
      if (!match) {
        if (d.price !== p.price) issues.push(`fiyat: liste ${p.price} / detay ${d.price}`);
        if ((d.oldPrice ?? null) !== (p.oldPrice ?? null)) issues.push(`eski fiyat: liste ${p.oldPrice} / detay ${d.oldPrice}`);
        if (inStock.length) issues.push(`stoktaki bedenler: ${inStock.map((v) => `${v.key}=${v.price}`).join(', ')}`);
      }
    }
  } catch (e) { issues.push(`detay sayfası açılmadı: ${e.message}`); }
  const imgIssue = await imageProblem(p.image);
  if (imgIssue) issues.push(imgIssue);
  if (issues.length) failed++;
  console.log(`${issues.length ? '✗' : '✓'} [${p.category}] ${p.name} — ${p.price} ₺${p.oldPrice ? ` (eski ${p.oldPrice})` : ''}${issues.length ? '\n    ' + issues.join('\n    ') : ''}`);
}
console.log(`\n${pick.length - failed}/${pick.length} ürün detay sayfasıyla birebir aynı.`);
if (failed) process.exit(1);

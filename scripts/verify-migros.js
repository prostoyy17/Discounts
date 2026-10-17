// Independent second check for Migros: fetch each sampled product's own detail
// endpoint and compare name / price / old price / id with the listing record;
// confirm the product page and image load.
//
//   node scripts/verify-migros.js [--sample N] [--all] [--only migros-1,…]

import fs from 'node:fs/promises';
import { politeFetch, fetchText, imageProblem } from '../src/http.js';
import { detailUrl, parseDetail } from '../src/sources/migros.js';

const args = process.argv;
const all = args.includes('--all');
const N = args.includes('--sample') ? Number(args[args.indexOf('--sample') + 1]) : 12;
const data = JSON.parse(await fs.readFile('site/data/migros.json', 'utf8'));
let list = data.products;
if (args.includes('--only')) {
  const only = new Set(args[args.indexOf('--only') + 1].split(','));
  list = list.filter((p) => only.has(p.id));
}
const shuffle = (a) => a.map((x) => [Math.random(), x]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
const pick = all || args.includes('--only') ? list
  : [...shuffle(list.filter((p) => p.oldPrice)).slice(0, Math.ceil(N / 2)),
     ...shuffle(list.filter((p) => !p.oldPrice)).slice(0, Math.floor(N / 2))];

const norm = (s) => (s ?? '').toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim();
let failed = 0;
for (const p of pick) {
  const issues = [];
  try {
    const d = parseDetail(JSON.parse(await fetchText(detailUrl(p.sourceId))));
    if (!d) issues.push('detay verisi yok');
    else {
      if (d.id !== p.id) issues.push(`id: liste ${p.id} / detay ${d.id}`);
      if (norm(d.name) !== norm(p.name)) issues.push(`ad: liste "${p.name}" / detay "${d.name}"`);
      if (d.price !== p.price) issues.push(`fiyat: liste ${p.price} / detay ${d.price}`);
      if ((d.oldPrice ?? null) !== (p.oldPrice ?? null)) issues.push(`eski fiyat: liste ${p.oldPrice} / detay ${d.oldPrice}`);
      if (d.url && d.url !== p.url) issues.push(`link: liste ${p.url} / detay ${d.url}`);
    }
  } catch (e) { issues.push(`detay açılmadı: ${e.message}`); }
  if (all || pick.length <= 50) {
    try {
      const r = await politeFetch(p.url, { method: 'HEAD' });
      if (!r.ok) issues.push(`ürün sayfası: HTTP ${r.status}`);
    } catch (e) { issues.push(`ürün sayfası açılmadı: ${e.message}`); }
  }
  const imgIssue = await imageProblem(p.image);
  if (imgIssue) issues.push(imgIssue);
  if (issues.length) failed++;
  console.log(`${issues.length ? '✗' : '✓'} [${p.category}] ${p.name} — ${p.price} ₺${p.oldPrice ? ` (eski ${p.oldPrice}${p.priceCondition === 'money' ? ', Money' : ''})` : ''}${issues.length ? '\n    ' + issues.join('\n    ') : ''}`);
}
console.log(`\n${pick.length - failed}/${pick.length} ürün detay ile birebir aynı.`);
if (failed) process.exit(1);

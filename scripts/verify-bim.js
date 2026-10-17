// Independent second check: for a sample of products, open the product's own
// detail page on bim.com.tr and compare name / price / old price / id with what
// the listing parser stored; also confirm the image and link actually load.
//
//   node scripts/verify-bim.js [--sample N] [--all] [--only bim-1,bim-2]

import fs from 'node:fs/promises';
import { politeFetch, fetchText, imageProblem } from '../src/http.js';
import { parseDetail } from '../src/sources/bim.js';

const args = process.argv;
const N = args.includes('--sample') ? Number(args[args.indexOf('--sample') + 1]) : 12;
const data = JSON.parse(await fs.readFile('site/data/bim.json', 'utf8'));

const only = args.includes('--only') ? new Set(args[args.indexOf('--only') + 1].split(',')) : null;
if (only) data.products = data.products.filter((p) => only.has(p.id));

// Stratified sample: every period contributes, discounted items first.
const byPeriod = Object.groupBy(data.products, (p) => p.periodKey);
const pick = [];
const pools = Object.values(byPeriod).map((list) => [...list].sort(() => Math.random() - 0.5));
while (pick.length < (args.includes('--all') ? data.products.length : N) && pools.some((p) => p.length))
  for (const pool of pools) if (pool.length && pick.length < (args.includes('--all') ? Infinity : N)) pick.push(pool.pop());

const norm = (s) => (s ?? '').toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim();
let failed = 0;
for (const p of pick) {
  const issues = [];
  try {
    const d = parseDetail(await fetchText(p.detailUrl ?? p.url));
    if (p.sharedDetailUrl && d.id !== p.sourceId) {
      // BİM's shared detail URL shows a sibling product; the listing card is the
      // only page with this product, so check the link we publish instead.
      const res = await politeFetch(p.url);
      if (!res.ok) issues.push(`dönem sayfası açılmadı: HTTP ${res.status}`);
      else if (!(await res.text()).includes(`data-id="${p.sourceId}"`)) issues.push('ürün dönem sayfasında yok');
      throw Object.assign(new Error('shared'), { shared: true });
    }
    if (norm(d.name) !== norm(p.name)) issues.push(`ad: liste "${p.name}" / detay "${d.name}"`);
    if (d.price !== p.price) issues.push(`fiyat: liste ${p.price} / detay ${d.price}`);
    if ((d.oldPrice ?? null) !== (p.oldPrice ?? null)) issues.push(`eski fiyat: liste ${p.oldPrice} / detay ${d.oldPrice}`);
    if (d.id && `bim-${d.id}` !== p.id) issues.push(`id: liste ${p.id} / detay ${d.id}`);
  } catch (e) { if (!e.shared) issues.push(`detay sayfası açılmadı: ${e.message}`); }
  const imgIssue = await imageProblem(p.image);
  if (imgIssue) issues.push(imgIssue);
  if (issues.length) failed++;
  console.log(`${issues.length ? '✗' : '✓'} [${p.periodLabel}] ${p.brand ?? ''} ${p.name} — ${p.price} ₺${issues.length ? '\n    ' + issues.join('\n    ') : ''}`);
}
console.log(`\n${pick.length - failed}/${pick.length} ürün detay sayfasıyla birebir aynı.`);
if (failed) process.exit(1);

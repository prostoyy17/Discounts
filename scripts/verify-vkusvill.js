// Independent second check for ВкусВилл: open each sampled product's own page
// and compare price / old price / id / condition with the listing; check image.
//
//   node scripts/verify-vkusvill.js [--sample N] [--all] [--only vkusvill-1,…]

import fs from 'node:fs/promises';
import { fetchText, imageProblem } from '../src/http.js';
import { parseDetail } from '../src/sources/vkusvill.js';

const args = process.argv;
const N = args.includes('--sample') ? Number(args[args.indexOf('--sample') + 1]) : 12;
const data = JSON.parse(await fs.readFile('site/data/vkusvill.json', 'utf8'));
let list = data.products;
if (args.includes('--only')) { const only = new Set(args[args.indexOf('--only') + 1].split(',')); list = list.filter((p) => only.has(p.id)); }
const shuffle = (a) => a.map((x) => [Math.random(), x]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
const pick = args.includes('--all') || args.includes('--only') ? list : shuffle(list).slice(0, N);
const norm = (s) => (s ?? '').toLocaleLowerCase('ru').replace(/[«»"]/g, '').replace(/\s+/g, ' ').trim();

let failed = 0;
for (const p of pick) {
  const issues = [];
  try {
    const d = parseDetail(await fetchText(p.url, { delayMs: 2500 }));
    if (d.id !== p.id) issues.push(`id: liste ${p.id} / detay ${d.id}`);
    if (!norm(d.name).startsWith(norm(p.name).replace(/,\s*[\d.,]+\s*(г|кг|мл|л|шт)$/, ''))) issues.push(`ad: liste "${p.name}" / detay "${d.name}"`);
    if (d.price !== p.price) issues.push(`fiyat: liste ${p.price} / detay ${d.price}`);
    if ((d.oldPrice ?? null) !== (p.oldPrice ?? null)) issues.push(`eski fiyat: liste ${p.oldPrice} / detay ${d.oldPrice}`);
    if ((d.notice ?? null) !== (p.notice ?? null)) issues.push(`koşul: liste "${p.notice}" / detay "${d.notice}"`);
  } catch (e) { issues.push(`detay açılmadı: ${e.message}`); }
  const img = await imageProblem(p.image);
  if (img) issues.push(img);
  if (issues.length) failed++;
  console.log(`${issues.length ? '✗' : '✓'} ${p.name} — ${p.price} ₽${p.oldPrice ? ` (было ${p.oldPrice})` : ''}${issues.length ? '\n    ' + issues.join('\n    ') : ''}`);
}
console.log(`\n${pick.length - failed}/${pick.length} ürün detay sayfasıyla birebir aynı.`);
if (failed) process.exit(1);

// Independent second check for Магнит: for each sampled deal pick one of the
// checked stores at random, open the product's own page as that store
// (shopCode cookie) and compare it with the published deal; check the image.
//
//   node scripts/verify-magnit.js [--format magnit|magnitgm] [--sample N] [--all] [--only id,…]
//
// Catalogue deal: same price, still discounted (old price ≥ the published
// lowest one), same store code on the page. Leaflet deal (magnit-p…): the
// promo page of that store shows the same price and old price.

import fs from 'node:fs/promises';
import { fetchText, imageProblem } from '../src/http.js';
import { parseDetail, parsePromoDetail } from '../src/sources/magnit.js';
import { nuxtData, dataEntry } from '../src/nuxt.js';

const args = process.argv;
const arg = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null);
const format = arg('--format') || 'magnit';
const N = Number(arg('--sample') ?? 12);
const data = JSON.parse(await fs.readFile(`site/data/${format}.json`, 'utf8'));
let list = data.products;
if (arg('--only')) { const only = new Set(arg('--only').split(',')); list = list.filter((p) => only.has(p.id)); }
const shuffle = (a) => a.map((x) => [Math.random(), x]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
const pick = args.includes('--all') || arg('--only') ? list : shuffle(list).slice(0, N);
const norm = (s) => (s ?? '').toLocaleLowerCase('ru').replace(/\s+/g, ' ').trim();
const stores = data.checkedStores;

let failed = 0;
for (const p of pick) {
  // One of the stores where the deal was confirmed (a store that does not
  // sell the product shows no deal, or no page at all).
  const own = stores.filter((x) => (p.checkedIn ?? []).includes(x.code));
  const pool = own.length ? own : stores;
  const st = pool[Math.floor(Math.random() * pool.length)];
  const opts = { delayMs: 2500, retries: 4, timeoutMs: 60000, headers: { Cookie: `shopCode=${st.code}` } };
  const issues = [];
  try {
    if (p.id.startsWith('magnit-p')) {
      const d = parsePromoDetail(await fetchText(`${p.url}?shopCode=${st.code}`, opts));
      if (d.id !== p.id) issues.push(`id: ${p.id} / ${d.id}`);
      if (norm(d.name) !== norm(p.name)) issues.push(`ad: "${p.name}" / "${d.name}"`);
      if (d.price !== p.price) issues.push(`fiyat: ${p.price} / ${d.price}`);
      if ((d.oldPrice ?? null) !== (p.oldPrice ?? null)) issues.push(`eski fiyat: ${p.oldPrice} / ${d.oldPrice}`);
    } else {
      const html = await fetchText(p.url, opts);
      const d = parseDetail(html);
      const code = dataEntry(nuxtData(html), 'goods-detail')?.storeCode;
      if (code !== st.code) issues.push(`sayfa başka mağazanın: ${code} (istenen ${st.code})`);
      if (d.id !== p.id) issues.push(`id: ${p.id} / ${d.id}`);
      if (norm(d.name) !== norm(p.name)) issues.push(`ad: "${p.name}" / "${d.name}"`);
      if (d.price !== p.price) issues.push(`fiyat: ${p.price} / ${d.price}`);
      if (p.oldPrice && !(d.oldPrice >= p.oldPrice)) issues.push(`eski fiyat: yayın ${p.oldPrice} / mağaza ${d.oldPrice}`);
      if (!d.inStock) issues.push('bu mağazada stokta yok');
    }
  } catch (e) { issues.push(`detay açılmadı: ${e.message}`); }
  const img = await imageProblem(p.image);
  if (img) issues.push(img);
  if (issues.length) failed++;
  console.log(`${issues.length ? '✗' : '✓'} [${st.city}] ${p.name} — ${p.price} ₽${p.oldPrice ? ` (было ${p.oldPrice})` : ''}${p.promotions?.length ? ` · ${p.promotions.join(', ')}` : ''}${issues.length ? '\n    ' + issues.join('\n    ') : ''}`);
}
console.log(`\n${pick.length - failed}/${pick.length} fırsat mağaza sayfasıyla birebir aynı.`);
if (failed) process.exit(1);

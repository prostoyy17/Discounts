// Merges site/data/<store>.json into the compact site/data/products.json the
// page loads. Short keys and per-store URL prefixes keep it small (GitHub
// Pages also gzips it). Runnable alone: node scripts/build-site-data.js
//
// Product keys: s store, id, n name, b brand, c category, p price, o old price,
// d discount %, m price condition ("money"), pr promotions, i image (relative
// to store.img), u link (relative to store.url), k kind (a aktüel, i indirim,
// c catalog), vf/vt valid from/to, pk BİM period key, x out of stock, e Ekstra.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const META = {
  bim: { name: 'BİM', img: 'https://cdn1.bim.com.tr/uploads/aktuel-urunler/', url: 'https://www.bim.com.tr/' },
  sok: { name: 'ŞOK', img: 'https://images.ceptesok.com/product-assets/', url: 'https://www.sokmarket.com.tr/' },
  migros: { name: 'Migros', img: 'https://images.migrosone.com/sanalmarket/product/', url: 'https://www.migros.com.tr/' },
};

const rel = (full, base) => (full && full.startsWith(base) ? full.slice(base.length) : full ? `!${full}` : null);

function compact(p, meta) {
  const kind = p.store === 'bim' ? (p.section === 'indirim' ? 'i' : 'a') : p.oldPrice ? 'i' : 'c';
  const o = { s: p.store, id: p.id, n: p.name, p: p.price, k: kind, i: rel(p.image, meta.img), u: rel(p.url, meta.url) };
  if (p.brand) o.b = p.brand;
  if (p.category) o.c = p.category;
  if (p.quantity) o.q = p.quantity;
  if (p.oldPrice) { o.o = p.oldPrice; o.d = p.discountPercent; }
  if (p.priceCondition) o.m = p.priceCondition;
  if (p.promotions?.length) o.pr = p.promotions;
  if (p.validFrom) o.vf = p.validFrom;
  if (p.validTo) o.vt = p.validTo;
  if (p.periodKey) o.pk = p.periodKey;
  if (p.inStock === false) o.x = 1;
  if (p.channel === 'ekstra') o.e = 1;
  return o;
}

export async function buildSiteData(storeIds, dir = 'site/data') {
  const stores = [];
  const products = [];
  let periods = [];
  for (const id of storeIds) {
    let data;
    try { data = JSON.parse(await fs.readFile(path.join(dir, `${id}.json`), 'utf8')); }
    catch { continue; }
    const meta = META[id];
    const list = data.products.filter((p) => p.inStock !== false);
    stores.push({
      id, name: meta.name, img: meta.img, url: meta.url, source: data.source,
      fetchedAt: data.fetchedAt, stale: data.stale ?? null,
      count: list.length, discounts: list.filter((p) => p.oldPrice).length,
    });
    for (const p of list) products.push(compact(p, meta));
    if (id === 'bim') periods = data.periods.map(({ key, label, section, validFrom, validTo }) => ({ key, label, section, validFrom, validTo }));
  }
  const out = { generatedAt: new Date().toISOString(), stores, periods, products };
  await fs.writeFile(path.join(dir, 'products.json'), JSON.stringify(out));
  return { products: products.length, stores: stores.map((s) => s.id) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = await buildSiteData(Object.keys(META));
  console.log(`site/data/products.json: ${r.products} ürün (${r.stores.join(', ')})`);
}

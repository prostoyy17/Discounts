// Turns site/data/<store>.json into what the page loads: stores.json (store
// list, logos, BİM periods) + deals-<store>.json (compact deal list per store). Short keys and per-store URL prefixes keep it small (GitHub
// Pages also gzips it). Runnable alone: node scripts/build-site-data.js
//
// Product keys: n name, b brand, c category, p price, o old price,
// t deal types (src/deals.js),
// d discount %, m price condition ("money"), pr promotions, i image (relative
// to store.img), u link (relative to store.url), vf/vt valid from/to, pk BİM period key, x out of stock, e Ekstra,
// fs first seen (ISO time; absent = unknown), g product type (src/groups.js).

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { dealTypes } from '../src/deals.js';
import { productGroup } from '../src/groups.js';

const META = {
  // every: planned crawl interval in hours (see .github/workflows/pages.yml)
  bim: { name: 'BİM', country: 'tr', currency: 'TRY', every: 8, logo: 'https://cdn2.bim.com.tr/templates/images/bim-logo-single.png', img: 'https://cdn1.bim.com.tr/uploads/aktuel-urunler/', url: 'https://www.bim.com.tr/' },
  sok: { name: 'ŞOK', country: 'tr', currency: 'TRY', every: 24, logo: 'https://images.ceptesok.com/logos/service-types/market-logo.svg', img: 'https://images.ceptesok.com/product-assets/', url: 'https://www.sokmarket.com.tr/' },
  migros: { name: 'Migros', country: 'tr', currency: 'TRY', every: 48, logo: 'https://www.migros.com.tr/assets/images/seo/new/apple-touch-icon-152x152.png', img: 'https://images.migrosone.com/sanalmarket/product/', url: 'https://www.migros.com.tr/' },
  vkusvill: { name: 'ВкусВилл', country: 'ru', currency: 'RUB', every: 24, logo: 'https://vkusvill.ru/apple-touch-icon.png?v=1', img: 'https://img.vkusvill.ru/pim/images/site/', url: 'https://vkusvill.ru/' },
};

// Same promo rules as the current parsers, so data published by an older
// crawl is shown correctly too.
const cleanPromos = (list) => [...new Set((list ?? [])
  .map((t) => t.replace(/\s*\(Money\)$/, ''))
  .filter((t) => t && !/ücretsiz (teslimat|kargo)/i.test(t)))];

const rel = (full, base) => (full && full.startsWith(base) ? full.slice(base.length) : full ? `!${full}` : null);

function compact(p, meta) {
  const o = { n: p.name, p: p.price, t: dealTypes(p), g: productGroup(p), i: rel(p.image, meta.img), u: rel(p.url, meta.url) };
  if (p.brand) o.b = p.brand;
  if (p.category) o.c = p.category;
  if (p.quantity) o.q = p.quantity;
  if (p.oldPrice) { o.o = p.oldPrice; o.d = p.discountPercent; }
  if (p.priceCondition) o.m = p.priceCondition;
  if (p.onlineOnly) o.on = 1;
  if (p.unit && p.unit !== 'шт') o.un = p.unit; // price per kg etc.
  if (p.promotions?.length) o.pr = p.promotions;
  if (p.validFrom) o.vf = p.validFrom;
  if (p.validTo) o.vt = p.validTo;
  if (p.periodKey) o.pk = p.periodKey;
  if (p.inStock === false) o.x = 1;
  if (p.channel === 'ekstra') o.e = 1;
  if (p.firstSeen) o.fs = p.firstSeen;
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
    // Only products with some saving; out-of-stock items are dropped too.
    const all = data.products.filter((p) => p.inStock !== false).map((p) => ({ ...p, promotions: cleanPromos(p.promotions) }));
    const list = all.filter((p) => dealTypes(p).length);
    stores.push({
      id, name: meta.name, country: meta.country, currency: meta.currency, logo: meta.logo, img: meta.img, url: meta.url, source: data.source,
      fetchedAt: data.fetchedAt, stale: data.stale ?? null, every: meta.every, trackingSince: data.trackingSince ?? null,
      count: list.length, discounts: list.filter((p) => p.oldPrice).length, catalogSize: all.length,
    });
    for (const p of list) products.push({ ...compact(p, meta), _store: id });
    if (id === 'bim') periods = data.periods.map(({ key, label, section, validFrom, validTo }) => ({ key, label, section, validFrom, validTo }));
  }
  // The page first loads the small stores.json, then only the deal files of
  // the store(s) it shows — opening one store downloads just that store.
  const generatedAt = new Date().toISOString();
  for (const st of stores) {
    const file = `deals-${st.id}.json`;
    const items = products.filter((p) => p._store === st.id).map(({ _store, ...p }) => p);
    const body = JSON.stringify(items);
    await fs.writeFile(path.join(dir, file), body);
    st.file = file;
    // Content hash in the URL: browsers may cache it forever and still get new
    // data the moment it changes.
    st.v = createHash('sha1').update(body).digest('hex').slice(0, 10);
  }
  await fs.writeFile(path.join(dir, 'stores.json'), JSON.stringify({ generatedAt, stores, periods }));
  await fs.rm(path.join(dir, 'products.json'), { force: true });
  return { products: products.length, stores: stores.map((s) => s.id) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = await buildSiteData(Object.keys(META));
  console.log(`site/data/stores.json + deals-*.json: ${r.products} ürün (${r.stores.join(', ')})`);
}

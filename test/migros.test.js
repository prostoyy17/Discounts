import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseListing, parseDetail, normalize, listUrl } from '../src/sources/migros.js';
import { productProblems } from '../src/validate.js';

const fx = (f) => JSON.parse(fs.readFileSync(new URL(`./fixtures/migros/${f}`, import.meta.url), 'utf8'));

test('listing: kuruş -> TL, Money price labelled, promos kept', () => {
  const l = parseListing(fx('listing-cikolata.json'));
  assert.equal(l.hitCount, 289);
  assert.equal(l.items.length, 30);
  const ps = l.items.map(normalize);
  for (const p of ps) assert.deepEqual(productProblems(p), [], p.name);
  const k = ps.find((p) => p.id === 'migros-20000007037980');
  assert.deepEqual(
    { price: k.price, oldPrice: k.oldPrice, d: k.discountPercent, cond: k.priceCondition, cat: k.category, unit: k.unitPrice },
    { price: 69.9, oldPrice: 99.5, d: 30, cond: 'money', cat: 'Atıştırmalık', unit: '907,79 TL/Kg' });
  assert.equal(k.url, 'https://www.migros.com.tr/kahve-dunyasi-tambol-bademli-sutlu-cikolata-77-g-p-6b641c');
  assert.match(k.image, /^https:\/\/images\.migrosone\.com\/sanalmarket\/product\//);
  assert.ok(ps.some((p) => p.promotions.includes('İyi Fiyat')));
  for (const p of ps.filter((x) => !x.oldPrice)) assert.equal(p.priceCondition, null);
});

test('detail: loyaltyPrice is the Money price, salePrice the regular one', () => {
  const d = parseDetail(fx('detail-barilla.json'));
  assert.deepEqual({ id: d.id, price: d.price, oldPrice: d.oldPrice },
    { id: 'migros-20000005030346', price: 49.46, oldPrice: 65.95 });
});

test('pages are requested in stable price order', () => {
  assert.equal(listUrl('cikolata-c-439', 1), 'https://www.migros.com.tr/rest/search/screens/cikolata-c-439?sirala=once-en-dusuk-fiyat');
  assert.equal(listUrl('cikolata-c-439', 3), 'https://www.migros.com.tr/rest/search/screens/cikolata-c-439?sirala=once-en-dusuk-fiyat&sayfa=3');
});

test('broken API shape is detected, not silently empty', () => {
  assert.equal(parseListing({ successful: false }), null);
  assert.equal(parseListing({ successful: true, data: {} }), null);
});

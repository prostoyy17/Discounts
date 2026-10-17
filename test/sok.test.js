import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { flightData, jsonAfterKey, parseCategories, parseListing, parseDetail, normalize, pageUrl } from '../src/sources/sok.js';
import { productProblems } from '../src/validate.js';

const fx = (f) => fs.readFileSync(new URL(`./fixtures/sok/${f}`, import.meta.url), 'utf8');

test('jsonAfterKey handles braces and quotes inside strings', () => {
  const s = 'x"a":{"t":"{not}\\"q\\"","n":[1,{"b":2}]},"z":1';
  assert.deepEqual(jsonAfterKey(s, 'a'), { t: '{not}"q"', n: [1, { b: 2 }] });
  assert.equal(jsonAfterKey(s, 'missing'), undefined);
});

test('listing: page info, 20 products, discounts from original > discounted', () => {
  const r = parseListing(fx('listing-sut-page2.html'));
  assert.deepEqual(r.page, { size: 20, totalElements: 146, totalPages: 8, number: 1 });
  assert.equal(r.canonicalPath, 'sut-ve-sut-urunleri-c-460');
  assert.equal(r.results.length, 20);
  const ps = r.results.map((x) => normalize(x));
  for (const p of ps) assert.deepEqual(productProblems(p), [], p.name);
  const dimes = ps.find((p) => p.id === 'sok-818876');
  assert.deepEqual(
    { name: dimes.name, price: dimes.price, oldPrice: dimes.oldPrice, d: dimes.discountPercent, section: dimes.section, cat: dimes.category, url: dimes.url },
    { name: 'Dimes Vanilyalı Mılkshake 310 ml', price: 49.9, oldPrice: 59.9, d: 17, section: 'indirim', cat: 'Süt ve Süt Ürünleri',
      url: 'https://www.sokmarket.com.tr/dimes-vanilyali-milkshake-310-ml-p-818876' });
  assert.match(dimes.image, /^https:\/\/images\.ceptesok\.com\/product-assets\//);
  const plain = ps.filter((p) => !p.oldPrice);
  assert.ok(plain.length > 10);
  for (const p of plain) assert.equal(p.section, 'katalog');
});

test('non-canonical menu link redirects to canonical page 1 (drops ?page)', () => {
  const r = parseListing(fx('listing-giyim-redirected.html'));
  assert.equal(r.page.number, 0);
  assert.equal(r.canonicalPath, 'giyim-ayakkabi-ve-aksesuar-c-20886');
  assert.equal(pageUrl(r.canonicalPath, 2), 'https://www.sokmarket.com.tr/giyim-ayakkabi-ve-aksesuar-c-20886?siralama=PRICE_ASC&page=2');
});

test('detail page: price comes from initialVariant', () => {
  const d = parseDetail(fx('detail-dimes.html'));
  assert.equal(d.id, 'sok-818876');
  assert.equal(d.price, 49.9);
  assert.equal(d.oldPrice, 59.9);
});

test('Ekstra categories found and deduplicated by id', () => {
  const cats = parseCategories(fx('ekstra-home.html'));
  assert.equal(cats.length, 12);
  assert.ok(cats.every((c) => c.kind === 'ekstra'));
  assert.equal(new Set(cats.map((c) => c.id)).size, cats.length);
});

test('flight data decodes Turkish text correctly', () => {
  assert.ok(flightData(fx('detail-dimes.html')).includes('Süt ve Süt Ürünleri'));
});

test('detail page with size variants: price nested in initialVariant.value', () => {
  const d = parseDetail(fx('detail-variant-crocs.html'));
  assert.equal(d.id, 'sok-449964');
  assert.equal(d.price, 799);
  assert.equal(d.oldPrice, null);
});

test('size variants with different prices are all read', () => {
  const d = parseDetail(fx('detail-variant-prices-columbia.html'));
  const inStock = d.variantPrices.filter((v) => v.inStock).map((v) => v.price);
  assert.ok(inStock.includes(5499));
  assert.ok(d.variantPrices.some((v) => !v.inStock && v.price === 4499));
});

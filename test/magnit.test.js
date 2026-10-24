import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseListing, parseDetail, pageUrl, parsePromoPage, parsePromoDetail } from '../src/sources/magnit.js';
import { productProblems } from '../src/validate.js';
import { dealTypes } from '../src/deals.js';
import { productGroup } from '../src/groups.js';

const fx = (f) => fs.readFileSync(new URL(`./fixtures/magnit/${f}`, import.meta.url), 'utf8');

test('page URLs: page 1 has no parameter (robots.txt forbids ?page=1)', () => {
  assert.equal(pageUrl('/catalog', 1), 'https://magnit.ru/catalog');
  assert.equal(pageUrl('/catalog', 7), 'https://magnit.ru/catalog?page=7');
});

test('catalogue page: 33 goods, pagination, category, discounts', () => {
  const r = parseListing(fx('catalog-fish-p1.html'));
  assert.equal(r.cards, 33);
  assert.equal(r.products.length, 33);
  assert.deepEqual([r.total, r.pageSize, r.page], [405, 33, 1]);
  assert.equal(r.category, 'Рыба, морепродукты');
  const krab = r.products[0];
  assert.equal(krab.id, 'magnit-1000393624');
  assert.equal(krab.name, 'Крабовые палочки Русское Море Снежный краб 150г');
  assert.deepEqual([krab.price, krab.oldPrice, krab.discountPercent], [129.99, 159.99, 18]);
  assert.equal(krab.url, 'https://magnit.ru/product/1000393624-russkoe_more_krab_pal_snezh_krab_150g_v_u');
  assert.deepEqual(productProblems(krab), []);
  assert.deepEqual(dealTypes(krab), ['discount']);
  assert.equal(productGroup(krab), 'meat');
  // no old price -> not a deal
  const plain = r.products.find((p) => p.name === 'Крабовые палочки Моя цена весовые');
  assert.equal(plain.oldPrice, null);
  assert.deepEqual(dealTypes(plain), []);
});

test('weighed goods are priced for the shelf weight', () => {
  const r = parseListing(fx('catalog-fish-p1.html'));
  const forel = r.products.find((p) => p.name === 'Форель радужная 500+');
  assert.deepEqual([forel.price, forel.oldPrice, forel.unit], [389.99, 599.99, '600г']);
  const d = parseDetail(fx('product-forel-weighted.html'));
  assert.deepEqual([d.price, d.oldPrice, d.weighted], [389.99, 599.99, true]);
});

test('product page matches the catalogue card (prices in kopecks)', () => {
  const d = parseDetail(fx('product-krab.html'));
  assert.deepEqual(d, { id: 'magnit-1000393624', name: 'Крабовые палочки Русское Море Снежный краб 150г', price: 129.99, oldPrice: 159.99, inStock: true, weighted: false });
});

test('broken page shape is an error, not an empty list', () => {
  assert.throws(() => parseListing('<html></html>'));
  assert.throws(() => parseListing('<script id="__NUXT_DATA__" type="application/json">[{"data":1},{}]</script>'));
});

test('catalogue badges: bonus points are a cashback deal, "Финальная цена" is not a deal', () => {
  const r = parseListing(fx('catalog-fish-p1.html'));
  const salat = r.products.find((p) => p.name.startsWith('Салат Северная гавань/Магнит Крабовый'));
  assert.equal(salat.oldPrice, null);
  assert.deepEqual(salat.promotions, ['+7 бонусов на карту Магнит Плюс']);
  assert.deepEqual(dealTypes(salat), ['cashback']);
  const krab = r.products.find((p) => p.name === 'Крабовые палочки Русское Море 400г'); // badge "Финальная цена"
  assert.deepEqual(krab.promotions, []);
  assert.deepEqual(dealTypes(krab), ['discount']);
  assert.deepEqual(dealTypes({ price: 269.99, oldPrice: 499.99, promotions: ['−25% при покупке от 2 шт'] }), ['discount', 'multi']);
});

test('leaflet: only priced "Скидка" items, card condition, dates, catalogue id from the image', () => {
  const r = parsePromoPage(fx('promo-catalog-p1.html'));
  assert.deepEqual([r.total, r.pageSize, r.cards], [306, 33, 33]);
  assert.ok(r.items.every((x) => x.price > 0));
  const milka = r.items.find((x) => x.id === 'magnit-p2187857');
  assert.deepEqual([milka.price, milka.oldPrice, milka.discountPercent, milka.priceCondition], [129.99, 184.99, 30, 'loyalty']);
  assert.deepEqual([milka.validFrom, milka.validTo, milka.productId], ['2026-09-16', '2026-11-03', '1000444146']);
  assert.equal(milka.url, 'https://magnit.ru/promo-product/2187857-morozhenoe-eskimo-milka-slivochnoe-lesnye-iagody-64-g');
  assert.deepEqual(productProblems(milka), []);
  // "Акция" items (prize games, charity) have no price and are not deals
  assert.ok(!r.items.some((x) => x.name === 'Пончиковый понедельник'));
});

test('leaflet product page (prices in kopecks)', () => {
  assert.deepEqual(parsePromoDetail(fx('promo-product-milka.html')),
    { id: 'magnit-p2187857', name: 'Мороженое эскимо Milka сливочное лесные ягоды, 64 г', price: 129.99, oldPrice: 184.99, category: 'Полуфабрикаты', validTo: '2026-11-03' });
});

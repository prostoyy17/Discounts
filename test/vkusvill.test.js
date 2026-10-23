import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseListing, parseDetail, parseNotice, untilDate, parseSections, pageUrl } from '../src/sources/vkusvill.js';
import { productProblems } from '../src/validate.js';
import { dealTypes } from '../src/deals.js';

const fx = (f) => fs.readFileSync(new URL(`./fixtures/vkusvill/${f}`, import.meta.url), 'utf8');
const TODAY = new Date('2026-10-23T12:00:00Z');

test('conditions: loyalty card, multi-buy, online only, disappearing item', () => {
  assert.deepEqual(parseNotice('Скидка по карте лояльности по 25.10'), { priceCondition: 'loyalty', promotions: [], onlineOnly: false });
  assert.deepEqual(parseNotice('По карте лояльности по 25.10 только онлайн'), { priceCondition: 'loyalty', promotions: [], onlineOnly: true });
  assert.deepEqual(parseNotice('При покупке от 2 шт по 26.10').promotions, ['Цена при покупке от 2 шт']);
  assert.deepEqual(parseNotice('При покупке от 0.7 кг по 29.10').promotions, ['Цена при покупке от 0.7 кг']);
  assert.deepEqual(parseNotice('Исчезающий вид').promotions, ['Исчезающий вид']);
});

test('end dates, including New Year rollover', () => {
  assert.equal(untilDate('Скидка по карте лояльности по 25.10', TODAY), '2026-10-25');
  assert.equal(untilDate('по 05.01', new Date('2026-12-28')), '2027-01-05');
  assert.equal(untilDate('Исчезающий вид', TODAY), null);
});

test('first offers page: 24 cards, 30 pages, sections', () => {
  const html = fx('offers-p1.html');
  const r = parseListing(html, TODAY);
  assert.equal(r.cards, 24);
  assert.equal(r.products.length, 24);
  assert.equal(r.lastPage, 30);
  for (const p of r.products) assert.deepEqual(productProblems(p), [], p.name);
  const tort = r.products[0];
  assert.deepEqual(
    { id: tort.id, name: tort.name, q: tort.quantity, price: tort.price, old: tort.oldPrice, cond: tort.priceCondition, to: tort.validTo, url: tort.url },
    { id: 'vkusvill-104394', name: 'Торт "Черный лес" с вишней', q: '500 г', price: 741, old: 826, cond: 'loyalty', to: '2026-10-25',
      url: 'https://vkusvill.ru/goods/tort-chernyy-les-s-vishney-104394/' });
  assert.deepEqual(dealTypes(tort), ['discount', 'card']);
  assert.equal(tort.unit, 'шт');
  assert.ok(parseSections(html).includes('molochnye-produkty'));
  assert.ok(!parseSections(html).includes('prod6')); // personal tab, empty without login
  assert.equal(pageUrl(3, 'syry'), 'https://vkusvill.ru/offers/syry/?PAGEN_1=3');
});

test('last page: lazy images read from data-src', () => {
  const r = parseListing(fx('offers-last.html'), TODAY);
  assert.ok(r.cards >= 1 && r.cards <= 24);
  for (const p of r.products) {
    assert.deepEqual(productProblems(p), [], p.name);
    assert.ok(!p.image.includes('no-image'), p.name);
  }
});

test('detail page matches the listing card', () => {
  const d = parseDetail(fx('detail-tort.html'));
  assert.deepEqual({ id: d.id, price: d.price, old: d.oldPrice, notice: d.notice },
    { id: 'vkusvill-104394', price: 741, old: 826, notice: 'Скидка по карте лояльности по 25.10' });
});

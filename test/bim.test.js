import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseMenu, parseListing, parseTrPrice, parseDateLabel } from '../src/sources/bim.js';
import { productProblems, pageProblems } from '../src/validate.js';

const fx = (f) => fs.readFileSync(new URL(`./fixtures/bim/${f}`, import.meta.url), 'utf8');
const TODAY = new Date('2026-10-16T12:00:00Z');
const menu = parseMenu(fx('aktuel-1674.html'));
const page = (key) => menu.find((m) => m.key === key);

test('Turkish price formats', () => {
  assert.equal(parseTrPrice('7.950,00'), 7950);
  assert.equal(parseTrPrice('379,00'), 379);
  assert.equal(parseTrPrice('62,50'), 62.5);
  assert.equal(parseTrPrice('1.234.567,9'), 1234567.9);
  assert.equal(parseTrPrice('299,'), 299);
  assert.equal(parseTrPrice('12 ₺'), 12);
  assert.equal(parseTrPrice(''), null);
  assert.equal(parseTrPrice('abc'), null);
});

test('date labels, including year rollover', () => {
  assert.deepEqual(parseDateLabel('06 Ekim Salı', TODAY), { start: '2026-10-06', end: null });
  assert.deepEqual(parseDateLabel('10-16 Ekim', TODAY), { start: '2026-10-10', end: '2026-10-16' });
  assert.deepEqual(parseDateLabel('24 Mart-31 Aralık', TODAY), { start: '2026-03-24', end: '2026-12-31' });
  assert.deepEqual(parseDateLabel('28 Aralık-3 Ocak', TODAY), { start: '2026-12-28', end: '2027-01-03' });
  assert.deepEqual(parseDateLabel('02 Ocak Cuma', new Date('2026-12-30')), { start: '2027-01-02', end: null });
  assert.deepEqual(parseDateLabel('16-19 Ekim ', TODAY), { start: '2026-10-16', end: '2026-10-19' });
  assert.deepEqual(parseDateLabel('???', TODAY), { start: null, end: null });
});

test('menu: 11 aktüel days + 1 indirim period, all unique', () => {
  assert.equal(menu.length, 12);
  assert.equal(menu.filter((m) => m.section === 'indirim').length, 1);
  assert.deepEqual(page('1690'), {
    key: '1690', label: '10-16 Ekim', section: 'indirim',
    url: 'https://www.bim.com.tr/Categories/100/aktuel-urunler.aspx?top=1&Bim_AktuelTarihKey=1690',
  });
});

test('indirim page: every card parsed, old price and % present', () => {
  const r = parseListing(fx('indirim-1690.html'), page('1690'), TODAY);
  assert.equal(r.cardCount, 49);
  assert.equal(r.bannerCount, 2);
  assert.deepEqual(pageProblems(r), []);
  for (const p of r.products) assert.deepEqual(productProblems(p), [], p.name);
  const tea = r.products.find((p) => p.id === 'bim-71767');
  assert.deepEqual(
    { brand: tea.brand, name: tea.name, quantity: tea.quantity, price: tea.price, oldPrice: tea.oldPrice,
      discountPercent: tea.discountPercent, validFrom: tea.validFrom, validTo: tea.validTo, url: tea.url },
    { brand: 'Doğuş', name: 'Siyah Çay Kırmızı Dem', quantity: '1 kg', price: 299, oldPrice: 379,
      discountPercent: 21, validFrom: '2026-10-10', validTo: '2026-10-16',
      url: 'https://www.bim.com.tr/aktuel-urunler/siyah-cay-kirmizi-dem-10-10/aktuel.aspx' });
  assert.match(tea.image, /^https:\/\/cdn1\.bim\.com\.tr\/uploads\/aktuel-urunler\/1690_kucuk_.*\.jpg$/);
});

test('aktüel page: banners skipped, lazy (xsrc) images resolved', () => {
  const r = parseListing(fx('aktuel-1674.html'), page('1674'), TODAY);
  assert.equal(r.cardCount, 88);
  assert.equal(r.bannerCount, 2);
  assert.deepEqual(pageProblems(r), []);
  for (const p of r.products) {
    assert.deepEqual(productProblems(p), [], p.name);
    assert.equal(p.oldPrice, null);
  }
  const oil = r.products.find((p) => p.id === 'bim-71106');
  assert.equal(oil.name, 'AYÇİÇEK YAĞI');
  assert.equal(oil.brand, 'ABALI');
  assert.equal(oil.quantity, '5 L');
  assert.equal(oil.price, 445);
  assert.equal(oil.validFrom, '2026-10-06');
  // last card on the page is lazy-loaded
  assert.ok(r.products.at(-1).image.startsWith('https://cdn1.bim.com.tr/'));
});

test('validator rejects broken records', () => {
  const good = { id: 'bim-1', store: 'bim', section: 'indirim', name: 'Süt', price: 30, oldPrice: 40, discountPercent: 25,
    image: 'https://cdn1.bim.com.tr/x.jpg', url: 'https://www.bim.com.tr/aktuel-urunler/x/aktuel.aspx', validFrom: '2026-10-10' };
  assert.deepEqual(productProblems(good), []);
  assert.ok(productProblems({ ...good, price: null }).length);
  assert.ok(productProblems({ ...good, oldPrice: 20 }).length);
  assert.ok(productProblems({ ...good, discountPercent: 50 }).length);
  assert.ok(productProblems({ ...good, oldPrice: null, discountPercent: null }).length);
  assert.ok(productProblems({ ...good, image: 'https://evil.example/x.jpg' }).length);
  assert.ok(productProblems({ ...good, name: 'A &amp; B' }).length);
  assert.ok(pageProblems({ products: [good, good], cardCount: 2, errors: [] }).length);
  assert.ok(pageProblems({ products: [good], cardCount: 2, errors: [] }).length);
});

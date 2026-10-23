import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dealTypes, promoType } from '../src/deals.js';

test('promotion labels from all stores are classified', () => {
  const cases = {
    '2 Al 1 Öde': 'multi', '3 al 2 öde': 'multi', '2.si %50': 'multi', '2.si %50 İndirimli': 'multi', '4 Al 3 Öde': 'multi', '1 ALANA 1 BEDAVA': 'multi', 'İkincisi %50 İndirimli': 'multi', "2 Öde 1'i İade": 'multi',
    'Sepette %40 İndirim': 'basket', '50 TL Sepette 79,95 TL': 'basket', '50 TL ve üzeri alışverişte 169.00 TL!': 'basket',
    'Win kampanyası ile 55 win Para anında cüzdanında!': 'cashback',
    'STOKLARI BİTİRİYORUZ': 'clearance', 'Kapış Kapış': 'clearance',
    'Migroskop': 'catalog', 'İyi Fiyat': 'goodprice',
    'anadolu mutfağı ürünlerine %20 indirim': 'promo',
  };
  for (const [label, type] of Object.entries(cases)) assert.equal(promoType(label), type, label);
});

test('deal types per product; plain products have none', () => {
  assert.deepEqual(dealTypes({ store: 'sok', price: 10, oldPrice: null, promotions: [] }), []);
  assert.deepEqual(dealTypes({ store: 'sok', price: 49.9, oldPrice: 59.9, promotions: [] }), ['discount']);
  assert.deepEqual(dealTypes({ store: 'migros', price: 69.9, oldPrice: 99.5, priceCondition: 'money', promotions: ['Migroskop'] }), ['discount', 'card', 'catalog']);
  assert.deepEqual(dealTypes({ store: 'migros', price: 80, oldPrice: null, promotions: ['2 Al 1 Öde'] }), ['multi']);
  assert.deepEqual(dealTypes({ store: 'bim', section: 'aktuel', price: 445, promotions: [] }), ['catalog']);
});

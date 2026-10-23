import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carryFirstSeen } from '../src/history.js';

const P = (id, price, extra = {}) => ({ id, price, oldPrice: null, promotions: [], ...extra });

test('first tracking run marks existing deals unknown, new ones with time', () => {
  const prev = { fetchedAt: 'T0', products: [P('a', 10), P('b', 20)] };
  const data = { fetchedAt: 'T1', products: [P('a', 10), P('b', 15), P('c', 5)] };
  assert.equal(carryFirstSeen(data, prev), 2);
  assert.deepEqual(data.products.map((p) => p.firstSeen), [null, 'T1', 'T1']);
  assert.equal(data.trackingSince, 'T0');
});

test('later runs keep the original firstSeen while the deal is unchanged', () => {
  const prev = { fetchedAt: 'T1', trackingSince: 'T0', products: [P('a', 10, { firstSeen: null }), P('c', 5, { firstSeen: 'T1' })] };
  const data = { fetchedAt: 'T2', products: [P('a', 10), P('c', 5), P('c2', 5, { promotions: ['2 Al 1 Öde'] })] };
  carryFirstSeen(data, prev);
  assert.deepEqual(data.products.map((p) => p.firstSeen), [null, 'T1', 'T2']);
  // promotion changed -> new deal
  const data2 = { fetchedAt: 'T3', products: [P('c', 5, { promotions: ['2 Al 1 Öde'] })] };
  carryFirstSeen(data2, { ...data, products: data.products });
  assert.equal(data2.products[0].firstSeen, 'T3');
});

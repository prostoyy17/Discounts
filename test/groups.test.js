import test from 'node:test';
import assert from 'node:assert/strict';
import { productGroup, GROUPS, FOOD } from '../src/groups.js';

const g = (name, category = null) => productGroup({ name, category });

test('store categories map to one taxonomy', () => {
  assert.equal(g('x', 'Süt, Kahvaltılık'), 'dairy');
  assert.equal(g('x', 'Kitap, Kırtasiye, Oyuncak'), 'hobby');
  assert.equal(g('x', 'Hazır Yemek, Meze'), 'ready');
  assert.equal(g('x', 'Telefon ve Aksesuarları'), 'tech');
  assert.equal(g('x', 'Готовая еда'), 'ready');
  assert.equal(g('x', 'Товары для детей'), 'baby');
  assert.equal(g('x', 'Рыба, икра и морепродукты'), 'meat');
});

test('BİM names: the head noun at the end decides', () => {
  assert.equal(g('Nutella Fındık Kremalı Bisküvi'), 'snacks');
  assert.equal(g('KAKAOLU FINDIK KREMASI'), 'staples');
  assert.equal(g('ÇAY MAKİNESİ TEABLEND AR3141'), 'tech');
  assert.equal(g('Nez Çay Bardağı ~175 cc'), 'home');
  assert.equal(g('Siyah Karadeniz Çayı'), 'drinks');
  assert.equal(g('%18 Yağlı Krema'), 'dairy');
  assert.equal(g('Krem Şanti'), 'staples');
  assert.equal(g('El Kremi'), 'beauty');
  assert.equal(g('Ultra Çamaşır Suyu'), 'cleaning');
  assert.equal(g('%100 Meyve Suyu'), 'drinks');
  assert.equal(g('ERKEK TSHIRT'), 'clothes'); // "I" lower-cases to "ı" in Turkish
  assert.equal(g('KADIN YOGA ÇORABI'), 'clothes');
  assert.equal(g('KETTLEBELL'), 'hobby');
  assert.equal(g('Barbie Lisanslı Evcil Hayvan Taşıma Çantalı Sert Şeker'), 'snacks');
  assert.equal(g('Bebek Şampuanı'), 'baby');
  assert.equal(g('Tuvalet Kağıdı'), 'cleaning');
  assert.equal(g('Mısır Cipsi Acı Baharatlı'), 'snacks');
});

test('Russian names: the first word decides', () => {
  assert.equal(g('Пиво "Пауланер Мюнхнер Хелл" светлое фильтр., ж/б 500 мл'), 'drinks');
  assert.equal(g('Бабушкины котлеты в сливочно-перечном соусе с отварным рисом'), 'ready');
});

test('food groups come first', () => {
  assert.deepEqual(GROUPS.slice(0, FOOD.size).every((x) => FOOD.has(x)), true);
});

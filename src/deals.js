// What kind of saving a product has. The site only lists products with at
// least one deal type; plain catalogue items are left out.
//
//   discount  – crossed-out old price (any store)
//   card      – the discount needs a loyalty card (Migros "Money ile");
//               such products are also 'discount'
//   multi     – multi-buy: "2 Al 1 Öde", "2.si %50", "1 Alana 1 Bedava",
//               "İkincisi %50 İndirimli", "2 Öde 1'i İade"
//   basket    – price/discount at checkout or above a basket total:
//               "50 TL ve üzeri alışverişte 169 TL!", "Sepette %40 İndirim"
//   cashback  – money back to a wallet: ŞOK "Win Para"
//   clearance – "Stokları bitiriyoruz", "Kapış Kapış" (while stocks last)
//   catalog   – in the store's weekly/monthly campaign catalogue:
//               BİM Aktüel, Migroskop
//   goodprice – store's own "İyi Fiyat" (good price) label
//   promo     – any other named campaign (e.g. "… ürünlerine %20 indirim")

export const DEAL_TYPES = ['discount', 'card', 'multi', 'basket', 'cashback', 'clearance', 'catalog', 'goodprice', 'promo'];

const RULES = [
  ['multi', /\d+\s*al\s*\d+\s*öde|\d\.?\s*si\s*%\s*\d+|alana\s+\d+\s+bedava|ikincisi\s*%|\d+\s*öde\s*\d+'?\S*\s+iade/],
  ['basket', /sepette|üzeri\s+alışverişte|tl\s+üzeri/i],
  ['cashback', /win\s*para/i],
  ['clearance', /stokları\s+bitiriyoruz|kapış\s+kapış/i],
  ['catalog', /^migroskop$/i],
  ['goodprice', /^iyi\s+fiyat$/i],
];

/** Classifies one promotion label. */
export function promoType(label) {
  // Turkish lower-casing first: JS /i does not map "İ" to "i".
  const l = (label ?? '').toLocaleLowerCase('tr');
  for (const [type, re] of RULES) if (re.test(l)) return type;
  return 'promo';
}

/** All deal types of a normalized product (empty = not a deal). */
export function dealTypes(p) {
  const out = new Set();
  if (p.oldPrice && p.oldPrice > p.price) {
    out.add('discount');
    if (p.priceCondition === 'money') out.add('card');
  }
  if (p.store === 'bim' && p.section === 'aktuel') out.add('catalog');
  for (const label of p.promotions ?? []) out.add(promoType(label));
  return DEAL_TYPES.filter((t) => out.has(t));
}

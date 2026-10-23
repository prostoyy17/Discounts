// Migros Sanal Market (www.migros.com.tr).
//
// Data source (checked 17.10.2026): the site's own JSON endpoints, the same
// ones its pages load; /rest is not disallowed by robots.txt (only /arama).
//   - Listing: GET /rest/search/screens/<category-prettyName>?sayfa=N
//     -> data.searchInfo { hitCount, pageCount, storeProductInfos[30] }
//   - Detail:  GET /rest/products/screens/ssr/<id>
//     -> data { salePrice, loyaltyPrice, name, images, … }
//   - Prices are in kuruş (6595 = 65,95 ₺).
//   - Listing: regularPrice = shelf price, shownPrice = price shown on the site.
//     When shownPrice < regularPrice the product carries loyaltyPromotionId and
//     the detail page calls it loyaltyPrice: it is the **Money card** price
//     (Migros' free loyalty card). We label it as such.
//   - Other promos: badges CROSS_PROMOTED ("2 Al 1 Öde"), crmDiscountTags
//     (Money basket deals like "50 TL Sepette 79,95 TL"), GREAT_PRICE
//     ("İyi Fiyat"), DELIST_SALEABLE ("Stokları bitiriyoruz").

export const BASE = 'https://www.migros.com.tr';
// The default "Önerilenler" order reshuffles while we page through it (items
// repeat and others are skipped), so we page in price order instead.
export const SORT_ASC = 'once-en-dusuk-fiyat';
export const SORT_DESC = 'once-en-yuksek-fiyat';
export const listUrl = (prettyName, n, sort = SORT_ASC) => `${BASE}/rest/search/screens/${prettyName}?sirala=${sort}${n > 1 ? `&sayfa=${n}` : ''}`;
export const detailUrl = (id) => `${BASE}/rest/products/screens/ssr/${id}`;

// Main departments. Seasonal/brand collections (Maç Özel, Sonbahar Favorileri,
// Lay's Hasat …) only re-list products from these.
export const ROOT_CATEGORIES = [
  'meyve-sebze-c-2', 'et-tavuk-balik-c-3', 'sut-kahvaltilik-c-4', 'temel-gida-c-5',
  'icecek-c-6', 'deterjan-temizlik-c-7', 'kisisel-bakim-kozmetik-saglik-c-8', 'bebek-c-9',
  'ev-yasam-c-a', 'evcil-hayvan-c-a0', 'elektronik-c-a6', 'dondurulmus-gida-c-7c',
  'hazir-yemek-meze-c-7d', 'firin-pastane-c-7e', 'kagit-islak-mendil-c-8d', 'atistirmalik-c-113fb',
  'kitap-kirtasiye-oyuncak-c-118ec', 'dondurma-c-41b', 'cicek-c-502',
];

const clean = (s) => (s ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
const tl = (kurus) => (typeof kurus === 'number' ? Math.round(kurus) / 100 : null);

/** Listing JSON -> { hitCount, pageCount, items } or null when the shape changed. */
export function parseListing(json) {
  const s = json?.data?.searchInfo;
  if (!json?.successful || !s || !Array.isArray(s.storeProductInfos)) return null;
  return { hitCount: s.hitCount, pageCount: s.pageCount, items: s.storeProductInfos };
}

// Badges that mean a deal (CROSS_PROMOTED "2 Al 1 Öde", DELIST_SALEABLE
// "Stokları bitiriyoruz", GREAT_PRICE "İyi Fiyat") and marketing groups that are
// campaigns (Migroskop catalog, Kapış Kapış flash deals). Labels like "Yeni",
// "Protein Rotası", "Pestisit Analizli" are not deals and are dropped.
const PROMO_BADGES = { CROSS_PROMOTED: true, GREAT_PRICE: true, DELIST_SALEABLE: true };
const CAMPAIGN_GROUPS = new Set(['Migroskop', 'Kapış Kapış']);

/** One listing item -> RevoSell product record. */
export function normalize(p) {
  const regular = tl(p.regularPrice);
  const shown = tl(p.shownPrice);
  const discounted = regular != null && shown != null && regular > shown;
  const roots = p.categoryAscendants ?? [];
  const root = roots[roots.length - 1] ?? p.category;
  const promotions = [
    ...(p.badges ?? []).filter((b) => PROMO_BADGES[b.name]).map((b) => clean(b.value)),
    ...(p.crmDiscountTags ?? []).map((t) => clean(t.tag)),
    ...(p.groupBadgeMap?.MARKETING ?? []).map((b) => clean(b.name)).filter((n) => CAMPAIGN_GROUPS.has(n)),
  ].filter(Boolean);
  return {
    store: 'migros',
    id: p.id ? `migros-${p.id}` : null,
    sourceId: p.id != null ? String(p.id) : null,
    sku: p.sku ?? null,
    section: discounted ? 'indirim' : 'katalog',
    category: clean(root?.name) || null,
    brand: clean(p.brand?.name) || null,
    name: clean(p.name),
    quantity: null,
    unitPrice: clean(p.unitPrice).replace(/^\(|\)$/g, '') || null,
    price: shown,
    oldPrice: discounted ? regular : null,
    discountPercent: discounted ? Math.round((1 - shown / regular) * 100) : null,
    storeDiscountPercent: p.discountRate ?? null,
    priceCondition: discounted && p.loyaltyPromotionId ? 'money' : null,
    currency: 'TRY',
    inStock: p.status === 'IN_SALE',
    promotions: [...new Set(promotions)],
    image: p.images?.[0]?.urls?.PRODUCT_DETAIL ?? p.images?.[0]?.urls?.PRODUCT_LIST ?? null,
    url: p.prettyName ? `${BASE}/${p.prettyName}` : null,
    validFrom: null,
    validTo: null,
  };
}

/** Detail JSON -> { id, name, price, oldPrice } for the verifier. */
export function parseDetail(json) {
  const d = json?.data;
  if (!json?.successful || !d) return null;
  const sale = tl(d.salePrice);
  const loyalty = tl(d.loyaltyPrice);
  const discounted = sale != null && loyalty != null && loyalty < sale;
  return {
    id: d.id ? `migros-${d.id}` : null,
    name: clean(d.name),
    price: discounted ? loyalty : sale,
    oldPrice: discounted ? sale : null,
    image: d.images?.[0]?.urls?.PRODUCT_DETAIL ?? null,
    url: d.prettyName ? `${BASE}/${d.prettyName}` : null,
  };
}

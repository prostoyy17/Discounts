// Sanity checks for parsed offers. Each product gets a list of problems;
// a crawl is rejected when anything structural is wrong, so a broken parser
// never publishes garbage over the last good data.

const IMAGE_HOSTS = { bim: ['cdn1.bim.com.tr', 'cdn2.bim.com.tr'] };
const PAGE_HOSTS = { bim: ['www.bim.com.tr'] };

const hostOf = (u) => { try { return new URL(u).host; } catch { return null; } };

export function productProblems(p) {
  const out = [];
  if (!p.id || !/^\w+-\d+$/.test(p.id)) out.push('id eksik/bozuk');
  if (!p.name || p.name.length < 2) out.push('ad eksik');
  else if (/<|>|&[a-z]+;/i.test(p.name)) out.push('adda HTML artığı');
  if (typeof p.price !== 'number' || !(p.price > 0)) out.push('fiyat eksik/0');
  else if (p.price > 1_000_000) out.push('fiyat şüpheli büyük');
  if (p.oldPrice != null) {
    if (!(p.oldPrice > p.price)) out.push('eski fiyat yeni fiyattan büyük değil');
    if (p.discountPercent != null) {
      const computed = Math.round((1 - p.price / p.oldPrice) * 100);
      if (Math.abs(computed - p.discountPercent) > 1)
        out.push(`indirim % uyuşmuyor (sitede ${p.discountPercent}, hesap ${computed})`);
    }
  }
  if (p.section === 'indirim' && p.oldPrice == null) out.push('indirim ürününde eski fiyat yok');
  if (!p.image || !(IMAGE_HOSTS[p.store] ?? []).includes(hostOf(p.image))) out.push('görsel URL bozuk');
  if (!p.url || !(PAGE_HOSTS[p.store] ?? []).includes(hostOf(p.url))) out.push('ürün linki bozuk');
  if (!p.validFrom) out.push('tarih çözülemedi');
  return out;
}

/** Page-level: every card parsed, no duplicate ids inside the page. */
export function pageProblems({ products, cardCount, errors }) {
  const out = [];
  if (products.length !== cardCount) out.push(`kart ${cardCount}, ürün ${products.length}`);
  if (errors.length) out.push(`${errors.length} kart ayrıştırılamadı`);
  const ids = products.map((p) => p.id);
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dup.length) out.push(`tekrarlanan id: ${[...new Set(dup)].join(', ')}`);
  return out;
}

// Remembers when each deal was first seen, so the site can mark new deals and
// say "on sale since …" for stores that publish no end dates (ŞOK, Migros).
//
// A deal is identified by product id + price + old price + promotion labels:
// if any of these change, it is a new deal. Deals that already existed before
// tracking started get firstSeen = null ("unknown"), never a made-up date.

export const dealKey = (p) => [p.price, p.oldPrice ?? '', [...(p.promotions ?? [])].sort().join('+')].join('|');

/** Sets p.firstSeen on every product of `data` using the previous published data. */
export function carryFirstSeen(data, prev, now = data.fetchedAt) {
  const known = new Map();
  const tracked = prev?.products?.some((p) => 'firstSeen' in p);
  for (const p of prev?.products ?? []) known.set(p.id, p);
  let fresh = 0;
  for (const p of data.products) {
    const old = known.get(p.id);
    if (old && dealKey(old) === dealKey(p)) p.firstSeen = tracked ? old.firstSeen ?? null : null;
    else if (!prev) p.firstSeen = null; // very first crawl: nothing to compare with
    else { p.firstSeen = now; fresh++; }
  }
  data.trackingSince = prev?.trackingSince ?? (prev ? prev.fetchedAt : data.fetchedAt);
  return fresh;
}

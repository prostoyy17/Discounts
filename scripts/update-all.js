// Runs every store's crawler + verifier, then builds the files the site loads.
// Each store is independent: if one store's crawl or check fails, its last
// published data is reused (downloaded from the live site) and marked stale,
// while the other stores still update. Nothing is ever replaced by bad data.
//
//   node scripts/update-all.js [--only bim,sok] [--no-verify] [--offline] [--reuse-published]
//     --offline: don't crawl; just rebuild from site/data/<store>.json
//     --reuse-published: don't crawl; take each store's last published data
//       from the live site (used on code pushes so design changes go live in
//       a minute instead of waiting for a full crawl)

import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { buildSiteData } from './build-site-data.js';
import { carryFirstSeen } from '../src/history.js';

const SITE = process.env.PAGES_URL ?? 'https://prostoyy17.github.io/Discounts';
const STORES = [
  { id: 'bim', crawl: 'scripts/crawl-bim.js', verify: 'scripts/verify-bim.js' },
  { id: 'sok', crawl: 'scripts/crawl-sok.js', verify: 'scripts/verify-sok.js' },
  { id: 'migros', crawl: 'scripts/crawl-migros.js', verify: 'scripts/verify-migros.js' },
  { id: 'vkusvill', crawl: 'scripts/crawl-vkusvill.js', verify: 'scripts/verify-vkusvill.js' },
  { id: 'magnit', crawl: 'scripts/crawl-magnit.js', verify: 'scripts/verify-magnit.js' },
];

const args = process.argv;
const only = args.includes('--only') ? new Set(args[args.indexOf('--only') + 1].split(',')) : null;
const offline = args.includes('--offline');
const reuse = args.includes('--reuse-published');
const verify = !args.includes('--no-verify');
const dataFile = (id) => path.resolve(`site/data/${id}.json`);

const run = (script, extra = []) => {
  console.log(`\n▶ node ${script} ${extra.join(' ')}`);
  const r = spawnSync(process.execPath, [script, ...extra], { stdio: 'inherit' });
  return r.status === 0;
};

async function previousPublished(id) {
  try {
    const res = await fetch(`${SITE}/data/${id}.json`, { signal: AbortSignal.timeout(60000) });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data?.products) && data.products.length ? data : null;
  } catch { return null; }
}

const status = [];
const save = async (id, data) => {
  await fs.mkdir(path.dirname(dataFile(id)), { recursive: true });
  await fs.writeFile(dataFile(id), JSON.stringify(data));
};

// 1) Crawl + verify the stores this run is for.
const crawled = new Set();
for (const store of STORES) {
  if (reuse || (only && !only.has(store.id))) continue;
  let ok = offline;
  let error = null;
  if (!offline) {
    ok = run(store.crawl);
    if (!ok) error = 'tarama reddedildi';
    else if (verify && !run(store.verify, ['--sample', '12'])) { ok = false; error = 'doğrulama başarısız'; }
  }
  crawled.add(store.id);
  if (ok) {
    if (!offline) {
      const data = JSON.parse(await fs.readFile(dataFile(store.id), 'utf8'));
      const fresh = carryFirstSeen(data, await previousPublished(store.id));
      await save(store.id, data);
      console.log(`  ${store.id}: ${fresh} yeni/değişen fırsat`);
    }
    status.push({ store: store.id, fresh: true });
    continue;
  }
  if (offline) continue;
  console.warn(`\n⚠ ${store.id}: ${error} — son yayımlanan veri kullanılacak`);
  const prev = await previousPublished(store.id);
  if (prev) {
    prev.stale = { since: prev.stale?.since ?? new Date().toISOString(), reason: error };
    await save(store.id, prev);
    status.push({ store: store.id, fresh: false, reason: error, dataFrom: prev.fetchedAt });
  } else {
    await fs.rm(dataFile(store.id), { force: true });
    status.push({ store: store.id, fresh: false, reason: error, dataFrom: null });
  }
}

// 2) Every other store keeps its live data. Fetched after the crawls, so a
//    long run does not overwrite another store's newer publication.
if (!offline) {
  for (const store of STORES) {
    if (crawled.has(store.id)) continue;
    const prev = await previousPublished(store.id);
    if (prev) {
      await save(store.id, prev);
      status.push({ store: store.id, fresh: false, reason: 'yayındaki veri', dataFrom: prev.fetchedAt });
    } else status.push({ store: store.id, fresh: false, reason: 'yayımlanmış veri yok', dataFrom: null });
  }
}

const built = await buildSiteData(STORES.map((s) => s.id));
console.log(`\nsite/data: ${built.products} ürün, mağazalar: ${built.stores.join(', ')}`);
for (const s of status) console.log(`  ${s.fresh ? '✓' : '⚠'} ${s.store}${s.fresh ? '' : ` — ${s.reason}; veri: ${s.dataFrom ?? 'yok'}`}`);
if (!built.products) {
  console.error('Hiçbir mağaza için veri yok — yayın yapılmayacak.');
  process.exit(1);
}

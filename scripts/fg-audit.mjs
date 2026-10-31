// Figure ground audit, no UI: opens every building point on the real basemap in a headless browser and measures the footprint the site would draw.
// Run on a computer with internet access: node scripts/fg-audit.mjs   ->  figure-ground-audit.csv (only the doubtful rows) + one summary line.
// Flags: NOT_FOUND (no basemap shape contains the point), LARGE (> 20000 m2), SMALL (< 30 m2), MULTI (more than one shape), NO_TILES (tiles never loaded).
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(import.meta.url)('playwright');
const places = JSON.parse(readFileSync(resolve(ROOT, 'src/data/places.json'), 'utf8')).places;
const jobs = places.flatMap((p) => p.points.map((pt, i) => ({ id: p.id, name: p.name, n: p.points.length, i, lng: pt.lng, lat: pt.lat })));
const WORKERS = 3;
const MAX_FOOTPRINT_M2 = 150000; // same limit as the site

// Runs inside the page (same rules as MapView.tsx: the shape must contain the point, courtyards do not count, oversized shapes are skipped)
const PAGE = `
const ringHas = (r, x, y) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
const polys = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []);
const covers = (g, x, y) => polys(g).some(([o, ...h]) => o && ringHas(o, x, y) && !h.some((r) => ringHas(r, x, y)));
const ringArea = (r, lat) => { const kx = 111320 * Math.cos((lat * Math.PI) / 180), ky = 110574; let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * kx * (r[i][1] * ky) - r[i][0] * kx * (r[j][1] * ky); return Math.abs(a) / 2; };
const area = (g, lat) => polys(g).reduce((n, [o, ...h]) => n + (o ? ringArea(o, lat) : 0) - h.reduce((m, r) => m + ringArea(r, lat), 0), 0);
window.measure = async (lng, lat, max) => {
  const look = () => {
    const layers = map.getStyle().layers.filter((l) => l['source-layer'] === 'building').map((l) => l.id);
    if (!layers.length) return { ready: false, shapes: 0, area: 0 };
    const px = map.project([lng, lat]);
    const hits = map.queryRenderedFeatures([[px.x - 2, px.y - 2], [px.x + 2, px.y + 2]], { layers }).filter((h) => covers(h.geometry, lng, lat) && area(h.geometry, lat) <= max);
    return { ready: true, shapes: hits.length, area: Math.round(hits.reduce((n, h) => n + area(h.geometry, lat), 0)) };
  };
  map.jumpTo({ center: [lng, lat], zoom: 17 });
  const idle = () => new Promise((r) => { const t = setTimeout(r, 15000); map.once('idle', () => { clearTimeout(t); r(); }); });
  await idle();
  let r = look();
  for (let k = 0; k < 2 && (!r.ready || r.shapes === 0); k++) { await new Promise((s) => setTimeout(s, 1200)); await idle(); r = look(); } // tiles may still be arriving
  return r;
};
`;

const browser = await chromium.launch();
const out = [];
let next = 0;
async function worker() {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  await page.setContent('<div id="m" style="width:800px;height:600px"></div>');
  await page.addStyleTag({ url: 'https://cdn.jsdelivr.net/npm/maplibre-gl@5.6.0/dist/maplibre-gl.css' });
  await page.addScriptTag({ url: 'https://cdn.jsdelivr.net/npm/maplibre-gl@5.6.0/dist/maplibre-gl.js' });
  await page.evaluate(async () => {
    window.map = new maplibregl.Map({ container: 'm', style: 'https://tiles.openfreemap.org/styles/positron', center: [12.5, 41.9], zoom: 17, fadeDuration: 0, attributionControl: false });
    await new Promise((r) => map.once('load', r));
  });
  await page.addScriptTag({ content: PAGE });
  for (;;) {
    const j = jobs[next++];
    if (!j) break;
    const r = await page.evaluate(([lng, lat, max]) => window.measure(lng, lat, max), [j.lng, j.lat, MAX_FOOTPRINT_M2]);
    const flag = [];
    if (!r.ready) flag.push('NO_TILES');
    else if (r.shapes === 0) flag.push('NOT_FOUND');
    else {
      if (r.area > 20000) flag.push('LARGE');
      if (r.area < 30) flag.push('SMALL');
      if (r.shapes > 1) flag.push('MULTI');
    }
    out.push({ ...j, flag: flag.join('+'), shapes: r.shapes, area: r.area });
    if (out.length % 25 === 0) console.log(`${out.length}/${jobs.length}`);
  }
  await page.close();
}
await Promise.all(Array.from({ length: WORKERS }, worker));
await browser.close();

const q = (v) => (/[",\r\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const bad = out.filter((r) => r.flag).sort((a, b) => a.id.localeCompare(b.id));
const csv = ['id,name,point,lat,lng,flag,shapes,area_m2', ...bad.map((r) => [r.id, r.name, `${r.i + 1}/${r.n}`, r.lat, r.lng, r.flag, r.shapes, r.area].map(q).join(','))].join('\r\n');
writeFileSync(resolve(ROOT, 'figure-ground-audit.csv'), '﻿' + csv + '\r\n');
const count = (f) => bad.filter((r) => r.flag.includes(f)).length;
console.log(`points ${out.length} | flagged ${bad.length} (NOT_FOUND ${count('NOT_FOUND')}, LARGE ${count('LARGE')}, SMALL ${count('SMALL')}, MULTI ${count('MULTI')}, NO_TILES ${count('NO_TILES')}) -> figure-ground-audit.csv`);

// Smoke test for the static single-page build, using a fake window.maplibregl (it only records calls) to verify
// (1) the loading flow and fallback in index.html, (2) the calls MapView makes to MapLibre (layers, events, view), (3) the UI flow after a click.
// This is not real MapLibre: tiles, fonts and the actual API behaviour still need checking in a real browser.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const outDir = resolve(root, '.e2e/site');
mkdirSync(outDir, { recursive: true });
execFileSync('node', [resolve(root, 'scripts/build-standalone.mjs')], { env: { ...process.env, SITE_OUT: '.e2e/site' }, stdio: 'inherit' });

const data = JSON.parse(readFileSync(resolve(root, 'src/data/places.json'), 'utf8'));
const totalPts = data.places.reduce((n, p) => n + p.points.length, 0);
const idOf = (name) => data.places.find((p) => p.name === name).id;
const url = 'file://' + resolve(outDir, 'index.html');

const FAKE = `(function(){
  var calls = { sources:{}, layers:[], filters:[], fit:[], fly:[], setData:[], controls:0, removed:false, hits:[] };
  window.__fake = calls;
  function Map(opts){ this.opts=opts; this.h={}; this.zoom=4; var self=this; calls.map=this; setTimeout(function(){ self.fire('load'); },0); }
  Map.prototype.on=function(ev,a,b){ var layer=typeof a==='string'?a:null, fn=layer?b:a; (this.h[ev]=this.h[ev]||[]).push({layer:layer,fn:fn}); return this; };
  Map.prototype.fire=function(ev,e){ (this.h[ev]||[]).forEach(function(x){ if(!x.layer) x.fn(e||{}); }); };
  Map.prototype.fireLayer=function(ev,layer,e){ (this.h[ev]||[]).forEach(function(x){ if(x.layer===layer) x.fn(e); }); };
  Map.prototype.addControl=function(){ calls.controls++; };
  Map.prototype.addSource=function(id,s){ calls.sources[id]=s; this._src=this._src||{}; this._src[id]={ setData:function(d){ calls.setData.push([id,d.features.length]); }, getClusterLeaves:function(){ return Promise.resolve(calls.leaves); } }; };
  Map.prototype.getSource=function(id){ return this._src&&this._src[id]; };
  Map.prototype.addLayer=function(l){ calls.layers.push(l); };
  Map.prototype.getLayer=function(id){ return calls.layers.find(function(l){ return l.id===id; }); };
  Map.prototype.setLayerZoomRange=function(id,a,b){ calls.ranges=calls.ranges||[]; calls.ranges.push([id,a,b]); };
  Map.prototype.cameraForBounds=function(b){ var w=Math.abs(b[1][0]-b[0][0]), h=Math.abs(b[1][1]-b[0][1]); var z=Math.max(0,Math.min(16,Math.log2(360/Math.max(w,h,0.0001)))); return { center:[(b[0][0]+b[1][0])/2,(b[0][1]+b[1][1])/2], zoom:z }; };
  Map.prototype.setFilter=function(id,f){ calls.filters.push([id,f]); };
  Map.prototype.fitBounds=function(b){ calls.fit.push(b); };
  Map.prototype.flyTo=function(o){ calls.fly.push(o); };
  Map.prototype.easeTo=function(o){ calls.ease=o; };
  Map.prototype.getZoom=function(){ return this.zoom; };
  Map.prototype.getCanvas=function(){ return { style:{} }; };
  Map.prototype.queryRenderedFeatures=function(){ return calls.hits; };
  Map.prototype.resize=function(){};
  Map.prototype.remove=function(){ calls.removed=true; };
  window.maplibregl={ Map:Map, NavigationControl:function(){} };
})();`;

const browser = await chromium.launch();
let step = 0;
const ok = (m) => console.log(`✓ ${++step}. ${m}`);
const problems = [];

async function open({ pinned = true, fallback = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  const requested = [];
  await page.route('https://cdn.jsdelivr.net/**', (route) => {
    const u = route.request().url();
    requested.push(u);
    const isPinned = u.includes('@5.6.0');
    const serve = isPinned ? pinned : fallback;
    if (!serve) return route.fulfill({ status: 404, body: 'nf' });
    if (u.endsWith('.css')) return route.fulfill({ contentType: 'text/css', body: '' });
    return route.fulfill({ contentType: 'application/javascript', body: FAKE });
  });
  await page.goto(url);
  return { page, requested };
}

// (1) Normal load
{
  const { page, requested } = await open();
  await page.waitForSelector('.app');
  assert.ok(requested.some((u) => u.includes('maplibre-gl@5.6.0/dist/maplibre-gl.js')));
  assert.ok(requested.some((u) => u.includes('maplibre-gl@5.6.0/dist/maplibre-gl.css')));
  assert.ok(!requested.some((u) => u.includes('@5/')), 'The fallback must not be used in the normal case');
  ok('App starts after the pinned MapLibre version loads and the page renders');

  await page.waitForFunction(() => window.__fake && window.__fake.layers.length === 5);
  const f = await page.evaluate(() => ({
    plain: window.__fake.sources.places && { cluster: window.__fake.sources.places.cluster },
    clustered: window.__fake.sources['places-c'],
    layers: window.__fake.layers.map((l) => l.id),
    layerById: Object.fromEntries(window.__fake.layers.map((l) => [l.id, l])),
    pointsPaint: window.__fake.layers.find((l) => l.id === 'points').paint,
    controls: window.__fake.controls,
  }));
  assert.deepEqual(f.layers, ['cluster-single', 'clusters', 'cluster-count', 'points', 'selected']);
  assert.ok(!f.plain.cluster, 'The marker source stays unclustered');
  assert.equal(f.clustered.cluster, true);
  // Clusters only up to the Full map zoom, single markers from there up
  const top = f.layerById.clusters.maxzoom;
  assert.ok(top > 0 && top < 6, String(top));
  for (const id of ['cluster-single', 'clusters', 'cluster-count']) assert.equal(f.layerById[id].maxzoom, top, id);
  assert.equal(f.layerById.points.minzoom, top);
  assert.deepEqual(f.layerById['cluster-count'].layout['text-field'], ['get', 'point_count_abbreviated']);
  assert.deepEqual(f.pointsPaint['circle-opacity'], ['case', ['get', 'est'], 0.5, 1]);
  assert.equal(f.controls, 1);
  ok('Plain and clustered sources, cluster / count / single / points / selected layers with the zoom split at the Full map zoom; navigation control');

  await page.waitForFunction((n) => window.__fake.setData.some((x) => x[1] === n), totalPts);
  assert.equal((await page.textContent('[data-testid=count]')).includes(`${totalPts} map markers`), true);
  const fit = await page.evaluate(() => window.__fake.fit[0]);
  assert.deepEqual(fit, [[-8, 36], [29.5, 55]]);
  ok(`Data sent to the map (${totalPts} points); initial view is the European extent`);

  // (2) Click a single marker
  const colosseum = idOf('Colosseum');
  await page.evaluate((id) => { window.__fake.hits = [{ properties: { pid: id } }]; window.__fake.map.fireLayer('click', 'points', { point: { x: 100, y: 100 } }); }, colosseum);
  await page.waitForSelector('[data-testid=detail]');
  assert.equal((await page.textContent('[data-testid=detail] h2')).trim(), 'Colosseum');
  const sel = await page.evaluate(() => window.__fake.filters.at(-1));
  assert.deepEqual(sel, ['selected', ['==', ['get', 'pid'], colosseum]]);
  assert.ok((await page.evaluate(() => window.__fake.fly.length)) >= 1);
  ok('Marker click -> detail panel, selection-ring filter, flyTo');

  // Several entries at one spot -> chooser
  await page.keyboard.press('Escape');
  await page.evaluate((ids) => { window.__fake.hits = ids.map((pid) => ({ properties: { pid } })); window.__fake.map.fireLayer('click', 'points', { point: { x: 1, y: 1 } }); }, ['st-peters-dome-vatican', 'st-peters-facade-nave-vatican']);
  await page.waitForSelector('[data-testid=chooser]');
  ok('Several entries at one location -> chooser');

  // Cluster click 1: leaves spread over a small area -> zoom to fit them, deeper than the clustered range; no chooser
  await page.keyboard.press('Escape');
  const clusterTop = await page.evaluate(() => window.__fake.layers.find((l) => l.id === 'clusters').maxzoom);
  await page.evaluate(() => {
    const leaf = (pid, c) => ({ geometry: { coordinates: c }, properties: { pid } });
    window.__fake.leaves = [leaf('a', [12.45, 41.9]), leaf('b', [12.5, 41.88]), leaf('c', [12.47, 41.95])];
    window.__fake.hits = [{ properties: { cluster_id: 7 } }];
    window.__fake.ease = null;
    window.__fake.map.fireLayer('click', 'clusters', { point: { x: 5, y: 5 } });
  });
  await page.waitForFunction(() => window.__fake.ease);
  const e1 = await page.evaluate(() => window.__fake.ease);
  assert.ok(e1.zoom > clusterTop + 0.4, `${e1.zoom} vs ${clusterTop}`);
  assert.ok(Math.abs(e1.center[0] - 12.475) < 1e-6 && Math.abs(e1.center[1] - 41.915) < 1e-6, JSON.stringify(e1.center));
  assert.equal(await page.locator('[data-testid=chooser]').count(), 0);
  ok('Cluster click -> zooms to the bounds of all its markers, deeper than the clustered range');

  // Cluster click 2: identical coordinates -> deepest zoom and the chooser list
  await page.evaluate(() => {
    const leaf = (pid) => ({ geometry: { coordinates: [12.4533, 41.9022] }, properties: { pid } });
    window.__fake.leaves = [leaf('st-peters-dome-vatican'), leaf('st-peters-facade-nave-vatican')];
    window.__fake.ease = null;
    window.__fake.map.fireLayer('click', 'clusters', { point: { x: 5, y: 5 } });
  });
  await page.waitForFunction(() => window.__fake.ease);
  assert.equal((await page.evaluate(() => window.__fake.ease)).zoom, 18);
  await page.waitForSelector('[data-testid=chooser]');
  ok('Cluster of identical coordinates -> deepest zoom and the chooser list');
  await page.keyboard.press('Escape');

  // Data and view update after filtering
  await page.click('.tag-toggle:has-text("Styles")');
  await page.click('.tag-item:has-text("Modern")');
  await page.waitForFunction(() => window.__fake.setData.length >= 4);
  const lastCount = await page.evaluate(() => window.__fake.setData.at(-1)[1]);
  assert.ok(lastCount < totalPts && lastCount > 0, String(lastCount));
  ok(`Era filter -> setData updated (${lastCount} points)`);
  await page.close();
}

// (3) Fallback: pinned version fails -> @5
{
  const { page, requested } = await open({ pinned: false, fallback: true });
  await page.waitForSelector('.app');
  assert.ok(requested.some((u) => u.includes('maplibre-gl@5/dist/maplibre-gl.js')));
  ok('Pinned version fails to load -> falls back to @5 and starts');
  await page.close();
}

// (4) Both fail -> show the reason
{
  const { page } = await open({ pinned: false, fallback: false });
  await page.waitForSelector('#root .boot:has-text("Could not load MapLibre")');
  assert.equal(await page.locator('.app').count(), 0);
  ok('Both sources fail -> shows "Could not load MapLibre" instead of a blank screen');
  await page.close();
}

await browser.close();
assert.deepEqual(problems, [], problems.join('\n'));
console.log(`\nAll passed (${step} checks).`);

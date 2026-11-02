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
const idsCount = data.places.filter((p) => p.points.length).length;
const span = (p) => { const x = p.points.map((q) => q.lng), y = p.points.map((q) => q.lat); return Math.max(Math.max(...x) - Math.min(...x), Math.max(...y) - Math.min(...y)); };
const wideCount = data.places.filter((p) => p.points.length && span(p) > 0.25).length;
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
  Map.prototype.addSource=function(id,s){ calls.sources[id]={cluster:s.cluster,data:s.data,radius:s.clusterRadius,props:s.clusterProperties}; this._src=this._src||{}; this._src[id]={ setData:function(d){ calls.setData.push([id,d.features.length]); if(id==='footprint') calls.footprint=d; }, getClusterExpansionZoom:function(){ return Promise.resolve(calls.expansion); }, getClusterLeaves:function(){ return Promise.resolve(calls.leaves||[]); } }; };
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
  Map.prototype.getStyle=function(){ return { layers: [{ id: 'building', 'source-layer': 'building' }, { id: 'water', 'source-layer': 'water' }] }; };
  Map.prototype.project=function(c){ return window.__proj ? window.__proj(c) : { x: c[0], y: c[1] }; };
  Map.prototype.getContainer=function(){ return { clientWidth: 1000, clientHeight: 600, getBoundingClientRect: function(){ return { left: 0, top: 0, width: 1000, height: 600 }; } }; };
  Map.prototype.getCenter=function(){ return this.center||{lng:12.5,lat:43.5}; };
  Map.prototype.querySourceFeatures=function(){ return calls.srcFeatures||[]; };
  window.__fakeLeaves=[];
  Map.prototype.getContainer=function(){ return { clientWidth: 1000, clientHeight: 800, getBoundingClientRect: function(){ return { left: 0, top: 0, width: 1000, height: 800 }; } }; };
  Map.prototype.getCanvas=function(){ return { style:{} }; };
  Map.prototype.queryRenderedFeatures=function(){ return calls.hits; };
  Map.prototype.resize=function(){};
  Map.prototype.remove=function(){ calls.removed=true; };
  window.maplibregl={ Map:Map, NavigationControl:function(){}, ScaleControl:function(o){ calls.scale=o; } };
  Map.prototype.addControl=function(c,pos){ calls.controls++; (calls.controlPos=calls.controlPos||[]).push(pos); };
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

  await page.waitForFunction(() => window.__fake && window.__fake.layers.length === 8);
  const f = await page.evaluate(() => ({
    
    cityData: window.__fake.sources.cities.data.features.map((x) => x.properties),
    cs: { a: window.__fake.sources.cities },
    layers: window.__fake.layers.map((l) => l.id),
    layerById: Object.fromEntries(window.__fake.layers.map((l) => [l.id, l])),
    pointsPaint: window.__fake.layers.find((l) => l.id === 'points').paint,
    controls: window.__fake.controls,
  }));
  assert.deepEqual(f.layers, ['points', 'points-few', 'cities', 'city-count', 'regions', 'points-far', 'region-count', 'selected']);
  // Phone Full map: one circle per region (Italy north / centre / south, France, the United Kingdom ...), not merged by distance
  const reg = await page.evaluate(() => ({ src: window.__fake.sources.regions, layers: window.__fake.layers.filter((l) => l.id === 'regions' || l.id === 'region-count' || l.id === 'cities').map((l) => [l.id, l.minzoom ?? null, l.maxzoom ?? null]) }));
  assert.ok(!reg.src.cluster, 'Regions are fixed groups, not distance clusters');
  const names = reg.src.data.features.map((x) => x.properties.region);
  for (const n of ['Italy North', 'Italy Centre', 'Italy South', 'France', 'United Kingdom']) assert.ok(names.includes(n), n);
  assert.deepEqual(reg.layers.find((l) => l[0] === 'regions').slice(1), [null, 3]);
  assert.deepEqual(reg.layers.find((l) => l[0] === 'cities').slice(1), [3, 10.5]);
  ok('Below zoom 3 each region (Italy N/C/S, France, UK ...) has its own number; cities take over from zoom 3');
  // A region number below 20 goes straight to the middle of its most crowded group
  const south = data.places.filter((p) => p.country === 'Italy' && p.points[0].lat < 41.5);
  await page.evaluate((ps) => { window.__fake.ease = null; window.__fake.hits = [{ properties: { region: 'Italy South', n: ps.length, w: 12, s: 37, e: 15, nn: 41, pids: JSON.stringify(ps.map((p) => p.id)) } }]; window.__fake.map.fireLayer('click', 'regions', { point: { x: 5, y: 5 } }); }, south);
  await page.waitForFunction(() => window.__fake.ease);
  const re = await page.evaluate(() => window.__fake.ease);
  assert.ok(re.zoom > 12, 'A region with fewer than 20 buildings goes to the 1 km view: ' + re.zoom);
  assert.ok(south.some((p) => Math.abs(p.points[0].lat - re.center[1]) < 0.01), 'Centred on its most crowded group');
  ok('Region number below 20 -> straight to the middle of its most crowded group');
  // Nearby cities merge so circles never overlap: clustered city sources summing the counts and uniting the bounds
  for (const cs of [f.cs.a]) {
    assert.equal(cs.cluster, true);
    assert.equal(cs.radius, 34);
    assert.deepEqual(cs.props.n, ['+', ['get', 'n']]);
    assert.deepEqual(Object.keys(cs.props).sort(), ['e', 'n', 'nn', 's', 'w', 'xe', 'xn', 'xs', 'xw']);
  }
  // One circle per city, number = buildings
  const rome = f.cityData.find((c) => c.city === 'Rome');
  assert.ok(rome && rome.n > 20, JSON.stringify(rome));
  assert.ok(f.cityData.find((c) => c.city === 'Vatican City' || /Vatican/.test(c.city)), 'Vatican is its own city');
  assert.ok(f.cityData.some((c) => c.n === 1), 'Single-building cities show 1');
  // Region places (Veneto villas) have no circle: counted buildings = located buildings minus the region places
  assert.ok(!f.cityData.some((c) => c.city === 'Veneto'), 'No Veneto circle');
  assert.equal(f.cityData.reduce((a, c) => a + c.n, 0), idsCount - wideCount, 'Every other building belongs to one city');
  // Circles below the switch zoom, single markers from there up; region markers at every zoom
  const L = f.layerById;
  for (const id of ['cities', 'city-count']) assert.equal(L[id].maxzoom, 10.5, id);
  assert.equal(L.points.minzoom, 10.5);
  assert.deepEqual(L.cities.filter, ['>=', ['get', 'n'], 5], 'Circles only from 5 buildings');
  assert.deepEqual(L['city-count'].filter, ['>=', ['get', 'n'], 5]);
  assert.equal(L['points-few'].maxzoom, 10.5);
  assert.deepEqual(L['city-count'].layout['text-field'], ['to-string', ['get', 'n']]);
  assert.deepEqual(f.pointsPaint['circle-opacity'], ['case', ['get', 'est'], 0.5, 1]);
  assert.equal(f.controls, 2, 'Navigation + scale bar');
  ok('Marker and city sources; city circle / count / points layers with the switch zoom (wide cities earlier); navigation control');

  await page.waitForFunction((n) => window.__fake.setData.some((x) => x[0] === 'places' && x[1] === n), totalPts);
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
  const fly = await page.evaluate(() => window.__fake.fly.at(-1));
  assert.ok(fly.zoom >= 10.6 && fly.zoom <= 15.65, `City view first, deeper only when buildings overlap (never past 500 m): ${fly.zoom}`);
  ok('Marker click -> detail panel, selection-ring filter, flyTo');

  // Several entries at one spot: one of them is shown directly (no chooser)
  await page.keyboard.press('Escape');
  await page.evaluate((ids) => { window.__fake.hits = ids.map((pid) => ({ properties: { pid } })); window.__fake.map.fireLayer('click', 'points', { point: { x: 1, y: 1 } }); }, ['st-peters-dome-vatican', 'st-peters-facade-nave-vatican']);
  await page.waitForSelector('[data-testid=detail]');
  assert.equal((await page.textContent('[data-testid=detail] h2')).trim(), data.places.find((p) => p.id === 'st-peters-dome-vatican').name);
  assert.equal(await page.locator('[data-testid=chooser]').count(), 0);
  ok('Several entries at one location -> the first is shown, no chooser');
  await page.keyboard.press('Escape');

  // Closing the building panel zooms the map out a little (0.7 level)
  await page.evaluate(() => { window.__fake.map.zoom = 12; window.__fake.hits = [{ properties: { pid: 'st-peters-dome-vatican' } }]; window.__fake.map.fireLayer('click', 'points', { point: { x: 1, y: 1 } }); });
  await page.waitForSelector('[data-testid=detail]');
  await page.evaluate(() => { window.__fake.ease = null; });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__fake.ease);
  const ez = await page.evaluate(() => window.__fake.ease);
  assert.ok(Math.abs(ez.zoom - 11.3) < 0.001, 'Zoom after closing: ' + ez.zoom);
  ok('Closing the building panel -> the map zooms out 0.7 level');

  // Overlapping dots at different places: the one nearest to the click is shown (no zoom to a range, no chooser)
  await page.evaluate(([far, near]) => {
    const h = (pid, c) => ({ properties: { pid }, geometry: { coordinates: c } });
    window.__fake.hits = [h(far, [50, 50]), h(near, [2, 2])];
    window.__fake.map.fireLayer('click', 'points-few', { point: { x: 1, y: 1 } });
  }, [idOf('Trevi Fountain'), colosseum]);
  await page.waitForSelector('[data-testid=detail]');
  assert.equal((await page.textContent('[data-testid=detail] h2')).trim(), 'Colosseum');
  assert.equal(await page.locator('[data-testid=chooser]').count(), 0);
  ok('Click on overlapping coloured dots -> the nearest one is shown (no chooser)');
  await page.keyboard.press('Escape');

  // Circles under 5 buildings become coloured dots: the idle handler lists their pids in the points-few filter
  await page.evaluate(() => {
    window.__fake.srcFeatures = [{ properties: { n: 2, pids: JSON.stringify(['colosseum']), vpids: '[]' } }, { properties: { cluster: true, cluster_id: 3, n: 4 } }];
    window.__fake.leaves = [{ properties: { pids: JSON.stringify(['x1']), vpids: JSON.stringify(['villa1']) } }];
    window.__fake.filters.length = 0;
    window.__fake.map.fire('idle');
  });
  await page.waitForFunction(() => window.__fake.filters.some((f) => f[0] === 'points-few'));
  const ff = await page.evaluate(() => window.__fake.filters.find((f) => f[0] === 'points-few')[1]);
  assert.deepEqual(ff, ['in', ['get', 'pid'], ['literal', ['colosseum', 'villa1', 'x1']]]);
  ok('Circles with fewer than 5 buildings -> their buildings (and attached villa markers) are drawn as dots');

  // Back button: zooms to the size of the country of the open building (else the building nearest the view centre) and closes the panel
  await page.evaluate(() => {
    window.__fake.hits = [{ properties: { pid: 'st-peters-dome-vatican' } }];
    window.__fake.map.fireLayer('click', 'points', { point: { x: 1, y: 1 } }); // opens the panel
  });
  await page.waitForSelector('[data-testid=detail]');
  await page.evaluate(() => { window.__fake.ease = null; });
  assert.equal(await page.locator('[data-testid=map-back]').isDisabled(), false, 'Back is always available');
  await page.click('[data-testid=map-back]');
  const eb = { ease: await page.evaluate(() => window.__fake.ease) };
  const it = data.places.filter((p) => p.country === 'Italy').flatMap((p) => p.points);
  const w = Math.max(...it.map((t) => t.lng)) - Math.min(...it.map((t) => t.lng)), h = Math.max(...it.map((t) => t.lat)) - Math.min(...it.map((t) => t.lat));
  assert.ok(eb.ease && Math.abs(eb.ease.zoom - Math.log2(360 / Math.max(w, h))) < 0.01, 'Back shows all of Italy: ' + (eb.ease && eb.ease.zoom));
  await page.waitForFunction(() => !document.querySelector('[data-testid=detail]'));
  ok('Back -> country view of the open building, panel closes');
  // A building tagged Others: about 1000 km across around it
  await page.evaluate(() => {
    window.__fake.hits = [{ properties: { pid: 'hagia-sophia-istanbul' } }];
    window.__fake.map.fireLayer('click', 'points', { point: { x: 1, y: 1 } });
    window.__fake.ease = null;
  });
  await page.waitForSelector('[data-testid=detail]');
  await page.click('[data-testid=map-back]');
  const eo = await page.evaluate(() => window.__fake.ease);
  assert.ok(eo && Math.abs(eo.center[0] - 28.98) < 0.01 && Math.abs(eo.center[1] - 41.00833) < 0.01, 'Others: centred on the building: ' + JSON.stringify(eo));
  ok('Back for an "Others" building -> about 1000 km around it');
  await page.evaluate(() => { window.__fake.fly.length = 0; });
  await page.click('.fullmap');
  await page.waitForFunction(() => window.__fake.fly.length > 0);
  const flyClosed = await page.evaluate(() => window.__fake.fly.at(-1).zoom ?? null);
  await page.evaluate(() => { window.__fake.hits = [{ properties: { pid: 'st-peters-dome-vatican' } }]; window.__fake.map.fireLayer('click', 'points', { point: { x: 1, y: 1 } }); window.__fake.fly.length = 0; });
  await page.waitForSelector('[data-testid=detail]');
  await page.click('.fullmap');
  await page.waitForFunction(() => window.__fake.fly.length > 0 || window.__fake.ease);
  const flyOpen = await page.evaluate(() => window.__fake.fly.at(-1)?.zoom ?? null);
  if (flyClosed != null && flyOpen != null) assert.ok(Math.abs(flyClosed - flyOpen - 0.7) < 0.001, 'Full map with the panel open ends 0.7 farther out: ' + flyClosed + ' / ' + flyOpen);
  ok('Full map closes the panel and ends 0.7 level farther out');

  assert.ok(await page.evaluate(() => window.__fake.scale && window.__fake.scale.unit === 'metric'));
  ok('Scale bar (metric) added');
  await page.evaluate(() => { window.__fake.map.zoom = 4; });

  // City click 1: a number goes to the middle of the most crowded group of that city's buildings, scale bar 1 km; no chooser
  await page.keyboard.press('Escape');
  const romePids = data.places.filter((p) => p.points.some((pt) => pt.lng > 12.4 && pt.lng < 12.6 && pt.lat > 41.8 && pt.lat < 42)).map((p) => p.id);
  assert.ok(romePids.length > 10, 'Rome buildings found in the data: ' + romePids.length);
  const city = (o) => ({ properties: { city: 'X', n: 3, w: 12.45, s: 41.88, e: 12.5, nn: 41.95, pids: JSON.stringify(romePids), ...o } });
  await page.evaluate((h) => {
    window.__fake.hits = [h];
    window.__fake.ease = null;
    window.__fake.map.fireLayer('click', 'cities', { point: { x: 5, y: 5 } });
  }, city());
  await page.waitForFunction(() => window.__fake.ease);
  const e1 = await page.evaluate(() => window.__fake.ease);
  const mpp = (z, lat) => (78271.517 * Math.cos((lat * Math.PI) / 180)) / 2 ** z;
  assert.ok(Math.abs(mpp(e1.zoom, e1.center[1]) - 9.8) < 0.01, 'Scale 1 km on the scale bar: ' + mpp(e1.zoom, e1.center[1]));
  assert.ok(e1.zoom > 10.5, 'Past the switch zoom: ' + e1.zoom);
  assert.ok(e1.center[0] > 12.4 && e1.center[0] < 12.6 && e1.center[1] > 41.8 && e1.center[1] < 42, JSON.stringify(e1.center));
  assert.equal(await page.locator('[data-testid=chooser]').count(), 0);
  ok('City number click -> centre of the most crowded group of its buildings, scale 1 km');

  // Zoomed in: cities outside the view get an edge marker with their count; a click moves the map to the nearest building of that city
  await page.evaluate(() => {
    window.__proj = () => ({ x: 3000, y: 300 });
    window.__fake.map.zoom = 12;
    window.__fake.ease = null;
    window.__fake.map.fire('move');
  });
  await page.waitForSelector('[data-testid=edge-dot]');
  assert.equal(await page.locator('[data-testid=edge-dot]').count(), 1);
  // A merged direction (e.g. 18 = 16 + 2): the click goes to the city with the most buildings even when another is nearer
  await page.evaluate(() => {
    window.__fake.map.center = { lng: 12.0, lat: 42.7 }; // Rome about 94 km away, Florence about 135 km
    window.__proj = (c) => (c[1] < 42.5 ? { x: 3000, y: 300 } : c[1] < 44.5 && c[0] < 12 ? { x: 1500, y: 310 } : { x: 500, y: 300 }); // Rome far, Florence nearer on screen, the rest inside the view
    window.__fake.map.zoom = 12;
    window.__fake.ease = null;
    window.__fake.map.fire('move');
  });
  await page.waitForSelector('[data-testid=edge-dot]');
  await page.locator('[data-testid=edge-dot]').first().click();
  await page.waitForFunction(() => window.__fake.ease);
  const mc = await page.evaluate(() => window.__fake.ease.center);
  assert.ok(mc[1] < 42.5, 'The merged direction goes to the city with the most buildings (Rome), not the nearer one: ' + JSON.stringify(mc));
  ok('Merged direction button -> the city with the most buildings, even if another is nearer');
  // A direction button that shows 1 opens that building's panel directly
  await page.evaluate(() => {
    window.__fake.map.center = { lng: 12.5, lat: 41.9 };
    window.__proj = (c) => (c[1] < 38 ? { x: 3000, y: 300 } : { x: 500, y: 300 }); // only Agrigento (one building) is outside the view
    window.__fake.map.zoom = 12;
    window.__fake.map.fire('move');
  });
  await page.waitForFunction(() => document.querySelector('[data-testid=edge-dot]')?.textContent.trim() === '1');
  await page.locator('[data-testid=edge-dot]').first().click();
  await page.waitForSelector('[data-testid=detail]');
  assert.equal((await page.textContent('[data-testid=detail] h2')).trim(), 'Valle dei Templi');
  ok('Direction button showing 1 -> the building panel opens directly');
  await page.keyboard.press('Escape');
  await page.evaluate(() => { window.__proj = () => ({ x: 3000, y: 300 }); window.__fake.map.center = { lng: 12.5, lat: 43.5 }; window.__fake.map.fire('move'); });

  // Zooming far in does not remove the markers (the range is real distance, not pixels)
  await page.evaluate(() => { window.__fake.map.zoom = 19; window.__fake.map.fire('move'); });
  await page.waitForTimeout(150);
  assert.equal(await page.locator('[data-testid=edge-dot]').count(), 1, 'Markers stay at zoom 19');
  await page.check('[data-testid=hide-edges]');
  assert.equal(await page.locator('[data-testid=edge-dot]').count(), 0, 'Checkbox hides the direction buttons');
  await page.uncheck('[data-testid=hide-edges]');
  await page.waitForSelector('[data-testid=edge-dot]');
  // With a building open far from the target (Berlin vs. the view at 12.5E 43.5N), the edge button closes the panel
  await page.evaluate((id) => { window.__fake.hits = [{ properties: { pid: id } }]; window.__fake.map.fireLayer('click', 'points', { point: { x: 1, y: 1 } }); }, idOf('Reichstag (Glass Dome)'));
  await page.waitForSelector('[data-testid=detail]');
  await page.evaluate(() => { window.__fake.map.zoom = 12; window.__fake.map.fire('move'); });
  await page.waitForSelector('[data-testid=edge-dot]');
  await page.evaluate(() => { window.__fake.ease = null; });
  await page.locator('[data-testid=edge-dot]').first().click();
  await page.waitForFunction(() => window.__fake.ease);
  assert.equal(await page.locator('[data-testid=detail]').count(), 0, 'Edge button moved away from the selected building: panel closed');
  assert.equal(await page.evaluate(() => window.__fake.ease.zoom), 12, 'The zoom stays (no extra zoom-out)');
  ok('Edge button that leaves the selected building closes its panel');
  await page.waitForSelector('[data-testid=edge-dot]');
  await page.locator('[data-testid=edge-dot]').click();
  await page.waitForFunction(() => window.__fake.ease);
  assert.equal(await page.evaluate(() => window.__fake.ease.zoom), 12, 'The zoom stays');
  ok('Edge marker for a city outside the view -> click moves there, zoom unchanged');
  await page.evaluate(() => { window.__proj = null; window.__fake.map.zoom = 4; window.__fake.map.fire('move'); });
  await page.waitForFunction(() => document.querySelectorAll('[data-testid=edge-dot]').length === 0);

  // City click: merged circle (several close cities) -> the same, over the buildings of all its cities
  await page.evaluate((o) => {
    window.__fake.leaves = [{ properties: { pids: JSON.stringify(o.ids), vpids: '[]' } }];
    window.__fake.hits = [o.h];
    window.__fake.ease = null;
    window.__fake.map.fireLayer('click', 'cities', { point: { x: 5, y: 5 } });
  }, { ids: romePids, h: city({ cluster: true, cluster_id: 4, point_count: 4, n: 29, w: 7.6, s: 45.15, e: 10.8, nn: 47.6, xw: 7.6, xs: 45.15, xe: 10.8, xn: 47.6 }) });
  await page.waitForFunction(() => window.__fake.ease);
  const e3 = await page.evaluate(() => window.__fake.ease);
  assert.ok(Math.abs(mpp(e3.zoom, e3.center[1]) - 9.8) < 0.01, 'Scale 1 km: ' + mpp(e3.zoom, e3.center[1]));
  assert.ok(e3.center[0] > 12.4 && e3.center[0] < 12.6 && e3.center[1] > 41.8 && e3.center[1] < 42, JSON.stringify(e3.center));
  ok('Merged circle number click -> centre of the most crowded group among all its buildings, scale 1 km');

  // A number click that moves the view away from the selected building closes its panel; one that keeps it in view does not
  const reichstag = idOf('Reichstag (Glass Dome)');
  await page.evaluate((id) => { window.__fake.map.zoom = 4; window.__fake.hits = [{ properties: { pid: id } }]; window.__fake.map.fireLayer('click', 'points', { point: { x: 1, y: 1 } }); }, colosseum);
  await page.waitForSelector('[data-testid=detail]');
  await page.evaluate((ids) => { window.__fake.hits = [{ properties: { city: 'X', n: 1, w: 12.4922, s: 41.8903, e: 12.4922, nn: 41.8903, pids: JSON.stringify(ids) } }]; window.__fake.map.fireLayer('click', 'cities', { point: { x: 5, y: 5 } }); }, [colosseum]);
  await page.waitForTimeout(200);
  assert.equal(await page.locator('[data-testid=detail]').count(), 1, 'The selected building stays in view: the panel stays open');
  await page.evaluate((ids) => { window.__fake.map.zoom = 4; window.__fake.hits = [{ properties: { city: 'X', n: 1, w: 13.3762, s: 52.5186, e: 13.3762, nn: 52.5186, pids: JSON.stringify(ids) } }]; window.__fake.map.fireLayer('click', 'cities', { point: { x: 5, y: 5 } }); }, [reichstag]);
  await page.waitForFunction(() => !document.querySelector('[data-testid=detail]'));
  ok('Number click: panel stays open while the selected building is in view, closes when the view leaves it');

  // City click 3: identical coordinates, several buildings -> the first is shown (no chooser)
  await page.evaluate((h) => {
    window.__fake.hits = [h];
    window.__fake.ease = null;
    window.__fake.map.fireLayer('click', 'cities', { point: { x: 5, y: 5 } });
  }, city({ n: 2, w: 12.4533, s: 41.9022, e: 12.4533, nn: 41.9022, pids: JSON.stringify(['st-peters-dome-vatican', 'st-peters-facade-nave-vatican']) }));
  await page.waitForSelector('[data-testid=detail]');
  assert.equal(await page.locator('[data-testid=chooser]').count(), 0);
  ok('City number with identical coordinates -> the first building is shown (no chooser)');
  await page.keyboard.press('Escape');

  // City click 4: single building, degenerate bounds -> zoom in, no chooser
  await page.evaluate((h) => {
    window.__fake.hits = [h];
    window.__fake.ease = null;
    window.__fake.map.fireLayer('click', 'cities', { point: { x: 5, y: 5 } });
  }, city({ n: 1, w: 8.54, s: 47.37, e: 8.54, nn: 47.37, pids: JSON.stringify(['a']) }));
  await page.waitForFunction(() => window.__fake.ease);
  assert.equal((await page.evaluate(() => window.__fake.ease)).zoom, 18);
  assert.equal(await page.locator('[data-testid=chooser]').count(), 0);
  ok('Single-building city -> zooms in without opening anything');

  // Data and view update after filtering
  await page.click('.tag-toggle:has-text("Styles")');
  await page.click('.tag-item:has-text("Modern")');
  await page.waitForFunction(() => window.__fake.setData.length >= 4);
  const lastCount = await page.evaluate(() => window.__fake.setData.filter((x) => x[0] === 'places').at(-1)[1]);
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

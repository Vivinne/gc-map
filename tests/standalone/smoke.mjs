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
  Map.prototype.getContainer=function(){ return { clientWidth: 1000, clientHeight: 600 }; };
  Map.prototype.getCenter=function(){ return this.center||{lng:12.5,lat:43.5}; };
  Map.prototype.querySourceFeatures=function(){ return calls.srcFeatures||[]; };
  window.__fakeLeaves=[];
  Map.prototype.getContainer=function(){ return { clientWidth: 1000, clientHeight: 800 }; };
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

  await page.waitForFunction(() => window.__fake && window.__fake.layers.length === 7);
  const f = await page.evaluate(() => ({
    
    cityData: window.__fake.sources.cities.data.features.map((x) => x.properties),
    cs: { a: window.__fake.sources.cities },
    layers: window.__fake.layers.map((l) => l.id),
    layerById: Object.fromEntries(window.__fake.layers.map((l) => [l.id, l])),
    pointsPaint: window.__fake.layers.find((l) => l.id === 'points').paint,
    controls: window.__fake.controls,
  }));
  assert.deepEqual(f.layers, ['footprint', 'footprint-line', 'points', 'points-few', 'cities', 'city-count', 'selected']);
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
  assert.ok(Math.abs(fly.zoom - 15.5) < 0.15, `500 m around the point: ${fly.zoom}`);
  ok('Marker click -> detail panel, selection-ring filter, flyTo');

  // Figure ground: the basemap building polygon at the selected point is sent to the footprint source
  const colo = data.places.find((p) => p.id === colosseum).points[0];
  await page.evaluate(([lng, lat]) => {
    const e = 0.0005;
    window.__fake.hits = [
      { properties: { pid: 'x' }, geometry: { type: 'Polygon', coordinates: [[[lng - e, lat - e], [lng + e, lat - e], [lng + e, lat + e], [lng - e, lat + e], [lng - e, lat - e]]] } },
      { properties: { pid: 'y' }, geometry: { type: 'Polygon', coordinates: [[[lng + 1, lat], [lng + 1.1, lat], [lng + 1.1, lat + 0.1], [lng + 1, lat]]] } },
      { properties: { pid: 'next' }, geometry: { type: 'Polygon', coordinates: [[[lng + 0.0001, lat - e], [lng + 3 * e, lat - e], [lng + 3 * e, lat - 0.0002], [lng + 0.0001, lat - 0.0002], [lng + 0.0001, lat - e]]] } }, // a neighbour beside the point
      { properties: { pid: 'ring' }, geometry: { type: 'Polygon', coordinates: [[[lng - 3 * e, lat - 3 * e], [lng + 3 * e, lat - 3 * e], [lng + 3 * e, lat + 3 * e], [lng - 3 * e, lat + 3 * e], [lng - 3 * e, lat - 3 * e]], [[lng - e / 2, lat - e / 2], [lng + e / 2, lat - e / 2], [lng + e / 2, lat + e / 2], [lng - e / 2, lat + e / 2], [lng - e / 2, lat - e / 2]]] } }, // the point is in its courtyard (hole)
      { properties: { pid: 'block' }, geometry: { type: 'Polygon', coordinates: [[[lng - 0.01, lat - 0.01], [lng + 0.01, lat - 0.01], [lng + 0.01, lat + 0.01], [lng - 0.01, lat + 0.01], [lng - 0.01, lat - 0.01]]] } }, // far larger than a building
    ];
    window.__fake.setData.length = 0;
    window.__fake.map.fire('idle');
  }, [colo.lng, colo.lat]);
  await page.waitForFunction(() => window.__fake.setData.some((x) => x[0] === 'footprint'));
  const foot = await page.evaluate(() => window.__fake.footprint);
  assert.equal(foot.features.length, 1, 'Only the building itself: not neighbours, courtyards or block-sized shapes');
  assert.match(foot.features[0].properties.color, /^#/);
  ok('Selecting a building -> its basemap footprint is filled with the style colour');

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

  // Back button: returns to the view before the last click that moved the map; wheel zooming and panning are not recorded
  await page.evaluate(() => {
    const m = window.__fake.map;
    m.zoom = 5; m.center = { lng: 10, lat: 45 };
    window.__fake.hits = [{ properties: { city: 'X', n: 6, w: 12.45, s: 41.88, e: 12.5, nn: 41.95, pids: '[]' } }];
    m.fireLayer('click', 'cities', { point: { x: 5, y: 5 } }); // the click moves the map: the view before it is remembered
    m.zoom = 9.37; m.center = { lng: 12.4, lat: 41.9 }; m.fire('moveend'); // mouse wheel / drag afterwards: not remembered
    m.zoom = 11.37; m.fire('moveend');
  });
  await page.waitForFunction(() => !document.querySelector('[data-testid=map-back]').disabled);
  const eases = [];
  for (let i = 0; i < 60 && !(await page.locator('[data-testid=map-back]').isDisabled()); i++) {
    await page.evaluate(() => { window.__fake.ease = null; });
    await page.click('[data-testid=map-back]');
    eases.push(await page.evaluate(() => window.__fake.ease));
  }
  assert.equal(await page.locator('[data-testid=detail]').count(), 0, 'Back closes the building panel');
  assert.equal(eases[0].zoom, 5);
  assert.deepEqual(eases[0].center, [10, 45]);
  assert.ok(eases.every((e) => e.zoom !== 9.37 && e.zoom !== 11.37), 'Wheel zooms are not history steps');
  assert.equal(await page.locator('[data-testid=map-back]').isDisabled(), true);
  ok('Back button returns to the view before the last map click (wheel zoom does not count)');
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
  // Zooming far in does not remove the markers (the range is real distance, not pixels)
  await page.evaluate(() => { window.__fake.map.zoom = 19; window.__fake.map.fire('move'); });
  await page.waitForTimeout(150);
  assert.equal(await page.locator('[data-testid=edge-dot]').count(), 1, 'Markers stay at zoom 19');
  await page.locator('[data-testid=edge-dot]').click();
  await page.waitForFunction(() => window.__fake.ease);
  assert.equal(await page.evaluate(() => window.__fake.ease.zoom), undefined, 'The zoom stays');
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

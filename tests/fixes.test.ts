import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILDINGS } from '../src/lib/model';
import { search } from '../src/lib/search';
import { readFileSync } from 'node:fs';

/** Browser storage for the tests (localStorage, sessionStorage) */
class Store {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v));
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}
const g = globalThis as unknown as Record<string, unknown>;
g.window = g;
g.localStorage = new Store();
g.sessionStorage = new Store();

test('N1 search: a curly apostrophe (iPhone keyboard) finds names with a straight one', () => {
  const named = BUILDINGS.filter((b) => b.name.includes("'"));
  assert.ok(named.length >= 19, `${named.length} names with an apostrophe`);
  for (const b of named) {
    const typed = b.name.replace(/'/g, '’');
    assert.equal(search(typed)[0]?.id, b.id, `"${typed}"`);
    assert.equal(search(b.name.replace(/'/g, '‘'))[0]?.id, b.id);
  }
});

test('N2 history: a reload keeps every step (no 50-step limit)', async () => {
  const { saveStack, loadStack, EMPTY_SCREEN } = await import('../src/lib/nav');
  const stack = [EMPTY_SCREEN, ...Array.from({ length: 300 }, (_, i) => ({ q: `q${i}`, list: 'results' as const, group: [], b: '' }))];
  saveStack(stack);
  assert.equal(loadStack()?.length, 301);
  assert.equal(loadStack()?.[1]?.q, 'q0');
});

test('recent texts: "Rome" and "rome" are one entry, the spelling typed last stays', async () => {
  const { addRecentText, recentTexts } = await import('../src/lib/recent');
  addRecentText('Rome');
  addRecentText('Gaudi');
  addRecentText('rome');
  assert.deepEqual(recentTexts(), ['rome', 'Gaudi']);
  addRecentText('ROME');
  assert.deepEqual(recentTexts(), ['ROME', 'Gaudi']);
});

test('S1 MapLibre: 6.5 or newer (the XSS fix of GHSA-jrc7-96c5-q579)', () => {
  const { version } = JSON.parse(readFileSync(new URL('../node_modules/maplibre-gl/package.json', import.meta.url), 'utf8')) as { version: string };
  const [major, minor] = version.split('.').map(Number) as [number, number];
  assert.ok(major > 6 || (major === 6 && minor >= 5), version);
});

test('B3 address: a map view out of range is ignored', async () => {
  const { fromQuery } = await import('../src/lib/nav');
  for (const m of ['12,95,5', '999,999,99', ',,', '12,41', '12,41,99', 'a,b,c']) assert.equal(fromQuery(`?m=${m}`).view, null, m);
  assert.deepEqual(fromQuery('?m=12.48,41.89,13').view, { lng: 12.48, lat: 41.89, zoom: 13 });
});

test('N5 scale bar: never longer than 110 px, also near the poles fully zoomed in', async () => {
  const { scaleFor } = await import('../src/lib/scale');
  for (const lat of [0, 45, 70, 80, 84, 85]) for (let z = 0; z <= 18; z += 0.5) assert.ok(scaleFor(lat, z).px <= 110, `${lat} ${z}`);
});

test('N3 recents: damaged saved data gives empty lists', async () => {
  const { recentTexts, recentBuildings } = await import('../src/lib/recent');
  for (const v of ['{}', 'null', '"x"', '[1,{}]', 'not json']) {
    localStorage.setItem('gc-atlas:recent-text', v);
    localStorage.setItem('gc-atlas:recent-building', v);
    assert.ok(Array.isArray(recentTexts()) && recentTexts().every((t) => typeof t === 'string'), v);
    assert.ok(Array.isArray(recentBuildings()), v);
  }
});

test('N4 history: a step whose building is gone is dropped on reload', async () => {
  const { loadStack } = await import('../src/lib/nav');
  sessionStorage.setItem('gc-map:history', JSON.stringify([{ q: '', list: '', group: [], b: '' }, { q: '', list: '', group: [], b: 'gone-building' }, { q: 'villa', list: 'results', group: [], b: '' }]));
  assert.deepEqual(loadStack()?.map((s) => s.b || s.q), ['', 'villa']);
});

test('D2 / S5 deploy: type check and tests before the build; outside actions pinned to a commit', () => {
  const wf = readFileSync(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8');
  assert.ok(wf.indexOf('npm run typecheck') > 0 && wf.indexOf('npm test') > wf.indexOf('npm run typecheck') && wf.indexOf('npm run build') > wf.indexOf('npm test'));
  for (const line of wf.split('\n').filter((l) => /uses:\s/.test(l))) assert.match(line, /@[0-9a-f]{40}\b/, line.trim());
});

test('C2 tokens: the style modules write no lengths or colours of their own; motion times match tokens.css', async () => {
  const { readdirSync } = await import('node:fs');
  const dir = new URL('../src/styles/modules/', import.meta.url);
  for (const f of readdirSync(dir)) {
    const css = readFileSync(new URL(f, dir), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/var\([^,()]+,\s*0px\)/g, '');
    assert.equal(css.match(/(?<![\w-])\d+(\.\d+)?px\b/g), null, `${f}: lengths`);
    assert.equal(css.match(/#[0-9a-fA-F]{3,6}\b|rgba?\(/g), null, `${f}: colours`);
  }
  const { MOTION, PAPER } = await import('../src/styles/tokens');
  const tokens = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8');
  for (const [k, css] of [['fast', '--t-fast'], ['mid', '--t-mid'], ['slow', '--t-slow'], ['leave', '--leave'], ['slide', '--t-slide']] as const) assert.match(tokens, new RegExp(`${css}: ${MOTION[k]}ms;`));
  assert.match(tokens, new RegExp(`--paper: ${PAPER};`));
});

test('R4 framing room: the free part of the map never goes below the minimum, however much the panels cover', async () => {
  const { roomFor } = await import('../src/lib/geo');
  for (const [W, H, pad] of [[882, 264, { top: 64, right: 0, bottom: 132, left: 0 }], [882, 86, { top: 64, right: 0, bottom: 43, left: 0 }], [1280, 800, { top: 64, right: 48, bottom: 0, left: 396 }], [300, 200, { top: 300, right: 300, bottom: 300, left: 300 }]] as const) {
    const { p, f } = roomFor(W, H, pad, 40, 40);
    assert.ok(H - f.top - f.bottom >= 39.99 && W - f.left - f.right >= 39.99, `${W}×${H}`);
    for (const k of ['top', 'right', 'bottom', 'left'] as const) assert.ok(p[k] >= 0 && f[k] >= p[k] && Number.isFinite(f[k]));
  }
  assert.deepEqual(roomFor(1280, 800, { top: 64, right: 48, bottom: 0, left: 396 }, 40, 40).f, { top: 104, right: 88, bottom: 40, left: 436 });
});

test('R5 typed text: an emptied search box is kept as empty over a reload', async () => {
  const { saveDraft, loadDraft } = await import('../src/lib/nav');
  saveDraft('');
  assert.equal(loadDraft(), '');
  saveDraft(null);
  assert.equal(loadDraft(), null);
});

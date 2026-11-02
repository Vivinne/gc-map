import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { blocks, scaleEnd, tickX, xOfYear, yearAt } from '../src/lib/band';
import { EMPTY, apply, tagCounts, type Filters } from '../src/lib/filter';
import { clusterAt, donutRadius, distance, regionOf, stacks, worldPx, MIN_DONUT } from '../src/lib/geo';
import { formatHash, parseHash } from '../src/lib/hash';
import { BUILDINGS, BY_ID, citiesOf, shortYear, startYear } from '../src/lib/model';
import { again, gotIt, newDeck, syncDeck, AGAIN_GAP } from '../src/lib/review';
import { search } from '../src/lib/search';

const none = new Set<string>();
const CENTURY = '\u4e16\u7d00';

test('startYear: spans, BC, AD, centuries, missing', () => {
  assert.equal(startYear('1928\u20131931'), 1928);
  assert.equal(startYear('BC 447\u2013BC 432'), -447);
  assert.equal(startYear('AD 118\u2013125'), 118);
  assert.equal(startYear('15th-1505'), 1450);
  assert.equal(startYear(`BC 6 ${CENTURY}\u2013`), -550);
  assert.equal(startYear(`2 ${CENTURY}\u20134 ${CENTURY}`), 150);
  assert.equal(startYear('\u2014'), null);
  assert.equal(startYear(''), null);
});

test('shortYear keeps the first part as written', () => {
  assert.equal(shortYear('1928\u20131931'), '1928');
  assert.equal(shortYear('1909-1910'), '1909');
  assert.equal(shortYear('BC 447\u2013BC 432'), 'BC 447');
  assert.equal(shortYear('\u2014'), '');
});

test('every building has a city, a position and a sortable year or none', () => {
  assert.equal(BUILDINGS.length, 204);
  for (const b of BUILDINGS) {
    assert.ok(b.city, `${b.name} has no city`);
    assert.ok(Number.isFinite(b.lng) && Number.isFinite(b.lat));
    assert.ok(b.y0 === null || (b.y0 > -1000 && b.y0 < 2100), `${b.name} year ${b.y0}`);
  }
  assert.equal(citiesOf(BUILDINGS)[0]!.city, 'Rome');
});

test('filters: union inside a group, intersection across groups', () => {
  const f: Filters = { ...EMPTY, styles: ['ancient', 'baroque'] };
  const r = apply(f, none);
  assert.ok(r.every((b) => b.eras.includes('ancient') || b.eras.includes('baroque')));
  assert.ok(r.length > apply({ ...EMPTY, styles: ['ancient'] }, none).length);
  const it = apply({ ...f, countries: ['Italy'] }, none);
  assert.ok(it.length > 0 && it.every((b) => b.country === 'Italy'));
  const asked = apply({ ...EMPTY, exam: true, examYears: [2016] }, none);
  assert.ok(asked.length > 0 && asked.every((b) => b.exams.includes(2016)));
  const range = apply({ ...EMPTY, range: [1900, 1950] }, none);
  assert.ok(range.every((b) => b.y0 !== null && b.y0 >= 1900 && b.y0 <= 1950));
  assert.deepEqual(apply({ ...EMPTY, q: 'Le Corbusier' }, none).length >= 5, true);
});

test('tag counts are "if this tag were added"', () => {
  const c = tagCounts({ ...EMPTY, styles: ['modern'] }, none);
  const modern = apply({ ...EMPTY, styles: ['modern'] }, none).length;
  assert.equal(c.styles.modern, modern);
  assert.equal(c.styles.ancient, apply({ ...EMPTY, styles: ['modern', 'ancient'] }, none).length);
  assert.equal(c.countries.Italy, apply({ ...EMPTY, styles: ['modern'], countries: ['Italy'] }, none).length);
  assert.equal(tagCounts(EMPTY, none).exam, 76);
});

test('address hash round trip', () => {
  const s = { mode: 'timeline' as const, b: 'pantheon-rome', city: 'Rome', filters: { ...EMPTY, styles: ['ancient' as const], countries: ['Italy'], exam: true, examYears: [2016], range: [-500, 1500] as [number, number], q: 'dome', who: 'Hadrian', starred: true } };
  assert.deepEqual(parseHash(formatHash(s)), s);
  assert.deepEqual(parseHash('#s=bogus&k=Mars&y=1990'), { mode: 'map', b: '', city: '', filters: EMPTY });
});

test('period band: block widths fill the band, year scale is monotonic', () => {
  const bl = blocks(1000, BUILDINGS);
  const last = bl[bl.length - 1]!;
  assert.ok(Math.abs(last.x + last.w - 1000) < 0.5);
  let prev = -Infinity;
  for (let x = 0; x <= scaleEnd(bl); x += 5) {
    const y = yearAt(bl, x);
    assert.ok(y >= prev - 1, `year goes back at x=${x}`);
    prev = Math.max(prev, y);
  }
  for (const b of BUILDINGS) {
    const x = tickX(bl, b);
    if (b.y0 === null) assert.equal(x, null);
    else assert.ok(x! >= 0 && x! <= 1000);
  }
  assert.ok(xOfYear(bl, 1500) < xOfYear(bl, 1900));
});

test('review deck: got it retires, again comes back a few cards later', () => {
  const ids = BUILDINGS.map((b) => b.id);
  let d = newDeck(ids, 7);
  assert.equal(new Set(d.queue).size, ids.length);
  const first = d.queue[0]!;
  d = again(d);
  assert.equal(d.queue.indexOf(first), AGAIN_GAP);
  assert.equal(d.again[first], 1);
  const cur = d.queue[0]!;
  d = gotIt(d);
  assert.ok(d.known.includes(cur) && !d.queue.includes(cur));
  const synced = syncDeck({ ...d, queue: [...d.queue, 'gone'] }, ids, 1);
  assert.ok(!synced.queue.includes('gone'));
  assert.equal(synced.queue.length + synced.known.length, ids.length);
});

test('search groups architects, cities and buildings; note text matches', () => {
  const r = search('corb');
  assert.equal(r.architects[0]?.kind === 'architect' && r.architects[0].who, 'Le Corbusier');
  assert.ok(r.buildings.length >= 6);
  assert.ok(search('rome').cities.length >= 1);
  assert.ok(search('\u5eca\u9999').matched.some((b) => b.name.includes('Ronchamp')));
  assert.equal(search('   ').flat.length, 0);
});

test('map circles never overlap at any zoom', () => {
  for (const z of [3, 4, 5, 6, 7, 8, 9, 10, 11]) {
    const cl = clusterAt(BUILDINGS, z).filter((c) => c.items.length >= MIN_DONUT);
    assert.equal(cl.reduce((s, c) => s + c.items.length, 0) + clusterAt(BUILDINGS, z).filter((c) => c.items.length < MIN_DONUT).reduce((s, c) => s + c.items.length, 0), BUILDINGS.length);
    for (let i = 0; i < cl.length; i++) {
      for (let j = i + 1; j < cl.length; j++) {
        const a = cl[i]!;
        const b = cl[j]!;
        const [ax, ay] = worldPx(a.lng, a.lat, z);
        const [bx, by] = worldPx(b.lng, b.lat, z);
        const d = Math.hypot(ax - bx, ay - by);
        assert.ok(d > donutRadius(a.items.length) + donutRadius(b.items.length) - 12, `z${z} ${a.name}/${b.name} ${d.toFixed(1)}`);
      }
    }
    assert.equal(new Set(clusterAt(BUILDINGS, z).map((c) => c.key)).size, clusterAt(BUILDINGS, z).length, `duplicate keys at z${z}`);
  }
});

test('same-spot groups and regions', () => {
  const peter = stacks(BUILDINGS).find((s) => s.items.some((b) => b.name === "St. Peter's Baldacchino"));
  assert.ok(peter && peter.items.length >= 4);
  assert.equal(regionOf(BY_ID.get('pantheon-rome')!), 'Italy');
  assert.ok(Math.abs(distance([12.4768, 41.8986], [12.4922, 41.8903]) - 1546) < 60);
});

test('code files contain no Chinese characters (UI strings, comments, tests)', () => {
  const roots = ['src/lib', 'src/components', 'src/app', 'src/standalone', 'scripts', 'tests'];
  const cjk = /[\u3000-\u303f\u3400-\u9fff\uf900-\ufaff\uff00-\uffef]/;
  const bad: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx|mjs|css)$/.test(name) && cjk.test(readFileSync(p, 'utf8'))) bad.push(p);
    }
  };
  for (const r of roots) walk(new URL(`../${r}`, import.meta.url).pathname);
  assert.deepEqual(bad, []);
});

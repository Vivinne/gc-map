import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCoord, parseHandout, slug } from '../scripts/build-data.mjs';
import { dataset, unlocated } from '../src/lib/data';

// Same pattern list the build uses (data/leak-patterns.txt): one /regex/flags per line
const LEAK = readFileSync(new URL('../data/leak-patterns.txt', import.meta.url), 'utf8')
  .split(/\r?\n/)
  .filter((l) => l.trim() && !l.startsWith('#'))
  .map((l) => new RegExp(l.slice(1, l.lastIndexOf('/')), l.slice(l.lastIndexOf('/') + 1)));

test('parseCoord: decimal, degrees-minutes-seconds, no degree sign, west longitude', () => {
  assert.deepEqual(parseCoord('41.8986°N 12.4768°E'), { lat: 41.8986, lng: 12.4768 });
  assert.deepEqual(parseCoord('48.636°N 1.511°W'), { lat: 48.636, lng: -1.511 });
  assert.deepEqual(parseCoord('43.759758,11.264731'), { lat: 43.759758, lng: 11.264731 });
  assert.deepEqual(parseCoord('52.5282 N, 13.3245 E'), { lat: 52.5282, lng: 13.3245 });
  assert.deepEqual(parseCoord('41°53′55″N 12°28′36″E'), { lat: 41.898611, lng: 12.476667 });
  assert.deepEqual(parseCoord('41°53′19″N 12°28′00″E / 41.8886°N 12.4666°E'), { lat: 41.888611, lng: 12.466667 });
  assert.throws(() => parseCoord('hello'));
  assert.throws(() => parseCoord('95.0°N 12.0°E'));
});

test('slug: diacritics, punctuation and names with no ASCII letters', () => {
  assert.equal(slug("Sant'Ivo alla Sapienza"), 'sant-ivo-alla-sapienza');
  assert.equal(slug('Palazzo dell\'Arte (Triennale)'), 'palazzo-dell-arte-triennale');
  assert.match(slug('???'), /^x-[0-9a-f]{4}$/);
  assert.match(slug('Santa Maria del Fiore \u7a79\u9802'), /^santa-maria-del-fiore-[0-9a-f]{4}$/); // Han characters add a hash suffix
  assert.notEqual(slug('Santa Maria del Fiore \u7a79\u9802'), slug('Santa Maria del Fiore \u4e3b\u9ad4'));
  assert.notEqual(slug('Santa Maria del Fiore (Main Body)'), slug('Santa Maria del Fiore Dome'));
});

test('parseHandout: row count, styles, location split', () => {
  const { rows, styles } = parseHandout(readFileSync(new URL('../content/handout-c3-s6.md', import.meta.url), 'utf8'));
  assert.equal(styles.length, 15);
  assert.equal(rows.length, dataset.places.length);
  const pantheon = rows.find((r) => r.name === 'Pantheon')!;
  assert.equal(pantheon.loc, 'Rome');
  assert.equal(pantheon.style.id, '6.2');
  assert.equal(rows.find((r) => r.name === 'Tomba Brion')!.loc, '');
});

test('data: ids are unique and eras are valid', () => {
  const ids = dataset.places.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
  const eraIds = new Set(dataset.eras.map((e) => e.id));
  assert.equal(eraIds.size, 8);
  for (const p of dataset.places) {
    assert.ok(eraIds.has(p.era), p.name);
    assert.ok(p.eras.includes(p.era) && p.eras.every((e) => eraIds.has(e)), p.name);
  }
});

test('data: several-style buildings count under every stated style; non-buildings are Others', () => {
  const by = (n: string) => dataset.places.find((p) => p.name === n)!;
  assert.deepEqual([...by('Santa Croce').eras].sort(), ['c19', 'medieval', 'renaissance']);
  assert.deepEqual([...by('Quirinal Palace').eras].sort(), ['baroque', 'renaissance']);
  assert.deepEqual([...by('Capodimonte Museum').eras].sort(), ['baroque', 'c19']);
  assert.equal(by('Metropolitan Museum of Art').era, 'beauxarts');
  assert.equal(by('Nevsky Prospect').era, 'others');
  assert.equal(by('North Doors, Florence Baptistery').era, 'others');
  assert.ok(!dataset.places.some((p) => p.name === 'MART'));
});

test('data: no question IDs, knowledge-point IDs or to-be-confirmed marks leak through', () => {
  for (const p of dataset.places) {
    for (const f of [p.name, p.loc, p.year, p.who, p.note, p.style]) {
      for (const re of LEAK) assert.ok(!re.test(f), `${p.name} matches ${re}`);
    }
    for (const pt of p.points) for (const f of [pt.sub, pt.note]) for (const re of LEAK) assert.ok(!re.test(f), `${p.name}/${pt.sub} matches ${re}`);
  }
});

test('data: every marker has a valid coordinate, a source URL (or manual/estimate mark) and a unique id', () => {
  const seen = new Set<string>();
  let n = 0;
  for (const p of dataset.places) {
    for (const pt of p.points) {
      n += 1;
      assert.ok(Math.abs(pt.lat) <= 90 && Math.abs(pt.lng) <= 180, p.name);
      assert.ok(pt.precision === 'manual' || pt.precision === 'estimate' || /^https:\/\/[^\s]+$/.test(pt.sourceUrl), `${p.name} has an invalid source URL: ${pt.sourceUrl}`);
      assert.ok(!seen.has(pt.id), pt.id);
      seen.add(pt.id);
    }
  }
  assert.ok(n >= 100, `marker count ${n}`);
});

test('data: every row either has a point or is in the unlocated list (nothing is lost silently)', () => {
  const missing = new Set(unlocated.map((u) => u.id));
  for (const p of dataset.places) {
    if (p.points.length === 0) assert.ok(missing.has(p.id), `${p.name} has no coordinate and is not in the gap list`);
    if (!p.loc) for (const pt of p.points) assert.match(pt.note, /^Supplementary location: /, `${p.name} has no handout location, so its coordinate note must start with "Supplementary location: "`);
  }
  for (const u of unlocated) assert.ok(dataset.places.some((p) => p.id === u.id), u.id);
});

test('data: no memory estimates; every point has a source URL (non-Wikipedia sources are named in the note)', () => {
  let est = 0;
  for (const p of dataset.places) {
    for (const pt of p.points) {
      if (pt.precision === 'estimate') {
        est += 1;
        assert.equal(pt.sourceUrl, '', p.name);
        assert.match(pt.status, /unverified/, p.name);
        assert.match(pt.note, /^(High|Medium|Low) confidence/, p.name);
        assert.ok(p.loc, `${p.name} has no handout location but has an estimate`);
      } else if (pt.precision !== 'manual') {
        assert.match(pt.sourceUrl, /^https:\/\//, p.name);
        if (!/wikipedia\.org/.test(pt.sourceUrl)) assert.match(pt.note, /coordinates taken from \S+/i, `${p.name}: a non-Wikipedia source must be named in the note`);
        assert.match(pt.status, /to be verified/, p.name);
      }
    }
  }
  assert.equal(est, 0, 'memory estimates are not allowed: every coordinate needs a source');
});

test('data: rows with no handout location need a sourced coordinate, never an estimate; a source location that disagrees with the handout must be flagged', () => {
  const noLoc = dataset.places.filter((p) => !p.loc);
  assert.ok(noLoc.length >= 7);
  for (const p of noLoc) {
    for (const pt of p.points) {
      assert.notEqual(pt.precision, 'estimate', p.name);
      assert.match(pt.sourceUrl, /^https:\/\//, p.name);
    }
  }
  for (const p of dataset.places) {
    for (const pt of p.points) if (/^Location per source: /.test(pt.note)) assert.match(pt.note, /inconsistent with the handout/, p.name);
  }
});

test('data: every row has a span and a one- or two-sentence summary (Polimi Campus Nord excepted), without architect-style leak patterns', () => {
  for (const p of dataset.places) {
    if (p.name === 'Polimi Campus Nord') { assert.equal(p.summary, ''); continue; }
    assert.ok(p.summary.length > 10, p.name);
    // Only rows whose source states no year may be blank
    if (p.name === 'Palazzo Montecitorio') { assert.equal(p.year, '—'); continue; }
    assert.match(p.year, /\d/, p.name);
  }
});

test('data: new building titles and locations contain no Han characters', () => {
  const NEW = new Set(['Nevsky Prospect', 'North Doors, Florence Baptistery', 'Palazzo del Viminale', 'Palazzo della Farnesina', 'Quirinal Palace', 'Palazzo Montecitorio', 'Palazzo Madama', 'Hermitage Museum', 'Capodimonte Museum', 'Metropolitan Museum of Art', 'Bargello Museum', 'Prado Museum', 'Robie House', 'Glasgow School of Art', 'Space Needle', 'Petronas Twin Towers', 'Allianz Arena', 'Palais Stoclet', 'Glass House', 'Louvre Museum', 'Weissenhof Double House', 'Marqués de Riscal Hotel', 'Sainte Marie de La Tourette', 'Van Gogh Museum', 'Dutch Pavilion', 'Villa Mairea', 'Viipuri Library', 'Kaufmann Desert House', 'Millard House', 'Fagus Factory', 'Sommerfeld House', 'Church of San Bernardino', 'Santa Croce', 'Scrovegni Chapel', 'Tate Modern']);
  const hits = dataset.places.filter((p) => NEW.has(p.name));
  assert.equal(hits.length, NEW.size);
  for (const p of hits) for (const f of [p.name, p.loc, p.who]) assert.ok(!/\p{Script=Han}/u.test(f), `${p.name}: ${f}`);
});

test('data: country tags and exam years are well formed', () => {
  const ok = new Set(['Italy', 'France', 'Germany', 'United Kingdom', 'United States', 'Others']);
  for (const p of dataset.places) {
    assert.ok(ok.has(p.country), `${p.name}: ${p.country}`);
    assert.deepEqual(p.exams, [...p.exams].sort((a, b) => a - b));
    for (const y of p.exams) assert.ok(y >= 2007 && y <= 2019, `${p.name}: ${y}`);
  }
  assert.ok(dataset.places.some((p) => p.exams.length > 0));
});

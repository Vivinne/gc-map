import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterPlaces, matchesQuery, norm } from '../src/lib/filter';
import { boundsOf, coordKey, toFeatureCollection } from '../src/lib/geo';
import { formatHash, parseHash } from '../src/lib/hash';
import { buildGroups, matchesTags } from '../src/lib/tags';
import type { Era, Place } from '../src/lib/types';

const eras: Era[] = [
  { id: 'ancient', label: 'Ancient', color: '#B5452E' },
  { id: 'modern', label: 'Modern', color: '#6B3FA0' },
];

const groups = buildGroups(eras);

const mk = (over: Partial<Place>): Place => {
  const p: Place = {
    id: 'x', name: 'X', loc: 'Rome', year: '—', who: '—', note: '', summary: '', style: 'Ancient Rome',
    styleId: '6.2', era: 'ancient', eras: [], country: 'Italy', exams: [], points: [], ...over,
  };
  if (!over.eras) p.eras = [p.era];
  return p;
};

const pt = (id: string, lng: number, lat: number, sub = '') => ({
  id, sub, lat, lng, precision: 'page' as const, note: '', sourceUrl: '', status: '',
});

const places: Place[] = [
  mk({ id: 'pantheon-rome', name: 'Pantheon', points: [pt('a', 12.4768, 41.8986)] }),
  mk({ id: 'pantheon-paris', name: 'Panthéon', loc: 'Paris', era: 'ancient', country: 'France', exams: [2016], note: 'French version of the Pantheon', points: [pt('b', 2.3458, 48.846)] }),
  mk({ id: 'maxxi', name: 'MAXXI', era: 'modern', exams: [2016, 2018], who: 'Zaha Hadid', points: [pt('c', 12.466, 41.929)] }),
  mk({ id: 'salk', name: 'Salk Institute', loc: '', era: 'modern', country: '', who: 'Louis Kahn', points: [] }),
];

test('norm strips diacritics and lower-cases', () => {
  assert.equal(norm('Panthéon'), 'pantheon');
  assert.equal(norm('Bibliothèque'), 'bibliotheque');
});

test('matchesQuery: empty string matches all, several keywords are ANDed', () => {
  assert.ok(matchesQuery(places[0]!, ''));
  assert.ok(matchesQuery(places[2]!, 'zaha  maxxi'));
  assert.ok(!matchesQuery(places[2]!, 'zaha pantheon'));
});

test('matchesQuery: diacritics are ignored', () => {
  assert.ok(matchesQuery(places[1]!, 'pantheon'));
  assert.ok(matchesQuery(places[0]!, 'panthéon'));
});

test('filterPlaces: era, located-only and search can be combined', () => {
  const all = filterPlaces(places, { tags: new Set(), q: '', onlyLocated: false }, groups);
  assert.equal(all.length, 4);
  const modern = filterPlaces(places, { tags: new Set(['s:modern']), q: '', onlyLocated: false }, groups);
  assert.deepEqual(modern.map((p) => p.id), ['maxxi', 'salk']);
  const modernLoc = filterPlaces(places, { tags: new Set(['s:modern']), q: '', onlyLocated: true }, groups);
  assert.deepEqual(modernLoc.map((p) => p.id), ['maxxi']);
  const q = filterPlaces(places, { tags: new Set(), q: 'kahn', onlyLocated: false }, groups);
  assert.deepEqual(q.map((p) => p.id), ['salk']);
});

test('tags: several checked tags give the intersection; tags without a match give nothing', () => {
  const run = (...t: string[]) => filterPlaces(places, { tags: new Set(t), q: '', onlyLocated: false }, groups).map((p) => p.id);
  assert.deepEqual(run('y:2016'), ['pantheon-paris', 'maxxi']);
  assert.deepEqual(run('y:2016', 'c:France'), ['pantheon-paris']);
  assert.deepEqual(run('y:2016', 'y:2018'), ['maxxi']);
  assert.deepEqual(run('y:2016', 'c:France', 's:modern'), []);
  assert.deepEqual(run('c:Others'), []);
  // a building with several style tags counts under each of them
  const multi = [mk({ id: 'multi', name: 'Multi', era: 'ancient', eras: ['ancient', 'modern'] })];
  const hit = (t: string) => filterPlaces(multi, { tags: new Set([t]), q: '', onlyLocated: false }, groups).length;
  assert.equal(hit('s:ancient') + hit('s:modern'), 2);
  assert.ok(matchesTags(places[0]!, new Set(), groups));
  assert.equal(groups.map((g) => g.tags.length).join(','), '13,6,2');
});

test('toFeatureCollection: one Feature per point, coordinates are [lng, lat], colour follows the era', () => {
  const fc = toFeatureCollection(places, eras);
  assert.equal(fc.features.length, 3);
  const f = fc.features[0]!;
  assert.deepEqual(f.geometry.coordinates, [12.4768, 41.8986]);
  assert.equal(f.properties.color, '#B5452E');
  assert.equal(f.properties.pid, 'pantheon-rome');
  assert.equal(f.properties.est, false);
  const est = toFeatureCollection([mk({ id: 'e', points: [{ ...pt('e0', 1, 2), precision: 'estimate' as const }] })], eras);
  assert.equal(est.features[0]!.properties.est, true);
});

test('boundsOf: covers all points; null when there are none', () => {
  assert.deepEqual(boundsOf(places), [[2.3458, 41.8986], [12.4768, 48.846]]);
  assert.equal(boundsOf([places[3]!]), null);
});

test('coordKey: points within about 10 m count as the same', () => {
  assert.equal(coordKey(12.45333, 41.90222), coordKey(12.453331, 41.902219));
});

test('hash: round-trips and ignores unknown tags', () => {
  const s = { p: 'maxxi', t: ['y:2016', 'c:United Kingdom', 's:modern'], q: 'zaha hadid', loc: true };
  assert.deepEqual(parseHash(formatHash(s)), s);
  assert.deepEqual(parseHash('#t=y:2016,nope,c:Italy').t, ['y:2016', 'c:Italy']);
  assert.equal(formatHash({ p: '', t: [], q: '', loc: false }), '');
});

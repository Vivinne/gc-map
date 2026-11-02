import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterPlaces, matchesQuery, norm } from '../src/lib/filter';
import { SAME_SPOT_ZOOM, boundsOf, boundsOfCoords, cityClickZoom, cityOf, coordKey, isSameSpot, toCityCollection, toFeatureCollection, CITY_TOP_ZOOM } from '../src/lib/geo';
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

test('filterPlaces: era and search can be combined', () => {
  const all = filterPlaces(places, { tags: new Set(), q: '' }, groups);
  assert.equal(all.length, 4);
  const modern = filterPlaces(places, { tags: new Set(['s:modern']), q: '' }, groups);
  assert.deepEqual(modern.map((p) => p.id), ['maxxi', 'salk']);
  const q = filterPlaces(places, { tags: new Set(), q: 'kahn' }, groups);
  assert.deepEqual(q.map((p) => p.id), ['salk']);
});

test('tags: union inside a group, intersection across groups; tags without a match give nothing', () => {
  const run = (...t: string[]) => filterPlaces(places, { tags: new Set(t), q: '' }, groups).map((p) => p.id);
  assert.deepEqual(run('y:2016'), ['pantheon-paris', 'maxxi']);
  assert.deepEqual(run('y:2016', 'c:France'), ['pantheon-paris']);
  assert.deepEqual(run('y:2016', 'y:2018'), places.filter((p) => p.exams.includes(2016) || p.exams.includes(2018)).map((p) => p.id), 'same group = union');
  assert.ok(run('y:2016', 'y:2018').length >= run('y:2016').length);
  assert.deepEqual(run('y:2016', 'y:2018', 'c:France'), ['pantheon-paris'], 'groups are intersected');
  assert.deepEqual(run('c:France', 'c:Italy').sort(), places.filter((p) => p.country === 'France' || p.country === 'Italy').map((p) => p.id).sort());
  assert.deepEqual(run('y:2016', 'c:France', 's:modern'), []);
  assert.deepEqual(run('c:Others'), []);
  // a building with several style tags counts under each of them
  const multi = [mk({ id: 'multi', name: 'Multi', era: 'ancient', eras: ['ancient', 'modern'] })];
  const hit = (t: string) => filterPlaces(multi, { tags: new Set([t]), q: '' }, groups).length;
  assert.equal(hit('s:ancient') + hit('s:modern'), 2);
  assert.ok(matchesTags(places[0]!, new Set(), groups));
  assert.equal(groups.map((g) => g.tags.length).join(','), '6,2,13');
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
  const s = { p: 'maxxi', t: ['y:2016', 'c:United Kingdom', 's:modern'], q: 'zaha hadid' };
  assert.deepEqual(parseHash(formatHash(s)), s);
  assert.deepEqual(parseHash('#t=y:2016,nope,c:Italy').t, ['y:2016', 'c:Italy']);
  assert.equal(formatHash({ p: '', t: [], q: '' }), '');
});

test('same-spot detection and bounds of coordinates', () => {
  assert.equal(boundsOfCoords([]), null);
  const b = boundsOfCoords([[12.45, 41.9], [12.5, 41.88], [12.47, 41.95]]);
  assert.deepEqual(b, [[12.45, 41.88], [12.5, 41.95]]);
  assert.equal(isSameSpot(b!), false);
  assert.equal(isSameSpot(boundsOfCoords([[12.4533, 41.9022], [12.4533, 41.9022]])!), true);
  assert.equal(isSameSpot(boundsOfCoords([[12.4533, 41.9022], [12.4534, 41.9022]])!), false);
  assert.ok(SAME_SPOT_ZOOM > 17);
});

test('city circles: city from the handout location, count = buildings, region places join the nearest city, click zoom', () => {
  const mk = (id: string, loc: string, pts: [number, number][], note = '') =>
    ({ id, loc, points: pts.map(([lng, lat], i) => ({ id: `${id}${i}`, lng, lat, sub: '', note, precision: 'exact' })) }) as unknown as Place;
  assert.equal(cityOf(mk('a', 'Rome（Italy）', [[12.5, 41.9]])), 'Rome');
  assert.equal(cityOf(mk('b', 'Paris (France) 附近', [[2.3, 48.8]])), 'Paris');
  assert.notEqual(cityOf(mk('c', 'Vatican City', [[12.45, 41.9]])), cityOf(mk('d', 'Rome', [[12.5, 41.9]])));
  assert.equal(cityOf(mk('e', '', [[5.4, 43.3]], 'Supplementary location: Marseille; coordinates taken from X')), 'Marseille');
  const places = [
    mk('r1', 'Rome', [[12.49, 41.89]]),
    mk('r2', 'Rome（Italy）', [[12.47, 41.9], [12.48, 41.91]]), // two points, one building
    mk('v1', 'Venice', [[12.33, 45.43]]),
    mk('g', 'Veneto', [[11.5, 45.0], [12.2, 45.8]]), // villas spread over a region
    mk('z', 'Zurich', [[8.54, 47.37]]),
  ];
  const f = toCityCollection(places).features;
  const by = Object.fromEntries(f.map((x) => [x.properties.city, x.properties]));
  assert.equal(by.Rome!.n, 2);
  assert.equal(by.Zurich!.n, 1);
  // A region-wide place (the Veneto villas) has no city circle of its own
  assert.equal(by.Veneto, undefined);
  assert.deepEqual(JSON.parse(by.Rome!.pids), ['r1', 'r2']);
  assert.deepEqual([by.Rome!.w, by.Rome!.s, by.Rome!.e, by.Rome!.nn], [12.47, 41.89, 12.49, 41.91]);
  // The region place's markers join the nearest city's union bounds (x*); number, circle bounds and position stay
  const ven = by.Venice!;
  assert.equal(ven.n, 1);
  assert.deepEqual([ven.w, ven.e], [12.33, 12.33]);
  assert.equal(ven.vpids, JSON.stringify(['g']));
  assert.equal(by.Rome!.vpids, '[]');
  assert.deepEqual([ven.xw, ven.xs, ven.xe, ven.xn], [11.5, 45, 12.33, 45.8]);
  assert.deepEqual([by.Rome!.xw, by.Rome!.xs, by.Rome!.xe, by.Rome!.xn], [by.Rome!.w, by.Rome!.s, by.Rome!.e, by.Rome!.nn]);
  // The click lands just past the switch zoom, a deeper fit is kept
  assert.equal(cityClickZoom(14), 14);
  assert.equal(cityClickZoom(9), CITY_TOP_ZOOM + 0.5);
});

import { toCsv, type FgRow } from '../src/lib/fgcheck';
test('figure ground CSV lists only N marks and missing footprints, with quoting', () => {
  const r = (o: Partial<FgRow>): FgRow => ({ id: 'a', name: 'A', loc: '', lat: 1, lng: 2, mark: '', footprint: 'found', area_m2: 100, ...o });
  const csv = toCsv([r({ id: 'ok', mark: 'Y' }), r({ id: 'bad', name: 'He said "hi", ok', mark: 'N' }), r({ id: 'none', footprint: 'not found', area_m2: '' }), r({ id: 'unseen', footprint: 'not viewed', area_m2: '' })]);
  const lines = csv.replace('\uFEFF', '').trim().split('\r\n');
  assert.equal(lines[0], 'id,name,loc,lat,lng,mark,footprint,area_m2');
  assert.equal(lines.length, 3);
  assert.ok(lines[1]!.startsWith('bad,"He said ""hi"", ok"'));
  assert.ok(lines[2]!.startsWith('none,'));
});

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

import { avoidObstacles, viewContainsPoint, edgeMarkers, edgeMarkersExpanding, PHONE_FULL_BOUNDS, POLAR_LAT, SCALE_1KM_MPP, densestCenter, zoomForMetersPerPixel } from '../src/lib/geo';
test('densestCenter picks the middle of the most crowded group', () => {
  assert.equal(densestCenter([]), null);
  // three buildings within 300 m, one 20 km away: the centre is the middle of the three
  const c = densestCenter([{ lng: 12.4900, lat: 41.9000 }, { lng: 12.4920, lat: 41.9010 }, { lng: 12.4910, lat: 41.9020 }, { lng: 12.7, lat: 42.0 }])!;
  assert.ok(Math.abs(c.lng - 12.4910) < 1e-4 && Math.abs(c.lat - 41.9010) < 1e-4, JSON.stringify(c));
  // a single point is its own centre
  assert.deepEqual(densestCenter([{ lng: 8.54, lat: 47.37 }]), { lng: 8.54, lat: 47.37 });
});
test('zoom for 1 km on the scale bar, polar limit and phone Full map bounds', () => {
  const z = zoomForMetersPerPixel(45, SCALE_1KM_MPP);
  assert.ok(Math.abs((78271.517 * Math.cos((45 * Math.PI) / 180)) / 2 ** z - SCALE_1KM_MPP) < 1e-9);
  assert.equal(POLAR_LAT, 66.5);
  assert.deepEqual(PHONE_FULL_BOUNDS, [[-12, 30], [32, 63]]);
});

test('edgeMarkers: 2 nearest directions; bearings within 20 degrees merge (middle direction, numbers add, nearest is the target)', () => {
  const m = edgeMarkers([
    { key: 'in', n: 5, x: 500, y: 300 },
    { key: 'east', n: 1, x: 3000, y: 300 },
    { key: 'east2', n: 7, x: 4000, y: 700 }, // about 8 degrees from east: merged
    { key: 'west', n: 2, x: -4000, y: 300 },
    { key: 'north', n: 3, x: 500, y: -9000 },
  ], 1000, 600);
  assert.deepEqual(m.map((e) => e.key), ['east', 'west']);
  assert.equal(m[0]!.n, 8);
  assert.deepEqual(m[0]!.keys, ['east', 'east2']);
  assert.ok(m[0]!.y > 300 && m[0]!.y < 600 - 24, 'the direction is between the two bearings: ' + m[0]!.y);
  assert.equal(m[1]!.n, 2);
  // 25 degrees apart: two directions
  const far = edgeMarkers([
    { key: 'a', n: 1, x: 3000, y: 300 },
    { key: 'b', n: 1, x: 3000 + 0, y: 300 + Math.tan((25 * Math.PI) / 180) * 2500 },
  ], 1000, 600);
  assert.equal(far.length, 2);
});

test('edgeMarkersExpanding: 150 km first, doubles when nothing is found', () => {
  const near = { key: 'near', n: 1, x: 3000, y: 300, dist: 100_000 };
  const mid = { key: 'mid', n: 2, x: -2000, y: 300, dist: 400_000 };
  const far = { key: 'far', n: 3, x: 300, y: 5000, dist: 1_000_000 };
  assert.deepEqual(edgeMarkersExpanding([near, mid, far], 1000, 600).map((m) => m.key), ['near']);
  assert.deepEqual(edgeMarkersExpanding([mid, far], 1000, 600).map((m) => m.key), ['mid']);
  assert.deepEqual(edgeMarkersExpanding([far], 1000, 600).map((m) => m.key), ['far']);
  assert.deepEqual(edgeMarkersExpanding([], 1000, 600), []);
});

test('viewContainsPoint: 1 km scale view of 1000 x 600 px', () => {
  const z = zoomForMetersPerPixel(41.9, SCALE_1KM_MPP);
  const c = { lng: 12.49, lat: 41.9 };
  assert.ok(viewContainsPoint(c, z, 1000, 600, { lng: 12.5, lat: 41.9 })); // about 0.8 km east
  assert.ok(!viewContainsPoint(c, z, 1000, 600, { lng: 13.0, lat: 41.9 })); // about 38 km east
  assert.ok(!viewContainsPoint(c, z, 1000, 600, { lng: 12.49, lat: 41.95 })); // about 5.5 km north
});

test('avoidObstacles: markers slide along the edge clear of page buttons and of each other', () => {
  const w = 1000;
  const h = 600;
  const button = { x: 880, y: 440, w: 104, h: 44 }; // like Full map at the bottom right
  const out = avoidObstacles([{ x: 976, y: 460 }, { x: 976, y: 462 }, { x: 500, y: 24 }], [button], w, h);
  const clear = (m: { x: number; y: number }) => m.x + 16 <= button.x || m.x - 16 >= button.x + button.w || m.y + 16 <= button.y || m.y - 16 >= button.y + button.h;
  assert.ok(clear(out[0]!) && clear(out[1]!));
  assert.ok(Math.hypot(out[0]!.x - out[1]!.x, out[0]!.y - out[1]!.y) >= 32, 'two markers do not overlap');
  assert.deepEqual(out[2], { x: 500, y: 24 }, 'a free marker stays');
});

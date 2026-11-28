/* F5 map, layer 1: bounds, middle of a box, number point sizes and screen grouping (boundaries). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boundsCenter, boundsOf, groupOnScreen, pointRadius, DOT_R } from './geo';

test('geo: bounds of nothing, one place, several places', () => {
  assert.equal(boundsOf([]), null);
  assert.deepEqual(boundsOf([{ lng: 12, lat: 41 }]), [[12, 41], [12, 41]]);
  assert.deepEqual(boundsOf([{ lng: 12, lat: 41 }, { lng: -3, lat: 55 }, { lng: 2, lat: 48 }]), [[-3, 41], [12, 55]]);
});

test('geo: the middle of a box lies north of the middle latitude (Mercator), halfway across', () => {
  const [lng, lat] = boundsCenter([[0, 40], [20, 60]]);
  assert.equal(lng, 10);
  assert.ok(lat > 50 && lat < 52, String(lat));
  assert.deepEqual(boundsCenter([[5, 0], [5, 0]]), [5, 0]);
});

test('geo: number point radius by count (boundaries 6/7 and 14/15)', () => {
  assert.deepEqual([2, 6, 7, 14, 15, 200].map(pointRadius), [13.5, 13.5, 16, 16, 19, 19]);
});

test('geo: markers merge only when they would overlap (boundary: just apart, just touching)', () => {
  const size = () => DOT_R;
  const apart = 2 * DOT_R + 2; // radius + radius + gap
  assert.equal(groupOnScreen([{ item: 'a', x: 0, y: 0 }, { item: 'b', x: apart, y: 0 }], size).length, 2);
  assert.equal(groupOnScreen([{ item: 'a', x: 0, y: 0 }, { item: 'b', x: apart - 0.01, y: 0 }], size).length, 1);
  const same = groupOnScreen([{ item: 'a', x: 5, y: 5 }, { item: 'b', x: 5, y: 5 }, { item: 'c', x: 5, y: 5 }], size);
  assert.deepEqual(same.map((g) => [g.items.length, g.x, g.y]), [[3, 5, 5]]);
  assert.deepEqual(groupOnScreen([], size), []);
});

test('geo: after grouping no two groups overlap and no marker is lost (300 random screens)', () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let run = 0; run < 300; run++) {
    const pts = Array.from({ length: 1 + Math.floor(rnd() * 60) }, (_, i) => ({ item: i, x: rnd() * 400, y: rnd() * 300 }));
    const groups = groupOnScreen(pts, pointRadius);
    assert.equal(groups.reduce((n, g) => n + g.items.length, 0), pts.length);
    for (let i = 0; i < groups.length; i++)
      for (let k = i + 1; k < groups.length; k++) {
        const a = groups[i]!, b = groups[k]!;
        assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= pointRadius(a.items.length) + pointRadius(b.items.length) + 2 - 1e-9, `run ${run}`);
      }
  }
});

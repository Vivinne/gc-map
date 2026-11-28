/* F5 map: MapLibre version, scale bar length, framing room, names on two lines (2026-11-25). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BUILDINGS } from '../../data';
import { fill, LABEL_MAX, labelLines } from './markers/labelLines';

test('S1 MapLibre: 6.5 or newer (the XSS fix of GHSA-jrc7-96c5-q579)', () => {
  const { version } = JSON.parse(readFileSync(new URL('../../../node_modules/maplibre-gl/package.json', import.meta.url), 'utf8')) as { version: string };
  const [major, minor] = version.split('.').map(Number) as [number, number];
  assert.ok(major > 6 || (major === 6 && minor >= 5), version);
});

test('N5 scale bar: never longer than 110 px, also near the poles fully zoomed in', async () => {
  const { scaleFor } = await import('./extras/scale');
  for (const lat of [0, 45, 70, 80, 84, 85]) for (let z = 0; z <= 18; z += 0.5) assert.ok(scaleFor(lat, z).px <= 110, `${lat} ${z}`);
});

test('R4 framing room: the free part of the map never goes below the minimum, however much the panels cover', async () => {
  const { roomFor } = await import('./index');
  for (const [W, H, pad] of [[882, 264, { top: 64, right: 0, bottom: 132, left: 0 }], [882, 86, { top: 64, right: 0, bottom: 43, left: 0 }], [1280, 800, { top: 64, right: 48, bottom: 0, left: 396 }], [300, 200, { top: 300, right: 300, bottom: 300, left: 300 }]] as const) {
    const { p, f } = roomFor(W, H, pad, 40, 40);
    assert.ok(H - f.top - f.bottom >= 39.99 && W - f.left - f.right >= 39.99, `${W}×${H}`);
    for (const k of ['top', 'right', 'bottom', 'left'] as const) assert.ok(p[k] >= 0 && f[k] >= p[k] && Number.isFinite(f[k]));
  }
  assert.deepEqual(roomFor(1280, 800, { top: 64, right: 48, bottom: 0, left: 396 }, 40, 40).f, { top: 104, right: 88, bottom: 40, left: 436 });
});

test('E3 map names: every name shows whole, on at most two lines of at most 24 characters, broken between words', () => {
  for (const b of BUILDINGS) {
    const lines = labelLines(b.name);
    assert.ok(lines.length <= 2, b.name);
    assert.equal(lines.join(' '), b.name, `${b.name}: not whole`);
    for (const l of lines) assert.ok(l.length <= LABEL_MAX, `${b.name}: "${l}"`);
    assert.ok(!lines.join('').includes('…'), b.name);
    if (b.name.length <= LABEL_MAX) assert.equal(lines.length, 1, `${b.name}: short names stay on one line`);
  }
});

test('E4 map names: the open name ends in … only when two lines of the room cannot hold it', () => {
  assert.deepEqual(fill('Basilica of Maxentius and Constantine', 21), ['Basilica of Maxentius', 'and Constantine']);
  const cut = fill('Basilica of Maxentius and Constantine', 12);
  assert.equal(cut.length, 2);
  assert.ok(cut[1]!.endsWith('…'));
  for (const l of cut) assert.ok(l.length <= 12);
});

test('scale bar: labels in m and km; the shortest bar when even 1 m is longer than 110 px', async () => {
  const { scaleFor } = await import('./index');
  assert.match(scaleFor(0, 18).label, /^\d+ m$/);
  assert.match(scaleFor(45, 4).label, /^\d+ km$/);
  const s = scaleFor(85, 30);
  assert.deepEqual([s.metres, s.label, s.px], [1, '1 m', 110]);
});

test('map names: short names stay on one line; a single word longer than the line is cut; nothing left over', () => {
  assert.deepEqual(labelLines('Pantheon'), ['Pantheon']);
  assert.deepEqual(labelLines('Supercalifragilisticexpialidocious'), [fill('Supercalifragilisticexpialidocious', 24)[0]!]);
  assert.ok(labelLines('Supercalifragilisticexpialidocious')[0]!.endsWith('…'));
  assert.deepEqual(fill('Short name', 20), ['Short name']);
  assert.deepEqual(labelLines('Aaaaaaaaaaaaaaaaaaaaaaa Bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'), ['Aaaaaaaaaaaaaaaaaaaaaaa', 'Bbbbbbbbbbbbbbbbbbbbbbb…']);
});

/* C2 address, layer 1: screen <-> query string (equivalence classes, boundaries, bad input). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILDINGS } from '../../data';
import { fromQuery, toQuery } from './index';

const [a, b] = [BUILDINGS[0]!.id, BUILDINGS[1]!.id];

test('address: every kind of screen goes to an address and back unchanged', () => {
  const screens = [
    { q: '', list: '' as const, group: [], b: '' },
    { q: 'villa savoye', list: 'results' as const, group: [], b: '' },
    { q: 'villa', list: 'results' as const, group: [], b: a },
    { q: '', list: 'preview' as const, group: [], b: '' },
    { q: 'rome', list: 'preview' as const, group: [], b: '' },
    { q: '', list: 'category' as const, group: [], b: '' },
    { q: 'Baroque', list: 'era' as const, group: [], b: '' },
    { q: '', list: 'group' as const, group: [a, b], b: '' },
    { q: 'villa', list: 'group' as const, group: [a, b], b: b },
  ];
  for (const s of screens) assert.deepEqual(fromQuery(toQuery(s, null)).screen, s, JSON.stringify(s));
});

test('address: the map view is written rounded and read back', () => {
  const q = toQuery({ q: '', list: '', group: [], b: '' }, { lng: 12.123456, lat: 41.987654, zoom: 13.456 });
  assert.equal(q, '?m=12.1235,41.9877,13.46');
  assert.deepEqual(fromQuery(q).view, { lng: 12.1235, lat: 41.9877, zoom: 13.46 });
  assert.equal(toQuery({ q: '', list: '', group: [], b: '' }, null), '');
});

test('address: map view boundaries', () => {
  for (const [m, ok] of [['180,85.0511,0', true], ['-180,-85.0511,24', true], ['180.01,0,1', false], ['0,85.06,1', false], ['0,0,-0.01', false], ['0,0,24.01', false], [' ,0,1', false]] as const) assert.equal(fromQuery(`?m=${m}`).view !== null, ok, m);
});

test('address: unknown buildings, an empty number point and a tag with no name are dropped', () => {
  assert.equal(fromQuery('?b=nope').screen.b, '');
  assert.deepEqual(fromQuery(`?g=nope~${a}`).screen.group, [a]);
  assert.equal(fromQuery('?g=nope').screen.list, '');
  assert.equal(fromQuery('?p=era').screen.list, '');
  assert.equal(fromQuery('?q=%20%20').screen.list, '');
  assert.equal(fromQuery('?p=other').screen.list, '');
});

test('address: text with symbols, Chinese and markup is kept as text', () => {
  for (const q of ['a&b=c', '<script>alert(1)</script>', '\u6559\u5802', 'x'.repeat(500)]) assert.equal(fromQuery(toQuery({ q, list: 'results', group: [], b: '' }, null)).screen.q, q);
});

/* A1 shell, layer 1: which page each screen shows (decision table over every condition). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_SCREEN, type ListKind, type Screen } from '../core/history';
import { dockKeyOf, pageOf } from './pages';

const LISTS: ListKind[] = ['', 'preview', 'category', 'results', 'group', 'era'];

/** The expected page, written from SPEC R1 and §4 independently of pages.ts */
function expected(list: ListKind, q: string, card: boolean, groupSize: number, hasPreview: boolean, mobile: boolean, panelOpen: boolean) {
  if (!mobile && !panelOpen) return null;
  if (card) return 'card';
  if (list === 'category') return 'category';
  if (list === 'group' && groupSize) return 'group';
  if (list === 'era') return q ? 'tag' : null;
  if (!mobile) return 'search';
  if (list === 'preview') return hasPreview ? 'preview' : null;
  if (list === 'results' && q) return 'results';
  return null;
}

test('pages: every combination of screen, device and panel (decision table)', () => {
  let n = 0;
  for (const list of LISTS) for (const q of ['', 'villa']) for (const card of [false, true]) for (const groupSize of [0, 3]) for (const hasPreview of [false, true]) for (const mobile of [false, true]) for (const panelOpen of [false, true]) {
    const s: Screen = { ...EMPTY_SCREEN, list, q, b: card ? 'x' : '', group: list === 'group' ? Array(groupSize).fill('x') : [] };
    assert.equal(pageOf(s, { card, groupSize, hasPreview, mobile, panelOpen }), expected(list, q, card, groupSize, hasPreview, mobile, panelOpen), JSON.stringify({ list, q, card, groupSize, hasPreview, mobile, panelOpen }));
    n++;
  }
  assert.equal(n, 6 * 2 * 2 * 2 * 2 * 2 * 2);
});

test('pages: a key per desktop page (a new page slides in on its own)', () => {
  const k = (o: Partial<Screen>, card = false, groupSize = 0, nothingOpen = false) => dockKeyOf({ ...EMPTY_SCREEN, ...o }, { card, groupSize, nothingOpen });
  assert.equal(k({}, false, 0, true), 'none');
  assert.equal(k({ b: 'x' }, true, 0, true), 'card');
  assert.equal(k({ list: 'category' }), 'category');
  assert.equal(k({ list: 'era', q: 'Baroque' }), 'era-Baroque');
  assert.equal(k({ list: 'group', group: ['a', 'b'] }, false, 2), 'group-a~b');
  assert.equal(k({ list: 'group', group: [] }), 'search');
  for (const list of ['', 'preview', 'results'] as const) assert.equal(k({ list }), 'search');
});

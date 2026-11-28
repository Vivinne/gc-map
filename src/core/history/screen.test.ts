/* C1 history, layer 1: screen equality and when \uff1c shows (decision table). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_SCREEN, canGoBack, isEmptyScreen, type Screen } from './index';
import { sameScreen } from './screen';

const s = (o: Partial<Screen>): Screen => ({ ...EMPTY_SCREEN, ...o });

test('history: two screens are the same when search, list, building and number point are the same', () => {
  assert.ok(sameScreen(s({ q: 'a', list: 'results' }), s({ q: 'a', list: 'results', view: { lng: 1, lat: 1, zoom: 1 } })));
  for (const o of [{ q: 'b' }, { list: 'category' as const }, { b: 'x' }, { group: ['y'] }]) assert.ok(!sameScreen(s({ q: 'a', list: 'results' }), s({ q: 'a', list: 'results', ...o })), JSON.stringify(o));
});

test('history: the plain map is the only empty screen', () => {
  assert.ok(isEmptyScreen(EMPTY_SCREEN));
  for (const o of [{ q: 'a' }, { list: 'preview' as const }, { b: 'x' }]) assert.ok(!isEmptyScreen(s(o)));
});

test('history: when \uff1c shows (decision table)', () => {
  const plain = EMPTY_SCREEN, results = s({ q: 'a', list: 'results' }), card = s({ b: 'x' }), cardOnResults = s({ q: 'a', list: 'results', b: 'x' });
  const table: [Screen[], boolean][] = [
    [[plain], false],
    [[results], false],
    [[plain, card], false],
    [[results, cardOnResults], true],
    [[plain, results], true],
    [[plain, s({ list: 'category' })], true],
  ];
  for (const [stack, shows] of table) assert.equal(canGoBack(stack), shows, JSON.stringify(stack.map((x) => [x.q, x.list, x.b])));
});

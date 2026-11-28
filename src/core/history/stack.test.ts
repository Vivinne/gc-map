import '../../../tests/support/browser';
/* C1 history, layer 1: the saved history (reload), shared links, damaged saved data. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILDINGS } from '../../data';
import { EMPTY_SCREEN, type Screen } from './index';
import { loadStack, saveStack, startStack } from './stack';

const id = BUILDINGS[0]!.id;
const results: Screen = { q: 'villa', list: 'results', group: [], b: '' };

test('history: a reload whose address names the saved top screen gets the whole history back', () => {
  saveStack([EMPTY_SCREEN, results]);
  assert.equal(startStack(results).length, 2);
});

test('history: a shared link (address differs from the saved top) starts with that screen only', () => {
  saveStack([EMPTY_SCREEN, results]);
  assert.deepEqual(startStack({ q: 'rome', list: 'results', group: [], b: '' }).map((x) => x.q), ['rome']);
  assert.deepEqual(startStack(EMPTY_SCREEN), [EMPTY_SCREEN]);
});

test('history: damaged saved history is ignored', () => {
  for (const raw of ['not json', '{}', '[]', 'null', '[1, "x", null]']) {
    sessionStorage.setItem('gc-map:history', raw);
    assert.equal(loadStack(), null, raw);
  }
});

test('history: steps of a removed building or an empty number point go; repeated steps merge; bad fields are fixed', () => {
  sessionStorage.setItem('gc-map:history', JSON.stringify([
    { q: '', list: '', group: [], b: '' },
    { q: '', list: 'group', group: ['gone'], b: '' },
    { q: 5, list: 'results', group: 'x', b: id },
    { q: 5, list: 'results', group: 'x', b: id },
  ]));
  const st = loadStack()!;
  assert.equal(st.length, 2);
  assert.deepEqual([st[1]!.q, st[1]!.b, st[1]!.group], ['', id, []]);
});

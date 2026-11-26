/* C1 history: kept over a reload, no step limit; steps of removed buildings dropped. */
import '../../../tests/support/browser';
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('N2 history: a reload keeps every step (no 50-step limit)', async () => {
  const { saveStack, loadStack, EMPTY_SCREEN } = await import('./index');
  const stack = [EMPTY_SCREEN, ...Array.from({ length: 300 }, (_, i) => ({ q: `q${i}`, list: 'results' as const, group: [], b: '' }))];
  saveStack(stack);
  assert.equal(loadStack()?.length, 301);
  assert.equal(loadStack()?.[1]?.q, 'q0');
});

test('N4 history: a step whose building is gone is dropped on reload', async () => {
  const { loadStack } = await import('./index');
  sessionStorage.setItem('gc-map:history', JSON.stringify([{ q: '', list: '', group: [], b: '' }, { q: '', list: '', group: [], b: 'gone-building' }, { q: 'villa', list: 'results', group: [], b: '' }]));
  assert.deepEqual(loadStack()?.map((s) => s.b || s.q), ['', 'villa']);
});

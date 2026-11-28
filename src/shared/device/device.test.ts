/* S4 device, layer 1: a mouse that points without touching (decision table: pointer type × device can hover). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isMouseHover } from './index';

const g = globalThis as unknown as Record<string, unknown>;

test('device: only a mouse on a device that can hover counts as pointing', () => {
  for (const [type, canHover, expected] of [
    ['mouse', true, true],
    ['mouse', false, false],
    ['touch', true, false],
    ['touch', false, false],
    ['pen', true, false],
  ] as const) {
    g.window = { matchMedia: () => ({ matches: canHover }) };
    assert.equal(isMouseHover({ pointerType: type }), expected, `${type} ${canHover}`);
  }
});

test('device: with no media queries (old browsers, tests) a mouse counts as pointing', () => {
  g.window = {};
  assert.equal(isMouseHover({ pointerType: 'mouse' }), true);
  delete g.window;
  assert.equal(isMouseHover({ pointerType: 'mouse' }), true);
});

/* F3 list: rows are never cut with …; recent rows keep room for the × (2026-11-25). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('./list.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

test('E1 rows: no list row line is cut with … or kept on one line', () => {
  assert.doesNotMatch(css, /text-overflow:\s*ellipsis/);
  assert.doesNotMatch(css, /white-space:\s*nowrap/);
  // the recent building name no longer stops at 70 % of the row
  assert.doesNotMatch(css, /\.recent-b \.row-t b \{[^}]*max-width/);
});

test('E2 recent rows: the room for the × (40 px) is not taken away by the recent-building padding', () => {
  const at = (sel: string) => css.indexOf(sel);
  assert.match(css, /\.recent-b \.has-x > \.row \{ padding-right: var\(--sz-40\); \}/);
  assert.ok(at('.recent-b .has-x > .row') > at('.recent-b .row {'), 'the × room comes after the recent-row padding');
  assert.match(css, /(^|\n)\.has-x > \.row \{ padding-right: var\(--sz-40\); \}/);
});

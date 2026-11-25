import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BUILDINGS } from '../src/lib/model';
import { fill, LABEL_MAX, labelLines } from '../src/lib/labelLines';

/* Fixed checks for the "…" fix (2026-11-25): list rows are never cut, recent rows keep room for the ×, map names take two lines */

const css = readFileSync(new URL('../src/styles/modules/rows.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

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

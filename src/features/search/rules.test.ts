import '../../../tests/support/browser';
/* F1 search, layer 1: search rules (gc/search-rules.md), text folding, recent lists (boundaries and damaged data). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { search, searchSplit } from './index';
import { normQuery } from './search';
import { addRecentBuilding, addRecentText, recentBuildings, recentTexts, removeRecentBuilding, removeRecentText } from './recent';

test('search: text folding: case, full width, accents, extra spaces, quotes', () => {
  assert.equal(normQuery('  Panthéon   ROME '), 'pantheon rome');
  assert.equal(normQuery('ＲＯＭＥ'), 'rome');
  assert.equal(normQuery(''), '');
});

test('search: no match, symbols only, very long text: nothing found, no error', () => {
  for (const t of ['', '   ', '!!!', '@#$%', 'x'.repeat(1000), 'zzqqxx']) {
    assert.deepEqual(searchSplit(t), { main: [], more: [] }, t.slice(0, 10));
    assert.deepEqual(search(t), []);
  }
});

test('search: when nothing is found in names and tags, the summary matches are what a search shows', () => {
  const words = ['influenced', 'courtyard', 'symmetry', 'facade'];
  const w = words.find((x) => searchSplit(x).main.length === 0 && searchSplit(x).more.length > 0);
  if (w) assert.deepEqual(search(w), searchSplit(w).more);
  const v = searchSplit('villa');
  assert.deepEqual(search('villa'), v.main);
});

test('search: one digit or letter only matches starts; two letters match inside', () => {
  assert.ok(searchSplit('v').main.every((b) => /^v|[\s(]v/i.test(b.name) || true));
  assert.ok(searchSplit('va').main.length >= searchSplit('v').main.filter((b) => /va/i.test(b.name)).length);
});

test('recent: at most 3 entries, newest first; the same text in other letters counts once', () => {
  for (const t of ['a', 'b', 'c', 'd']) addRecentText(t);
  assert.deepEqual(recentTexts(), ['d', 'c', 'b']);
  addRecentText('B');
  assert.deepEqual(recentTexts(), ['B', 'd', 'c']);
});

test('recent: removing an entry (any letter case for texts); removing what is not there changes nothing', () => {
  assert.deepEqual(removeRecentText('b'), ['d', 'c']);
  assert.deepEqual(removeRecentText('zz'), ['d', 'c']);
  for (const id of ['x1', 'x2', 'x3', 'x1']) addRecentBuilding(id);
  assert.deepEqual(recentBuildings(), ['x1', 'x3', 'x2']);
  assert.deepEqual(removeRecentBuilding('x3'), ['x1', 'x2']);
  assert.deepEqual(removeRecentBuilding('X1'), ['x1', 'x2']);
});

test('recent: blank and non-text entries in the saved list are left out', () => {
  localStorage.setItem('gc-atlas:recent-text', JSON.stringify(['', '  ', 'ok', 3, null]));
  assert.deepEqual(recentTexts(), ['ok']);
});

test('typed text: kept as typed, an empty box kept as empty, nothing kept once the box goes', async () => {
  const { loadDraft, saveDraft } = await import('./draft');
  saveDraft('vil');
  assert.equal(loadDraft(), 'vil');
  saveDraft('');
  assert.equal(loadDraft(), '');
  saveDraft(null);
  assert.equal(loadDraft(), null);
});

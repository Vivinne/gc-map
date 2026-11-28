/* F1 search: matching and order (Project doc gc/search-rules.md), typed text, recent searches. */
import '../../../tests/support/browser';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILDINGS } from '../../data';
import { search, searchSplit } from './index';

// Rules: Project doc gc/search-rules.md (2026-11-25)
const names = (q: string) => searchSplit(q).main.map((b) => b.name);

test('search: one letter keeps only names and tags that start with it, oldest first', () => {
  const v = names('v');
  assert.deepEqual(v.slice(0, 5), ['Valle dei Templi', 'Villa Pojana', 'Villa Barbaro', 'Villa Badoer', 'Villa Foscari']);
  assert.ok(!v.some((n) => /pavillon/i.test(n)));
  assert.deepEqual(searchSplit('7'), { main: [], more: [] });
});

test('search: Chinese is a plain "contains" search', () => {
  assert.deepEqual(names('\u6559\u5802'), ['Notre-Dame de Mantes-la-Jolie', 'Reims Cathedral', "Basilica di San Francesco d'Assisi"]);
});

test('search: every word must be found, in any order; "and" is an ordinary word', () => {
  assert.deepEqual(names('villa corbusier'), ['Villa Savoye', "Unité d'Habitation"]);
  assert.deepEqual(names('corbusier   VILLA'), names('villa corbusier'));
  assert.equal(names('rome and').length, 5);
  assert.equal(names('rome').length, 26);
});

test('search: full-width, letter case and outer spaces are folded', () => {
  assert.deepEqual(names('ＲＯＭＥ'), names('rome'));
  assert.deepEqual(names('  PANTHEON  '), ['Pantheon', 'Panthéon']);
});

test('search: exactness first, then name > tags > summary, then oldest first', () => {
  const rom = names('rom');
  assert.equal(rom[0], 'Roman Forum and Imperial Fora'); // name starts with it
  assert.deepEqual(rom.slice(1, 4), ['Cloaca Maxima', 'Aqua Appia', 'Domus Aurea']); // tag Rome / Romanesque, by year
  assert.equal(rom[rom.length - 1], 'Santa Maria presso San Satiro'); // only inside a word (trompe l'oeil)
  assert.equal(searchSplit('rom').more.length, 2); // summary only: behind Other Possible Outcomes
});

test('search: no match gives nothing', () => {
  assert.deepEqual(searchSplit('zzqx'), { main: [], more: [] });
  assert.deepEqual(searchSplit('   '), { main: [], more: [] });
});

test('N1 search: a curly apostrophe (iPhone keyboard) finds names with a straight one', () => {
  const named = BUILDINGS.filter((b) => b.name.includes("'"));
  assert.ok(named.length >= 18, `${named.length} names with an apostrophe`);
  for (const b of named) {
    const typed = b.name.replace(/'/g, '’');
    assert.equal(search(typed)[0]?.id, b.id, `"${typed}"`);
    assert.equal(search(b.name.replace(/'/g, '‘'))[0]?.id, b.id);
  }
});

test('recent texts: "Rome" and "rome" are one entry, the spelling typed last stays', async () => {
  const { addRecentText, recentTexts } = await import('./recent');
  addRecentText('Rome');
  addRecentText('Gaudi');
  addRecentText('rome');
  assert.deepEqual(recentTexts(), ['rome', 'Gaudi']);
  addRecentText('ROME');
  assert.deepEqual(recentTexts(), ['ROME', 'Gaudi']);
});

test('N3 recents: damaged saved data gives empty lists', async () => {
  const { recentTexts, recentBuildings } = await import('./recent');
  for (const v of ['{}', 'null', '"x"', '[1,{}]', 'not json']) {
    localStorage.setItem('gc-atlas:recent-text', v);
    localStorage.setItem('gc-atlas:recent-building', v);
    assert.ok(Array.isArray(recentTexts()) && recentTexts().every((t) => typeof t === 'string'), v);
    assert.ok(Array.isArray(recentBuildings()), v);
  }
});

test('R5 typed text: an emptied search box is kept as empty over a reload', async () => {
  const { saveDraft, loadDraft } = await import('./draft');
  saveDraft('');
  assert.equal(loadDraft(), '');
  saveDraft(null);
  assert.equal(loadDraft(), null);
});

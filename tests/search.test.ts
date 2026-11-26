import assert from 'node:assert/strict';
import test from 'node:test';
import { categoryList, listOf, searchSplit } from '../src/lib/search';

// Rules: Project doc gc/search-rules.md (2026-11-25)
const names = (q: string) => searchSplit(q).main.map((b) => b.name);

test('search: one letter keeps only names and tags that start with it, oldest first', () => {
  const v = names('v');
  assert.deepEqual(v.slice(0, 5), ['Valle dei Templi', 'Villa Pojana', 'Villa Barbaro', 'Villa Badoer', 'Villa Foscari']);
  assert.ok(!v.some((n) => /pavillon/i.test(n)));
  assert.deepEqual(searchSplit('7'), { main: [], more: [] });
});

test('search: Chinese is a plain "contains" search', () => {
  assert.deepEqual(names('教堂'), ['Notre-Dame de Mantes-la-Jolie', 'Reims Cathedral', "Basilica di San Francesco d'Assisi"]);
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

test('category: a picked tag lists exactly that category, oldest first; a typed style name is a search', () => {
  const list = categoryList('Baroque');
  assert.ok(list.length > 0 && list.every((b) => b.eras.includes('baroque')));
  assert.deepEqual(listOf('Baroque', 'era'), { main: list, more: [] });
  assert.equal(searchSplit('Baroque').more.length, 1);
});

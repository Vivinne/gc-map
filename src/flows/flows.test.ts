/* Flows: a picked tag lists its category (not a search); a typed style name is a search. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ERAS } from '../data';
import { categoryList } from '../features/category';
import { searchSplit } from '../features/search';
import { listOf } from './lists';

test('category: a picked tag lists exactly that category, oldest first; a typed style name is a search', () => {
  const list = categoryList('Baroque');
  assert.ok(list.length > 0 && list.every((b) => b.eras.includes('baroque')));
  assert.deepEqual(listOf('Baroque', 'era'), { main: list, more: [] });
  assert.equal(searchSplit('Baroque').more.length, 1);
});

test('lists: a search lists its matches; a tag its category; nothing for an empty search', () => {
  assert.deepEqual(listOf('villa', 'results'), searchSplit('villa'));
  assert.deepEqual(listOf('villa', 'preview'), searchSplit('villa'));
  assert.deepEqual(listOf('', 'results'), { main: [], more: [] });
  assert.deepEqual(listOf('No such tag', 'era'), { main: [], more: [] });
});

test('category: every tag lists only its category, oldest first; a building with two categories is in both', () => {
  for (const era of Object.values(ERAS)) {
    const list = categoryList(era.label);
    assert.ok(list.length > 0, era.label);
    assert.ok(list.every((b) => b.eras.includes(era.id)), era.label);
    for (let i = 1; i < list.length; i++) assert.ok((list[i - 1]!.y0 ?? Infinity) <= (list[i]!.y0 ?? Infinity), era.label);
  }
  assert.deepEqual(categoryList(''), []);
});

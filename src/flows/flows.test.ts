/* Flows: a picked tag lists its category (not a search); a typed style name is a search. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { categoryList } from '../features/category';
import { searchSplit } from '../features/search';
import { listOf } from './lists';

test('category: a picked tag lists exactly that category, oldest first; a typed style name is a search', () => {
  const list = categoryList('Baroque');
  assert.ok(list.length > 0 && list.every((b) => b.eras.includes('baroque')));
  assert.deepEqual(listOf('Baroque', 'era'), { main: list, more: [] });
  assert.equal(searchSplit('Baroque').more.length, 1);
});

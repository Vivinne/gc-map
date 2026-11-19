import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILDINGS } from '../src/lib/model';
import { search } from '../src/lib/search';

/** Browser storage for the tests (localStorage, sessionStorage) */
class Store {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v));
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}
const g = globalThis as unknown as Record<string, unknown>;
g.window = g;
g.localStorage = new Store();
g.sessionStorage = new Store();

test('N1 search: a curly apostrophe (iPhone keyboard) finds names with a straight one', () => {
  const named = BUILDINGS.filter((b) => b.name.includes("'"));
  assert.ok(named.length >= 19, `${named.length} names with an apostrophe`);
  for (const b of named) {
    const typed = b.name.replace(/'/g, '’');
    assert.equal(search(typed)[0]?.id, b.id, `"${typed}"`);
    assert.equal(search(b.name.replace(/'/g, '‘'))[0]?.id, b.id);
  }
});

test('N2 history: a reload keeps every step (no 50-step limit)', async () => {
  const { saveStack, loadStack, EMPTY_SCREEN } = await import('../src/lib/nav');
  const stack = [EMPTY_SCREEN, ...Array.from({ length: 300 }, (_, i) => ({ q: `q${i}`, list: 'results' as const, group: [], b: '' }))];
  saveStack(stack);
  assert.equal(loadStack()?.length, 301);
  assert.equal(loadStack()?.[1]?.q, 'q0');
});

test('recent texts: "Rome" and "rome" are one entry, the spelling typed last stays', async () => {
  const { addRecentText, recentTexts } = await import('../src/lib/recent');
  addRecentText('Rome');
  addRecentText('Gaudi');
  addRecentText('rome');
  assert.deepEqual(recentTexts(), ['rome', 'Gaudi']);
  addRecentText('ROME');
  assert.deepEqual(recentTexts(), ['ROME', 'Gaudi']);
});

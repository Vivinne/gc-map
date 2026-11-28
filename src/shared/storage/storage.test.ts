/* S3 storage, layer 1: reads and writes that never throw (equivalence: works / blocked / damaged / full). */
import { test } from 'node:test';
import assert from 'node:assert/strict';

type Store = { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void };
const g = globalThis as unknown as Record<string, unknown>;
const mem = (): Store => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
};
const blocked: Store = {
  getItem: () => { throw new Error('SecurityError'); },
  setItem: () => { throw new Error('SecurityError'); },
  removeItem: () => { throw new Error('SecurityError'); },
};
const full = (): Store => ({ ...mem(), setItem: () => { throw new Error('QuotaExceededError'); } });
const use = (local: Store, session: Store) => {
  g.window = { localStorage: local, sessionStorage: session };
};

test('storage: values saved for good come back, under the gc-atlas: prefix', async () => {
  const { load, save } = await import('./index');
  const local = mem();
  use(local, mem());
  save('k1', ['a', 'b']);
  assert.deepEqual(load('k1', []), ['a', 'b']);
  assert.equal(local.getItem('gc-atlas:k1'), '["a","b"]');
  assert.equal(load('missing', 'fallback'), 'fallback');
});

test('storage: damaged saved data gives the fallback', async () => {
  const { load } = await import('./index');
  const local = mem();
  local.setItem('gc-atlas:bad', '{not json');
  use(local, mem());
  assert.deepEqual(load('bad', []), []);
});

test('storage: blocked storage never throws; values live in memory for this visit', async () => {
  const { load, save, sessionGet, sessionSet, sessionRemove } = await import('./index');
  use(blocked, blocked);
  assert.doesNotThrow(() => save('k2', [1]));
  assert.deepEqual(load('k2', []), [1]);
  assert.equal(sessionGet('x'), null);
  assert.doesNotThrow(() => sessionSet('x', '1'));
  assert.doesNotThrow(() => sessionRemove('x'));
});

test('storage: a full storage never throws', async () => {
  const { load, save, sessionSet } = await import('./index');
  use(full(), full());
  assert.doesNotThrow(() => save('k3', 'v'));
  assert.equal(load('k3', ''), 'v');
  assert.doesNotThrow(() => sessionSet('x', '1'));
});

test('storage: per-tab values are read, written and removed as plain text', async () => {
  const { sessionGet, sessionSet, sessionRemove } = await import('./index');
  const session = mem();
  use(mem(), session);
  sessionSet('gc-map:t', '');
  assert.equal(sessionGet('gc-map:t'), '');
  sessionRemove('gc-map:t');
  assert.equal(sessionGet('gc-map:t'), null);
});

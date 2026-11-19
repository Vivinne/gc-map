import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ADDRESS_GAP, createAddressWriter, type Clock } from '../src/lib/address';

/** A fake page and clock: timers run when the test moves time forward */
function setup(opts: { refuse?: (n: number) => boolean } = {}) {
  let now = 0;
  let url = '/gc-map/';
  const writes: number[] = [];
  let tries = 0;
  const timers = new Map<number, { at: number; f: () => void }>();
  let id = 0;
  const clock: Clock = {
    now: () => now,
    later: (f, ms) => (timers.set(++id, { at: now + ms, f }), id),
    cancel: (t) => void timers.delete(t as number),
  };
  const w = createAddressWriter(
    () => url,
    (u) => {
      if (opts.refuse?.(tries++)) throw new Error('SecurityError: replaceState more than 100 times per 10 seconds');
      writes.push(now);
      url = u;
    },
    clock,
  );
  const advance = (ms: number) => {
    const end = now + ms;
    for (;;) {
      const next = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      timers.delete(next[0]);
      now = next[1].at;
      next[1].f();
    }
    now = end;
  };
  return { w, writes, advance, url: () => url };
}

/** Most writes inside any 10 s window */
const maxPer10s = (t: number[]) => {
  let m = 0;
  for (let i = 0, j = 0; i < t.length; i++) {
    while (t[i]! - t[j]! >= 10000) j++;
    m = Math.max(m, i - j + 1);
  }
  return m;
};

test('B9 address: the same address is not written again', () => {
  const s = setup();
  s.w.set('/gc-map/?q=rome');
  s.advance(1000);
  for (let i = 0; i < 50; i++) {
    s.w.set('/gc-map/?q=rome');
    s.advance(300);
  }
  assert.equal(s.writes.length, 1);
});

test('B9 address: 1,000 changes in 10 s give at most 41 writes in any 10 s', () => {
  const s = setup();
  for (let i = 0; i < 3000; i++) {
    s.w.set(`/gc-map/?m=12.48,41.89,${(i % 700) / 100}`);
    s.advance(10);
  }
  s.advance(1000);
  assert.ok(maxPer10s(s.writes) <= 10000 / ADDRESS_GAP + 1, `max ${maxPer10s(s.writes)} per 10 s`);
  for (let i = 1; i < s.writes.length; i++) assert.ok(s.writes[i]! - s.writes[i - 1]! >= ADDRESS_GAP);
});

test('B9 address: the newest address always ends up written', () => {
  const s = setup();
  s.w.set('/gc-map/?q=a');
  s.w.set('/gc-map/?q=b');
  s.w.set('/gc-map/?q=c');
  assert.equal(s.url(), '/gc-map/?q=a');
  s.advance(ADDRESS_GAP);
  assert.equal(s.url(), '/gc-map/?q=c');
});

test('B9 address: leaving the page writes the waiting address at once', () => {
  const s = setup();
  s.w.set('/gc-map/?q=a');
  s.w.set('/gc-map/?q=b&b=pantheon-rome');
  s.w.flush();
  assert.equal(s.url(), '/gc-map/?q=b&b=pantheon-rome');
});

test('B9 address: a write the browser refuses does not throw', () => {
  const s = setup({ refuse: (n) => n === 0 });
  assert.doesNotThrow(() => s.w.set('/gc-map/?q=a'));
  s.advance(ADDRESS_GAP);
  s.w.set('/gc-map/?q=b');
  s.advance(ADDRESS_GAP);
  assert.equal(s.url(), '/gc-map/?q=b');
});

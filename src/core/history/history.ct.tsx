/* C1 history, layer 3A: the door's contract (gc/test-modules.md, history: give, get back, change, leave alone). */
import { expect, test } from '@playwright/experimental-ct-react';
import type { Page } from '@playwright/test';
import { HistoryStory } from './history.story';

const S = (o: Record<string, unknown> = {}) => ({ q: '', list: '', group: [], b: '', ...o });
const stack = async (page: Page) => JSON.parse((await page.locator('#stack').textContent())!) as Record<string, unknown>[];
const saved = (page: Page) => page.evaluate(() => JSON.parse(sessionStorage.getItem('gc-map:history') ?? 'null') as unknown);
const call = async (page: Page, f: string, ...args: unknown[]) => {
  await page.waitForFunction(() => !!window.historyTest);
  await page.evaluate(([name, a]) => (window.historyTest.api as unknown as Record<string, (...x: unknown[]) => void>)[name as string]!(...(a as unknown[])), [f, args] as const);
};

test('push: a new screen on top; the screen left keeps its notes; the screen already on top is not added again', async ({ mount, page }) => {
  await mount(<HistoryStory />);
  await call(page, 'push', S({ q: 'villa', list: 'results' }));
  await page.evaluate(() => window.historyTest.api.push({ q: 'villa', list: 'results', group: [], b: 'x' }, () => ({ scroll: 120 })));
  await call(page, 'push', S({ q: 'villa', list: 'results', b: 'x' }));
  const s = await stack(page);
  expect(s.map((x) => [x.q, x.b])).toEqual([['', ''], ['villa', ''], ['villa', 'x']]);
  expect(s[1]!.scroll).toBe(120);
  expect(await saved(page)).toEqual(s);
});

test('replace: the top gives way; when the new screen equals the one under it, that one comes back (no twin steps)', async ({ mount, page }) => {
  await mount(<HistoryStory />);
  await call(page, 'push', S({ list: 'preview' }));
  await call(page, 'replace', S({ q: 'villa', list: 'results' }));
  expect((await stack(page)).map((x) => x.list)).toEqual(['', 'results']);
  await call(page, 'replace', S());
  expect(await stack(page)).toHaveLength(1);
});

test('update: changes the top in place; giving back the same screen changes nothing (no save)', async ({ mount, page }) => {
  await mount(<HistoryStory />);
  await call(page, 'push', S({ b: 'x' }));
  await page.evaluate(() => {
    const before = window.historyTest.api.stackRef.current;
    window.historyTest.api.update((t) => t);
    (window as unknown as { same: () => boolean }).same = () => window.historyTest.api.stackRef.current === before;
  });
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => (window as unknown as { same: () => boolean }).same())).toBe(true);
  expect((await stack(page)).length).toBe(2);
  await page.evaluate(() => window.historyTest.api.update((t) => ({ ...t, home: { lng: 1, lat: 2, zoom: 3 } })));
  expect((await stack(page))[1]!.home).toEqual({ lng: 1, lat: 2, zoom: 3 });
  expect((await stack(page))[0]!.home).toBeUndefined();
});

test('back and reset: back takes the top step; reset leaves only the screen given', async ({ mount, page }) => {
  await mount(<HistoryStory />);
  await call(page, 'push', S({ q: 'a', list: 'results' }));
  await call(page, 'push', S({ q: 'a', list: 'results', b: 'x' }));
  await call(page, 'back');
  expect((await stack(page)).map((x) => x.b)).toEqual(['', '']);
  await call(page, 'reset', S());
  expect(await stack(page)).toEqual([S()]);
  expect(await saved(page)).toEqual([S()]);
});

// T5-1 (found in test batch 5): \uff1c with one step left empties the history (the page then has no screen); today only the
// \uff1c flow calls it, and it checks first. The door itself should keep the last step.
test('back on the only step keeps it', async ({ mount, page }) => {
  test.fail(true, 'T5-1');
  await mount(<HistoryStory />);
  await call(page, 'back');
  expect(await stack(page)).toHaveLength(1);
});

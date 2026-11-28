/*
 * Layer 4.4 at full speed: one long sequence with 80 ms between steps and no waiting for the map. Counts how often
 * the page writes its address and its saved state; the busiest 10 s and 30 s must stay well under the browsers'
 * limits (Safari: 100 address writes in 30 s), and are recorded for the old/new comparison.
 */
import { test } from '@playwright/test';
import { ACTIONS, expect, fresh, problems, record } from './support/site';

const LIMIT_30S = 80;

test('full speed: 300 steps', async ({ page, isMobile }, info) => {
  test.setTimeout(10 * 60 * 1000);
  await page.addInitScript(() => {
    const w = window as unknown as { writes: { address: number[]; storage: number[] } };
    w.writes = { address: [], storage: [] };
    const rs = history.replaceState.bind(history);
    history.replaceState = (...a: Parameters<History['replaceState']>) => (w.writes.address.push(performance.now()), rs(...a));
    const ps = history.pushState.bind(history);
    history.pushState = (...a: Parameters<History['pushState']>) => (w.writes.address.push(performance.now()), ps(...a));
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k: string, v: string) {
      w.writes.storage.push(performance.now());
      return set.call(this, k, v);
    };
  });
  await fresh(page);
  // at full speed a control can go before it is pressed: give up on it quickly and go on
  page.setDefaultTimeout(1500);
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const names = Object.keys(ACTIONS).filter((n) => !['reload', 'slash'].includes(n));
  const bad: string[] = [];
  for (let k = 0; k < 300; k++) {
    const can: string[] = [];
    for (const n of names) if (await ACTIONS[n]!.can(page, isMobile)) can.push(n);
    const n = can[Math.floor(rand() * can.length)]!;
    await ACTIONS[n]!.run(page, isMobile).catch(() => {});
    await page.waitForTimeout(80);
  }
  page.setDefaultTimeout(10000);
  await page.waitForTimeout(2000);
  for (const p of await problems(page, isMobile)) bad.push(p);
  const busiest = await page.evaluate(() => {
    const w = window as unknown as { writes: { address: number[]; storage: number[] } };
    const most = (ts: number[], span: number) => ts.reduce((m, t, i) => Math.max(m, ts.slice(i).filter((u) => u - t < span).length), 0);
    return { address10s: most(w.writes.address, 10000), address30s: most(w.writes.address, 30000), storage10s: most(w.writes.storage, 10000), total: w.writes.address.length };
  });
  record({ project: info.project.name, test: 'full speed', step: 'counts', ...busiest });
  info.annotations.push({ type: 'writes', description: JSON.stringify(busiest) });
  expect(bad).toEqual([]);
  expect(busiest.address30s).toBeLessThanOrEqual(LIMIT_30S);
});

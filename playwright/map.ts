/* Map test helpers: street tiles served from the test (no network), and reading markers off the page. */
import { expect, type Page } from '@playwright/test';

/**
 * Street tiles. 'ok': the tile index and empty tiles answer; 'fail': the tile server does not answer;
 * 'slow': the index answers, the tiles never do. Every other outside request is refused.
 */
export async function streetTiles(page: Page, mode: 'ok' | 'fail' | 'slow') {
  await page.unroute(/openfreemap/).catch(() => {});
  await page.route(/openfreemap/, (r) => {
    const url = r.request().url();
    if (mode === 'fail') return r.abort();
    if (/\/planet$/.test(url)) return r.fulfill({ json: { tilejson: '3.0.0', tiles: ['https://tiles.openfreemap.org/t/{z}/{x}/{y}.pbf'], minzoom: 0, maxzoom: 14 } });
    if (mode === 'slow') return;
    return r.fulfill({ status: 200, contentType: 'application/x-protobuf', body: Buffer.alloc(0) });
  });
}

/** Waits for the map to be on screen and resting */
export async function mapReady(page: Page) {
  await expect.poll(() => page.evaluate(() => window.mapTest?.events.includes('ready')), { timeout: 20000 }).toBe(true);
  await expect.poll(() => page.evaluate(() => window.mapTest.events.some((e) => e.startsWith('view:'))), { timeout: 10000 }).toBe(true);
}

/** Runs a camera action and waits until the map has stopped after it */
export async function andRest(page: Page, act: () => Promise<unknown>) {
  const n = await page.evaluate(() => window.mapTest.events.filter((e) => e.startsWith('view:')).length);
  await act();
  await expect.poll(() => page.evaluate(() => window.mapTest.events.filter((e) => e.startsWith('view:')).length), { timeout: 10000 }).toBeGreaterThan(n);
  await page.waitForTimeout(100);
}

export interface Marks {
  dots: Record<string, { x: number; y: number }>;
  nums: { ids: string[]; x: number; y: number; n: string }[];
  names: string[];
}

/** Dots, number points and names now drawn, in page pixels */
export function marks(page: Page): Promise<Marks> {
  return page.evaluate(() => {
    const out: Marks = { dots: {}, nums: [], names: [] };
    for (const c of document.querySelectorAll('svg.overlay circle.mk.dot')) {
      const r = c.getBoundingClientRect();
      out.dots[c.getAttribute('data-key')!] = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }
    for (const g of document.querySelectorAll('svg.overlay g.mk.num')) {
      const t = (g.getAttribute('transform') ?? '').match(/translate\(([-\d.]+),([-\d.]+)\)/)!;
      const box = g.closest('svg')!.getBoundingClientRect();
      out.nums.push({ ids: g.getAttribute('data-key')!.split('~'), x: box.x + Number(t[1]), y: box.y + Number(t[2]), n: g.querySelector('.num-n')?.textContent ?? '' });
    }
    for (const g of document.querySelectorAll('svg.overlay g.mk.name')) out.names.push(g.getAttribute('data-key')!);
    return out;
  });
}

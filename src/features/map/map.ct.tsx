/* F5 map, layer 2: the map alone with offline basemap and street tiles served by the test (gc/test-modules.md, map). */
import { expect, test } from '@playwright/experimental-ct-react';
import { expectAccessible, expectPressFeedback } from '../../../playwright/checks';
import { andRest, mapReady, marks, streetTiles } from '../../../playwright/map';
import { BUILDINGS } from '../../data';
import { MapStory } from './map.story';

// five buildings far apart (five countries), and the free part of the map a desktop panel leaves
const SPREAD = [...new Map(BUILDINGS.map((b) => [b.nation, b])).values()].slice(0, 5).map((b) => b.id);
const DESK = { top: 0, right: 48, bottom: 0, left: 452 };
// phone: the search box on top, a half-screen sheet below
const PHONE = { top: 64, right: 0, bottom: 330, left: 0 };

test.beforeEach(async ({ page }) => {
  await streetTiles(page, 'ok');
});

test.describe('map (F5)', () => {
  test('markers are drawn and clickable before the map library arrives (P2)', async ({ mount, page }) => {
    let release = () => {};
    const held = new Promise<void>((r) => (release = r));
    await page.route(/maplibre-gl/, async (r) => (await held, r.continue()));
    await mount(<MapStory />);
    const dot = page.locator('.map-early svg.overlay circle.mk.dot').first();
    await expect(dot).toBeVisible();
    const id = await dot.getAttribute('data-key');
    await dot.click();
    expect(await page.evaluate(() => window.mapTest.events)).toContain(`select:${id}`);
    release();
    await mapReady(page);
    await expect(page.locator('.map-early')).toHaveCount(0);
  });

  test('ready once, then the view each time the map stops', async ({ mount, page }) => {
    await mount(<MapStory />);
    await mapReady(page);
    await andRest(page, () => page.getByRole('button', { name: 'Zoom in' }).click());
    const ev = await page.evaluate(() => window.mapTest.events);
    expect(ev.filter((e) => e === 'ready')).toHaveLength(1);
    const zooms = ev.filter((e) => e.startsWith('view:')).map((e) => Number(e.slice(5)));
    expect(zooms.at(-1)! - zooms.at(-2)!).toBeCloseTo(1, 1);
  });

  test('no WebGL: the fallback page, "fail" reported, no zoom buttons or scale bar', async ({ mount, page }) => {
    await page.evaluate(() => {
      const get = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...rest: unknown[]) {
        return /webgl/.test(kind) ? null : (get as (...a: unknown[]) => unknown).call(this, kind, ...rest);
      } as typeof get;
    });
    await mount(<MapStory />);
    await expect(page.locator('.map-fail .fallback-test')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.mapTest.events)).toContain('fail');
    await expect(page.locator('.ctrls, .scale')).toHaveCount(0);
  });

  test('street tiles fail: notice with Retry; Retry asks again and the notice goes', async ({ mount, page }) => {
    await streetTiles(page, 'fail');
    await mount(<MapStory start={{ lng: 12.49, lat: 41.89, zoom: 8 }} />);
    const notice = page.locator('.map-tiles');
    await expect(notice).toContainText("Map detail didn't load.", { timeout: 15000 });
    await expectPressFeedback(page, notice.getByRole('button', { name: 'Retry' }));
    await streetTiles(page, 'ok');
    await notice.getByRole('button', { name: 'Retry' }).click();
    await expect(notice).toHaveCount(0);
    await page.waitForTimeout(1500);
    await expect(notice).toHaveCount(0);
  });

  test('street tiles that never come count as failed after 10 s (zoom 6 and closer only)', async ({ mount, page }) => {
    test.slow();
    await streetTiles(page, 'slow');
    await mount(<MapStory start={{ lng: 12.49, lat: 41.89, zoom: 8 }} />);
    await mapReady(page);
    await expect(page.locator('.map-tiles')).toHaveCount(0);
    await expect(page.locator('.map-tiles')).toBeVisible({ timeout: 12000 });
  });

  // T4-1 (user, 2026-11-28): the notice shows only at zoom 6 or closer, where street detail is drawn
  test('tile server not answering: no notice on the Europe view; it shows once the map is at zoom 6, and goes when it is back out', async ({ mount, page }) => {
    await streetTiles(page, 'fail');
    await mount(<MapStory />);
    await mapReady(page);
    await page.waitForTimeout(1000);
    await expect(page.locator('.map-tiles')).toHaveCount(0);
    await andRest(page, () => page.evaluate(() => window.mapTest.map()!.moveTo({ lng: 12.49, lat: 41.89, zoom: 7 })));
    await expect(page.locator('.map-tiles')).toBeVisible();
    await andRest(page, () => page.evaluate(() => window.mapTest.map()!.moveTo({ lng: 12.49, lat: 41.89, zoom: 4 })));
    await expect(page.locator('.map-tiles')).toHaveCount(0);
  });
});

test.describe('camera (F5a)', () => {
  test('framing: every building inside the free part, each standing alone', async ({ mount, page, isMobile }) => {
    const PANEL = isMobile ? PHONE : DESK;
    await mount(<MapStory ids={SPREAD} searched compact={isMobile} padding={PANEL} />);
    await mapReady(page);
    await andRest(page, () => page.evaluate((ids) => window.mapTest.map()!.fitTo(window.mapTest.pick(ids)), SPREAD));
    const m = await marks(page);
    const vw = page.viewportSize()!;
    for (const id of SPREAD) {
      const d = m.dots[id];
      expect(d, `${id} stands alone`).toBeTruthy();
      expect(d!.x).toBeGreaterThan(PANEL.left);
      expect(d!.x).toBeLessThan(vw.width - PANEL.right);
      expect(d!.y).toBeGreaterThan(PANEL.top);
      expect(d!.y).toBeLessThan(vw.height - PANEL.bottom);
    }
    expect(await page.evaluate((ids) => window.mapTest.map()!.framed(window.mapTest.pick(ids)), SPREAD)).toBe(true);
  });

  test('opening a building already shown alone: it moves to the middle of the free part, the zoom stays', async ({ mount, page, isMobile }) => {
    const PANEL = isMobile ? PHONE : DESK;
    await mount(<MapStory compact={isMobile} padding={PANEL} />);
    await mapReady(page);
    const m = await marks(page);
    const vw = page.viewportSize()!;
    const id = Object.entries(m.dots).find(([, d]) => d.x > PANEL.left + 40 && d.x < vw.width - PANEL.right - 40 && d.y > PANEL.top + 40 && d.y < vw.height - PANEL.bottom - 40)![0];
    const z0 = (await page.evaluate(() => window.mapTest.map()!.view()))!.zoom;
    await andRest(page, () => page.evaluate((i) => window.mapTest.map()!.focus(window.mapTest.pick([i])[0]!, true), id));
    expect((await page.evaluate(() => window.mapTest.map()!.view()))!.zoom).toBeCloseTo(z0, 3);
    const d = (await marks(page)).dots[id]!;
    expect(Math.abs(d.x - (PANEL.left + (vw.width - PANEL.right - PANEL.left) / 2))).toBeLessThan(3);
    expect(Math.abs(d.y - (PANEL.top + (vw.height - PANEL.bottom - PANEL.top) / 2))).toBeLessThan(3);
  });

  test('opening a building inside a number point: zooms in until it stands alone', async ({ mount, page }) => {
    await mount(<MapStory />);
    await mapReady(page);
    const big = (await marks(page)).nums.sort((a, b) => b.ids.length - a.ids.length)[0]!;
    const z0 = (await page.evaluate(() => window.mapTest.map()!.view()))!.zoom;
    const id = big.ids[0]!;
    await andRest(page, () => page.evaluate((i) => window.mapTest.map()!.focus(window.mapTest.pick([i])[0]!, true), id));
    expect((await page.evaluate(() => window.mapTest.map()!.view()))!.zoom).toBeGreaterThan(z0);
    expect((await marks(page)).dots[id], 'stands alone').toBeTruthy();
  });

  test('a number point opened: its buildings split apart, no further than the view that holds them all', async ({ mount, page }) => {
    await mount(<MapStory />);
    await mapReady(page);
    const num = (await marks(page)).nums.find((g) => g.ids.length >= 3 && g.ids.length <= 8)!;
    await andRest(page, () => page.evaluate((ids) => window.mapTest.map()!.split(window.mapTest.pick(ids)), num.ids));
    const m = await marks(page);
    const vw = page.viewportSize()!;
    for (const id of num.ids) {
      const at = m.dots[id] ?? m.nums.find((g) => g.ids.includes(id));
      expect(at, id).toBeTruthy();
      expect(at!.x).toBeGreaterThan(0);
      expect(at!.x).toBeLessThan(vw.width);
    }
    expect(m.nums.filter((g) => g.ids.some((i) => num.ids.includes(i))).length, 'it split').toBeLessThan(num.ids.length);
    // buildings in different places still merged: only because zooming further would lose some of them
    const place = (i: string) => { const b = BUILDINGS.find((x) => x.id === i)!; return `${b.lat.toFixed(4)},${b.lng.toFixed(4)}`; };
    const mixed = m.nums.filter((g) => g.ids.some((i) => num.ids.includes(i)) && new Set(g.ids.map(place)).size > 1);
    if (mixed.length) {
      const v = (await page.evaluate(() => window.mapTest.map()!.view()))!;
      await andRest(page, () => page.evaluate((x) => window.mapTest.map()!.moveTo(x), { ...v, zoom: v.zoom + 0.3 }));
      const closer = await marks(page);
      const seen = num.ids.filter((i) => { const p = closer.dots[i] ?? closer.nums.find((g) => g.ids.includes(i)); return p && p.x > 16 && p.x < vw.width - 16 && p.y > 16 && p.y < vw.height - 16; });
      // (16 px: the map keeps markers this far from the edge, R10)
      expect(seen.length, 'a closer view would lose some').toBeLessThan(num.ids.length);
    }
  });

  test('stop: a moving map stops where it is', async ({ mount, page }) => {
    await mount(<MapStory />);
    await mapReady(page);
    await page.evaluate((ids) => window.mapTest.map()!.fitTo(window.mapTest.pick(ids)), SPREAD.slice(0, 2));
    await page.waitForTimeout(120);
    const at = await page.evaluate(() => (window.mapTest.map()!.stop(), window.mapTest.map()!.view()));
    await page.waitForTimeout(600);
    const later = await page.evaluate(() => window.mapTest.map()!.view());
    expect(later!.lng).toBeCloseTo(at!.lng, 6);
    expect(later!.zoom).toBeCloseTo(at!.zoom, 6);
  });

  test('back to a saved view (\uff1c)', async ({ mount, page }) => {
    await mount(<MapStory />);
    await mapReady(page);
    await andRest(page, () => page.evaluate(() => window.mapTest.map()!.moveTo({ lng: 12.49, lat: 41.89, zoom: 9 })));
    const v = await page.evaluate(() => window.mapTest.map()!.view());
    expect([v!.lng, v!.lat, v!.zoom].map((x) => Number(x.toFixed(2)))).toEqual([12.49, 41.89, 9]);
  });
});

test.describe('markers (F5b)', () => {
  test('a dot opens its building; a number point reports its buildings; its number is its size', async ({ mount, page }) => {
    await mount(<MapStory />);
    await mapReady(page);
    const m = await marks(page);
    const [id, d] = Object.entries(m.dots)[0]!;
    await page.mouse.click(d.x, d.y);
    const g = m.nums[0]!;
    expect(g.n).toBe(String(g.ids.length));
    await page.mouse.click(g.x, g.y);
    await expect.poll(() => page.evaluate(() => window.mapTest.events.filter((e) => /^(select|group):/.test(e)))).toEqual([`select:${id}`, `group:${g.ids.join('~')}`]);
  });

  test('keyboard: Tab reaches a marker, Enter opens it', async ({ mount, page }) => {
    await mount(<MapStory />);
    await mapReady(page);
    const first = page.locator('svg.overlay .mk[role="button"]').first();
    await first.focus();
    await page.keyboard.press('Enter');
    const key = await first.getAttribute('data-key');
    expect(await page.evaluate(() => window.mapTest.events.filter((e) => /^(select|group):/.test(e)))).toEqual([key!.includes('~') ? `group:${key}` : `select:${key}`]);
  });

  test('ink ring: on while the mouse points, off when it leaves and when the map moves; never on by itself', async ({ mount, page, isMobile }) => {
    test.skip(isMobile, 'pointing with a mouse');
    await mount(<MapStory />);
    await mapReady(page);
    await expect(page.locator('svg.overlay .mk.hot')).toHaveCount(0);
    const [id, d] = Object.entries((await marks(page)).dots)[0]!;
    await page.mouse.move(d.x, d.y);
    await expect(page.locator(`svg.overlay circle.mk.dot[data-key="${id}"]`)).toHaveClass(/\bhot\b/);
    await page.mouse.move(5, 5);
    await expect(page.locator('svg.overlay .mk.hot')).toHaveCount(0);
    await page.mouse.move(d.x, d.y);
    await andRest(page, () => page.evaluate(() => window.mapTest.map()!.moveTo({ lng: 2, lat: 45, zoom: 5 })));
    await expect(page.locator(`svg.overlay circle.mk.dot[data-key="${id}"].hot`)).toHaveCount(0);
  });

  test('a finger tap leaves no ring', async ({ mount, page, isMobile }) => {
    test.skip(!isMobile, 'touch');
    await mount(<MapStory compact />);
    await mapReady(page);
    const [, d] = Object.entries((await marks(page)).dots)[0]!;
    await page.touchscreen.tap(d.x, d.y);
    await page.waitForTimeout(300);
    await expect(page.locator('svg.overlay .mk.hot')).toHaveCount(0);
  });

  test('a building pointed at in a list rings on the map; rows off screen dim their markers', async ({ mount, page }) => {
    await mount(<MapStory ids={SPREAD} searched />);
    await mapReady(page);
    await andRest(page, () => page.evaluate((ids) => window.mapTest.map()!.fitTo(window.mapTest.pick(ids)), SPREAD));
    await page.evaluate((ids) => window.mapTest.set({ hover: ids[0], seen: ids.slice(0, 2) }), SPREAD);
    await expect(page.locator(`circle.mk.dot[data-key="${SPREAD[0]}"]`)).toHaveClass(/\bhot\b/);
    for (const id of SPREAD.slice(2)) await expect(page.locator(`circle.mk.dot[data-key="${id}"]`)).toHaveClass(/\bdim\b/);
    for (const id of SPREAD.slice(0, 2)) await expect(page.locator(`circle.mk.dot[data-key="${id}"]`)).not.toHaveClass(/\bdim\b/);
  });

  test('names: with no search at a wide view, only exam buildings are named; a search names its results', async ({ mount, page }) => {
    await mount(<MapStory />);
    await mapReady(page);
    const exam = new Set(BUILDINGS.filter((b) => b.exams.length > 0).map((b) => b.id));
    const named = (await marks(page)).names;
    expect(named.length).toBeGreaterThan(0);
    expect(named.filter((id) => !exam.has(id))).toEqual([]);
    await page.evaluate((ids) => window.mapTest.set({ ids, searched: true }), SPREAD);
    await andRest(page, () => page.evaluate((ids) => window.mapTest.map()!.fitTo(window.mapTest.pick(ids)), SPREAD));
    expect((await marks(page)).names.sort()).toEqual([...SPREAD].sort());
  });

  test('names stay off the scale bar, the source line and the zoom buttons', async ({ mount, page, isMobile }) => {
    await mount(<MapStory compact={isMobile} searched />);
    await mapReady(page);
    for (const v of [{ lng: 12.49, lat: 41.89, zoom: 12 }, { lng: 9.19, lat: 45.46, zoom: 11 }, { lng: 2.35, lat: 48.86, zoom: 11 }]) {
      await andRest(page, () => page.evaluate((x) => window.mapTest.map()!.moveTo(x), v));
      const hits = await page.evaluate(() => {
        const ui = [...document.querySelectorAll('.scale, .ctrls')].map((e) => e.getBoundingClientRect());
        const credit = document.querySelector('.credit')!;
        const range = document.createRange();
        range.selectNodeContents(credit);
        ui.push(range.getBoundingClientRect());
        const out: string[] = [];
        for (const t of document.querySelectorAll('svg.overlay .mk-label')) {
          const r = t.getBoundingClientRect();
          if (ui.some((u) => u.width && r.left < u.right && r.right > u.left && r.top < u.bottom && r.bottom > u.top)) out.push(t.textContent ?? '');
        }
        return out;
      });
      expect(hits, JSON.stringify(v)).toEqual([]);
    }
  });
});

test.describe('extras (F5d)', () => {
  test('+ and −: one step; with a card open, around its building', async ({ mount, page, isMobile }) => {
    test.skip(isMobile, 'phones zoom with two fingers');
    const PANEL = DESK;
    await mount(<MapStory padding={PANEL} />);
    await mapReady(page);
    const [id] = Object.entries((await marks(page)).dots).find(([, d]) => d.x > PANEL.left + 100)!;
    await page.evaluate((i) => window.mapTest.set({ selected: i }), id);
    const before = (await marks(page)).dots[id]!;
    const z0 = (await page.evaluate(() => window.mapTest.map()!.view()))!.zoom;
    await andRest(page, () => page.getByRole('button', { name: 'Zoom in' }).click());
    expect((await page.evaluate(() => window.mapTest.map()!.view()))!.zoom).toBeCloseTo(z0 + 1, 3);
    const after = await page.locator(`circle.mk.dot[data-key="${id}"], .sel-mark`).first().boundingBox();
    expect(Math.abs(after!.x + after!.width / 2 - before.x)).toBeLessThan(3);
    expect(Math.abs(after!.y + after!.height / 2 - before.y)).toBeLessThan(3);
    await andRest(page, () => page.getByRole('button', { name: 'Zoom out' }).click());
    expect((await page.evaluate(() => window.mapTest.map()!.view()))!.zoom).toBeCloseTo(z0, 3);
    await expectPressFeedback(page, page.getByRole('button', { name: 'Zoom in' }));
  });

  test('desktop: zoom buttons 16 px from the right, 24 px from the bottom; scale bar 16 px left of them on their bottom line (E1)', async ({ mount, page, isMobile }) => {
    test.skip(isMobile, 'desktop');
    await mount(<MapStory />);
    await mapReady(page);
    const vw = page.viewportSize()!;
    const z = (await page.locator('.ctrls').boundingBox())!;
    const s = (await page.locator('.scale').boundingBox())!;
    expect(Math.round(vw.width - (z.x + z.width))).toBe(16);
    expect(Math.round(vw.height - (z.y + z.height))).toBe(24);
    expect(Math.round(z.x - (s.x + s.width))).toBe(16);
    expect(Math.round(s.y + s.height)).toBe(Math.round(z.y + z.height));
  });

  test('phone: scale bar bottom left, the source line on the same bottom line, one line, inside the screen', async ({ mount, page, isMobile }) => {
    test.skip(!isMobile, 'phone');
    for (const width of [320, 375, 430]) {
      await page.setViewportSize({ width, height: 700 });
      const c = await mount(<MapStory compact />);
      await mapReady(page);
      const s = (await page.locator('.scale').boundingBox())!;
      const range = await page.evaluate(() => {
        const r = document.createRange();
        r.selectNodeContents(document.querySelector('.credit')!);
        const b = r.getBoundingClientRect();
        return { left: b.left, right: b.right, bottom: b.bottom, height: b.height, rects: r.getClientRects().length };
      });
      expect(Math.abs(range.bottom - (s.y + s.height)), `width ${width}`).toBeLessThan(2);
      expect(range.rects, `one line at ${width}`).toBe(1);
      expect(range.left).toBeGreaterThan(s.x + s.width);
      expect(range.right).toBeLessThanOrEqual(width);
      await c.unmount();
    }
  });

  test('phone: with the keyboard leaving no room, the source line hides', async ({ mount, page, isMobile }) => {
    test.skip(!isMobile, 'phone');
    await page.setViewportSize({ width: 390, height: 110 });
    await mount(<MapStory compact />);
    await expect(page.locator('.credit')).toHaveClass(/\boff\b/);
    await page.setViewportSize({ width: 390, height: 700 });
    await expect(page.locator('.credit')).not.toHaveClass(/\boff\b/);
  });

  test('accessibility (map controls and markers)', async ({ mount, page }) => {
    await mount(<MapStory />);
    await mapReady(page);
    await expectAccessible(page);
  });
});

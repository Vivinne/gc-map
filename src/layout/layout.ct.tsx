/* L1 layout, layer 2: panel frame, phone sheet, panel exit, covered part of the map (gc/test-modules.md, layout). */
import { expect, test } from '@playwright/experimental-ct-react';
import type { Page } from '@playwright/test';
import { expectAccessible } from '../../playwright/checks';
import { PanelStory, RoomStory } from './layout.story';
import { LEAVE_MS } from './Leave';

const box = async (page: Page, sel: string) => (await page.locator(sel).first().boundingBox())!;
const rootVar = (page: Page, name: string) => page.evaluate((n: string) => document.documentElement.style.getPropertyValue(n), name);
const sheetState = (page: Page) => page.locator('section.panel').getAttribute('class').then((c: string | null) => (c ?? '').match(/\b(fold|half|full)\b/)?.[1] ?? '');

/** Changes the story's props (once its test handle is there) */
async function set(page: Page, p: Record<string, unknown>) {
  await page.waitForFunction(() => !!window.layoutTest);
  await page.evaluate((x) => window.layoutTest.set(x), p);
}

/** Drags the phone sheet's title area by dy px (a finger) */
async function drag(page: Page, dy: number) {
  const h = await box(page, '.p-head');
  const x = h.x + 40, y = h.y + 8;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 5; i++) await page.mouse.move(x, y + (dy * i) / 5);
  await page.mouse.up();
  await page.waitForTimeout(350);
}

test.describe('desktop panel', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop');

  test('beside the rail: 16 px right of it, 16 px from the top, 380 px wide', async ({ mount, page }) => {
    await mount(<PanelStory />);
    await page.waitForTimeout(300);
    const p = await box(page, 'section.panel');
    expect([Math.round(p.x), Math.round(p.y), Math.round(p.width)]).toEqual([56 + 16, 16, 380]);
  });

  // SPEC 4 (user, 2026-11-28, T4-2): a long panel runs to 16 px above the bottom of the page
  test('a long panel: down to 16 px above the bottom; its title row stays, the rows scroll', async ({ mount, page }) => {
    await mount(<PanelStory rows={60} />);
    await page.waitForTimeout(300);
    const p = await box(page, 'section.panel');
    expect(Math.round(p.y + p.height)).toBe(page.viewportSize()!.height - 16);
    await page.locator('.p-body').evaluate((e) => (e.scrollTop = 400));
    await expect(page.getByRole('button', { name: 'Close' })).toBeInViewport();
  });

  test('a new page plays the entry once; the panel takes the focus when nothing has it (A4)', async ({ mount, page }) => {
    await mount(<PanelStory />);
    await expect(page.locator('section.panel')).toHaveCSS('animation-name', 'drawer-in');
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await set(page, { resetKey: 'b' });
    await expect(page.locator('section.panel')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Back' })).toBeFocused();
  });

  test('a screen left scrolled comes back at the same place (\uff1c)', async ({ mount, page }) => {
    await mount(<PanelStory rows={60} scroll={320} />);
    await expect.poll(() => page.locator('.p-body').evaluate((e) => e.scrollTop)).toBe(320);
  });
});

test.describe('leaving', () => {
  test('a closed panel slides away, cannot be clicked on its way out, and is gone after the exit time', async ({ mount, page, isMobile }) => {
    await mount(<PanelStory mobile={isMobile} />);
    await page.waitForTimeout(300);
    const row = await box(page, '.story-row button');
    await page.waitForFunction(() => !!window.layoutTest);
    const t0 = await page.evaluate(() => (window.layoutTest.set({ show: false }), performance.now()));
    const leaving = page.locator('.leave');
    await expect(leaving).toHaveAttribute('aria-hidden', 'true');
    await expect(leaving).toHaveAttribute('inert', '');
    await expect(leaving.locator('section.panel')).toHaveCSS('animation-name', isMobile ? 'out-d' : 'out-l');
    await page.mouse.click(row.x + 10, row.y + 10);
    expect(await page.evaluate(() => window.layoutTest.clicks)).toBe(0);
    await expect(leaving).toHaveCount(0);
    const gone = await page.evaluate(() => performance.now());
    expect(gone - t0).toBeGreaterThanOrEqual(LEAVE_MS - 20);
    expect(gone - t0).toBeLessThan(LEAVE_MS + 600);
  });

  test('desktop panel folded from the rail: slides back behind the rail', async ({ mount, page, isMobile }) => {
    test.skip(isMobile, 'desktop');
    await mount(<div className="dock"><PanelStory slide /></div>);
    await set(page, { show: false, slide: true });
    await expect(page.locator('.leave')).toHaveClass(/\bslide\b/);
  });

  test('with reduced motion a closed panel goes at once', async ({ mount, page, isMobile }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await mount(<PanelStory mobile={isMobile} />);
    await set(page, { show: false });
    await expect(page.locator('.leave')).toBeHidden();
    await expect(page.locator('section.panel')).not.toBeVisible();
  });
});

test.describe('phone sheet', () => {
  test.skip(({ isMobile }) => !isMobile, 'phone');

  test('opens at half: covers the bottom half, publishes its height, grab bar on top', async ({ mount, page }) => {
    await mount(<PanelStory mobile rows={30} />);
    await page.waitForTimeout(350);
    expect(await sheetState(page)).toBe('half');
    const p = await box(page, 'section.panel');
    const vh = page.viewportSize()!.height;
    expect(Math.round(p.y + p.height)).toBe(vh);
    expect(Math.round(p.height)).toBe(Math.round(vh / 2));
    expect(await rootVar(page, '--sheet-h')).toBe(`${Math.round(p.height)}px`);
    await expect(page.locator('.grab')).toBeVisible();
  });

  // drag threshold 40 px (boundary values)
  for (const [dy, end] of [[39, 'half'], [41, 'fold'], [-39, 'half'], [-41, 'full']] as const)
    test(`drag ${dy > 0 ? 'down' : 'up'} ${Math.abs(dy)} px from half: ${end}`, async ({ mount, page }) => {
      await mount(<PanelStory mobile rows={30} />);
      await page.waitForTimeout(350);
      await drag(page, dy);
      expect(await sheetState(page)).toBe(end);
    });

  test('states: half → title only → half → full → half (state transitions)', async ({ mount, page }) => {
    await mount(<PanelStory mobile rows={30} />);
    await page.waitForTimeout(350);
    const seen = [await sheetState(page)];
    await drag(page, 80);
    seen.push(await sheetState(page));
    expect(await rootVar(page, '--sheet-fold')).toMatch(/^\d+px$/);
    await drag(page, -80);
    seen.push(await sheetState(page));
    expect(await rootVar(page, '--sheet-fold')).toBe('');
    await drag(page, -80);
    seen.push(await sheetState(page));
    expect(await rootVar(page, '--sheet-h')).toBe('0px');
    expect(await page.evaluate(() => document.documentElement.classList.contains('sheet-full'))).toBe(true);
    await drag(page, 80);
    seen.push(await sheetState(page));
    expect(seen).toEqual(['half', 'fold', 'half', 'full', 'half']);
  });

  test('short content: dragging up does not make it full', async ({ mount, page }) => {
    await mount(<PanelStory mobile rows={2} />);
    await page.waitForTimeout(350);
    await drag(page, -80);
    expect(await sheetState(page)).toBe('half');
  });

  test('title only: a tap opens it to half; the release after a drag does not', async ({ mount, page }) => {
    await mount(<PanelStory mobile rows={30} />);
    await page.waitForTimeout(350);
    await drag(page, 80);
    expect(await sheetState(page)).toBe('fold');
    const h = await box(page, '.p-head');
    await page.mouse.click(h.x + h.width / 2, h.y + 6);
    await page.waitForTimeout(350);
    expect(await sheetState(page)).toBe('half');
  });

  test('a new screen opens at half again', async ({ mount, page }) => {
    await mount(<PanelStory mobile rows={30} />);
    await page.waitForTimeout(350);
    await drag(page, 80);
    await set(page, { resetKey: 'b' });
    await expect.poll(() => sheetState(page)).toBe('half');
  });

  test('a reload opens the same sheet at the height it was left (this tab)', async ({ mount, page }) => {
    await mount(<PanelStory mobile rows={30} resetKey="results:villa" />);
    await page.waitForTimeout(350);
    await drag(page, 80);
    expect(await page.evaluate(() => sessionStorage.getItem('gc-map:sheet'))).toBe(JSON.stringify({ key: 'results:villa', state: 'fold' }));
    await page.reload();
    await mount(<PanelStory mobile rows={30} resetKey="results:villa" />);
    await page.waitForTimeout(350);
    expect(await sheetState(page)).toBe('fold');
  });

  test('closing the sheet clears what it published', async ({ mount, page }) => {
    await mount(<PanelStory mobile rows={30} />);
    await page.waitForTimeout(350);
    await drag(page, 80);
    await set(page, { show: false });
    await expect.poll(() => rootVar(page, '--sheet-h')).toBe('');
    expect(await rootVar(page, '--sheet-fold')).toBe('');
  });

  test('top panel (preview, Category): under the search box, 12 px from the sides', async ({ mount, page }) => {
    await mount(<PanelStory mobile place="top" rows={5} />);
    await page.waitForTimeout(350);
    const p = await box(page, 'section.panel');
    expect([Math.round(p.x), Math.round(p.y), Math.round(page.viewportSize()!.width - p.x - p.width)]).toEqual([12, 64, 12]);
  });
});

test.describe('covered part of the map (decision table)', () => {
  const room = async (page: Page) => JSON.parse((await page.locator('#room').textContent())!) as Record<string, number>;

  test('desktop, no panel: the rail on the left, the zoom buttons on the right', async ({ mount, page, isMobile }) => {
    test.skip(isMobile, 'desktop');
    await mount(<RoomStory show={false} />);
    await expect.poll(() => room(page)).toEqual({ top: 0, right: 48, bottom: 0, left: 56 });
  });

  test('desktop, panel open: everything left of its right edge', async ({ mount, page, isMobile }) => {
    test.skip(isMobile, 'desktop');
    await mount(<RoomStory />);
    await expect.poll(() => room(page)).toEqual({ top: 0, right: 48, bottom: 0, left: 72 + 380 });
  });

  test('phone, search box only: the strip down to its bottom', async ({ mount, page, isMobile }) => {
    test.skip(!isMobile, 'phone');
    await mount(<RoomStory mobile topbar show={false} />);
    const bar = await box(page, '.topbar');
    await expect.poll(() => room(page)).toEqual({ top: Math.round(bar.y + bar.height), right: 0, bottom: 0, left: 0 });
  });

  test('phone, top panel: down to its bottom; sheet: up to its top', async ({ mount, page, isMobile }) => {
    test.skip(!isMobile, 'phone');
    await mount(<RoomStory mobile topbar place="top" />);
    await page.waitForTimeout(350);
    const t = await page.locator('section.panel').evaluate((e: HTMLElement) => e.offsetTop + e.offsetHeight);
    await expect.poll(async () => (await room(page)).top).toBe(t);
    await set(page, { place: 'sheet', resetKey: 'b', rows: 30 });
    await page.waitForTimeout(350);
    const s = await page.locator('section.panel').evaluate((e: HTMLElement) => e.offsetTop);
    const vh = page.viewportSize()!.height;
    await expect.poll(async () => (await room(page)).bottom).toBe(vh - s);
  });
});

test('accessibility: a panel with its title row and rows', async ({ mount, page, isMobile }) => {
  await mount(<PanelStory mobile={isMobile} />);
  await page.waitForTimeout(300);
  await expectAccessible(page);
});

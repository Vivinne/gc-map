/*
 * Layer 3B flows: W1-W12 with the real modules on the built site (gc/test-modules.md, flows).
 * Every test checks what each module holds afterwards: screen history, address, recents, panel, map view.
 * FLOW_RECORD=<file>: every step's state is also written to that file, so the same run on the old site can be
 * compared step by step (scripts/tools/compare-flows.ts).
 */
import { expect, test, type Page } from '@playwright/test';
import { appendFileSync } from 'node:fs';
import { streetTiles } from '../playwright/map';

const RECORD = process.env.FLOW_RECORD;

/** Everything the flows change, read off the page */
async function state(page: Page) {
  return page.evaluate(() => {
    const q = new URLSearchParams(location.search);
    const m = q.get('m');
    q.delete('m');
    const panel = document.querySelector('main section.panel:not(.leave *)') as HTMLElement | null;
    const box = document.querySelector('input[type=search]') as HTMLInputElement | null;
    const a = document.activeElement;
    let hist: unknown[] = [];
    try {
      hist = JSON.parse(sessionStorage.getItem('gc-map:history') ?? '[]') as unknown[];
    } catch {}
    return {
      address: q.toString(),
      view: !!m,
      history: hist.length,
      panel: panel ? [...panel.classList].filter((c) => !['panel', 'd', 'm', 'half', 'fold', 'full'].includes(c)).join(' ') : '',
      title: panel?.querySelector('.p-head .h-title')?.textContent ?? panel?.querySelector('h1')?.textContent ?? '',
      back: !!panel?.querySelector('.p-head [aria-label="Back"]') || !!document.querySelector('form.sbox [aria-label="Back"]'),
      rows: panel?.querySelectorAll('.row').length ?? 0,
      box: box?.value ?? null,
      focus: a === box ? 'box' : a?.closest('section.panel') ? 'panel' : 'page',
      recentTexts: JSON.parse(localStorage.getItem('gc-atlas:recent-text') ?? '[]') as string[],
      recentBuildings: JSON.parse(localStorage.getItem('gc-atlas:recent-building') ?? '[]') as string[],
    };
  });
}
type State = Awaited<ReturnType<typeof state>>;

/** Records the state after a step (and returns it) */
async function step(page: Page, name: string): Promise<State> {
  await page.waitForTimeout(250);
  const s = await state(page);
  if (RECORD) appendFileSync(RECORD, `${JSON.stringify({ test: test.info().titlePath.slice(1).join(' > '), project: test.info().project.name, step: name, ...s })}\n`);
  return s;
}

const mapParam = (page: Page) => new URL(page.url()).searchParams.get('m');
/** Waits for the map to come to rest after a step (the address takes its view) */
async function settled(page: Page, before: string | null = null) {
  // a map already at the view the step asks for does not move: then the view stays as it is
  await expect.poll(() => mapParam(page), { timeout: before === null ? 8000 : 4000 }).not.toBe(before).catch(() => {});
  let last = mapParam(page);
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(250);
    const now = mapParam(page);
    if (now === last) return now;
    last = now;
  }
  return last;
}

async function openBox(page: Page, mobile: boolean) {
  if (mobile) await page.locator('.topbar input').click();
  else {
    // a panel on its way out (Esc) does not count: it is leaving
    if (!(await page.locator('main section.panel.search:not(.leave *)').count())) await page.locator('nav.rail').getByRole('button', { name: 'Search', exact: true }).click();
    // the panel may still be sliding in or taking a new page
    await page.waitForTimeout(300);
    await page.locator('main section.panel:not(.leave *) input').click();
  }
  await expect(page.locator('input[type=search]')).toBeFocused();
}
/** Sends a search and waits for the map to frame its results; returns the map view they came to rest at */
async function search(page: Page, mobile: boolean, text: string) {
  await openBox(page, mobile);
  await page.locator('input[type=search]').fill(text);
  const m0 = mapParam(page);
  await page.keyboard.press('Enter');
  await expect(page.locator('section.panel .row').first()).toBeVisible();
  return settled(page, m0);
}
/** Clicks a mark on the map at its middle, as a person would */
async function clickMark(page: Page, mark: ReturnType<Page['locator']>) {
  const b = (await mark.boundingBox())!;
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
}
/** Drags the map by a little with the mouse (a person moving it) */
async function nudgeMap(page: Page, mobile: boolean) {
  const [x, y] = mobile ? [200, 200] : [900, 400];
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 60, y + 40, { steps: 6 });
  await page.mouse.up();
}
const rowsIn = (page: Page) => page.locator('main section.panel:not(.leave *) .row');
async function openCategory(page: Page, mobile: boolean) {
  if (mobile) await page.locator('.topbar').getByRole('button', { name: 'Category' }).click();
  else await page.locator('nav.rail').getByRole('button', { name: 'Category', exact: true }).click();
  await expect(page.locator('section.panel.category')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await streetTiles(page, 'ok');
  await page.goto('./');
  await page.waitForFunction(() => !!document.querySelector('.map-canvas canvas'));
});

test.describe('W1 open a card', () => {
  test('from a results row: recents first, panel, one step, the map brings it to the middle of its free part', async ({ page, isMobile }) => {
    const m0 = await search(page, isMobile, 'villa');
    const before = await step(page, 'results');
    const id = await rowsIn(page).first().evaluate((r) => r.closest('li')?.getAttribute('data-id') ?? '');
    const name = (await rowsIn(page).first().locator('b').first().textContent())!;
    await rowsIn(page).first().click();
    await settled(page, m0);
    const s = await step(page, 'card');
    expect(s.panel).toContain('card');
    expect(s.title).toBe(name);
    expect(s.history).toBe(before.history + 1);
    expect(s.address).toMatch(/(^|&)b=/);
    expect(s.recentBuildings[0]).toBe(new URLSearchParams(s.address).get('b'));
    if (id) expect(s.recentBuildings[0]).toBe(id);
    // the open building's mark sits in the middle of the part of the map the panel leaves free
    const mark = (await page.locator('.sel-mark').boundingBox())!;
    const vw = page.viewportSize()!;
    const p = (await page.locator('main section.panel').boundingBox())!;
    const free = isMobile ? { x0: 0, x1: vw.width, y0: 64, y1: p.y } : { x0: p.x + p.width, x1: vw.width - 48, y0: 0, y1: vw.height };
    expect(Math.abs(mark.x + mark.width / 2 - (free.x0 + free.x1) / 2)).toBeLessThan(isMobile ? 30 : 30);
    expect(Math.abs(mark.y + mark.height / 2 - (free.y0 + free.y1) / 2)).toBeLessThan(isMobile ? 40 : 30);
  });

  test('the same card clicked again adds no step', async ({ page, isMobile }) => {
    await search(page, isMobile, 'pantheon');
    await rowsIn(page).first().click();
    await expect(page.locator('section.panel.card')).toBeVisible();
    const a = await step(page, 'card');
    // its own name on the map opens it again
    await page.locator('svg.overlay .mk.name').first().click({ force: true });
    const b = await step(page, 'card again');
    expect(b.history).toBe(a.history);
  });

  test('from a recent building in the search preview', async ({ page, isMobile }) => {
    await search(page, isMobile, 'pantheon');
    await rowsIn(page).first().click();
    const id = new URL(page.url()).searchParams.get('b');
    await page.keyboard.press('Escape');
    await openBox(page, isMobile);
    await expect(page.locator('section.panel .recent-b .row')).toHaveCount(1);
    await page.locator('section.panel .recent-b .row').click();
    const s = await step(page, 'card from recent');
    expect(s.panel).toContain('card');
    expect(new URLSearchParams(s.address).get('b')).toBe(id);
  });

  test('from an architect on a card: a text search of that name, then a row', async ({ page, isMobile }) => {
    await search(page, isMobile, 'palladio');
    await rowsIn(page).first().click();
    const who = page.locator('section.panel.card .c-who').first();
    const name = (await who.textContent())!.trim();
    await who.click();
    const s = await step(page, 'architect search');
    expect(new URLSearchParams(s.address).get('q')).toBe(name);
    expect(s.recentTexts[0]).toBe(name);
    expect(s.rows).toBeGreaterThan(0);
  });
});

test.describe('W2 number point', () => {
  test('opens its list, titled by its size; the map splits it', async ({ page }) => {
    await page.waitForTimeout(800);
    const num = page.locator('svg.overlay g.mk.num').nth(3);
    const n = Number(await num.locator('.num-n').textContent());
    const m0 = mapParam(page);
    await clickMark(page, num);
    await settled(page, m0);
    const s = await step(page, 'group');
    expect(s.panel).toContain('group');
    expect(s.title).toBe(`${n} Architectures`);
    expect(s.rows).toBe(n);
    expect(s.address).toMatch(/(^|&)g=/);
  });

  test('desktop: with the panel folded, a marker opens it again', async ({ page, isMobile }) => {
    test.skip(isMobile, 'desktop');
    await page.waitForTimeout(800);
    const m0 = mapParam(page);
    await clickMark(page, page.locator('svg.overlay g.mk.num').nth(3));
    await expect(page.locator('section.panel.group')).toBeVisible();
    await settled(page, m0);
    await page.locator('nav.rail .rail-fold').click();
    await expect(page.locator('main section.panel:not(.leave *)')).toHaveCount(0);
    // its buildings now stand apart: one of their dots, clicked, opens the panel (R7)
    const mark = page.locator('svg.overlay .mk[role="button"]');
    const inView = await mark.evaluateAll((gs) => gs.findIndex((g) => { const r = g.getBoundingClientRect(); return r.width > 0 && r.left > 70 && r.right < innerWidth - 60 && r.top > 10 && r.bottom < innerHeight - 60; }));
    expect(inView).toBeGreaterThanOrEqual(0);
    await clickMark(page, mark.nth(inView));
    await expect(page.locator('main section.panel:not(.leave *)')).toHaveCount(1);
  });

  test('desktop: with the panel folded, a number point opens it (number point clicked)', async ({ page, isMobile }) => {
    test.skip(isMobile, 'desktop');
    await search(page, false, 'baroque');
    await page.locator('nav.rail').getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page.locator('main section.panel:not(.leave *)')).toHaveCount(0);
    const num = page.locator('svg.overlay g.mk.num');
    const inView = await num.evaluateAll((gs) => gs.findIndex((g) => { const r = g.getBoundingClientRect(); return r.left > 100 && r.right < innerWidth - 100 && r.top > 50 && r.bottom < innerHeight - 80; }));
    test.skip(inView < 0, 'no number point on screen for this search');
    await clickMark(page, num.nth(inView));
    await expect(page.locator('section.panel.group')).toBeVisible();
  });
});

test.describe('W3 send a search', () => {
  test('from typing: replaces the typing step; the same search again adds none; a recent text sends it', async ({ page, isMobile }) => {
    await openBox(page, isMobile);
    await page.keyboard.type('villa');
    const typing = await step(page, 'typing');
    await page.keyboard.press('Enter');
    const sent = await step(page, 'sent');
    expect(sent.history).toBe(typing.history);
    expect(new URLSearchParams(sent.address).get('q')).toBe('villa');
    expect(sent.recentTexts).toEqual(['villa']);
    await openBox(page, isMobile);
    await page.locator('input[type=search]').fill('villa');
    await page.keyboard.press('Enter');
    const again = await step(page, 'sent again');
    expect(again.history).toBe(sent.history);
    await page.keyboard.press('Escape');
    await openBox(page, isMobile);
    await page.locator('section.panel .row.text').filter({ hasText: 'villa' }).click();
    const recent = await step(page, 'recent text');
    expect(new URLSearchParams(recent.address).get('q')).toBe('villa');
  });

  test('a text with no match is not sent', async ({ page, isMobile }) => {
    await openBox(page, isMobile);
    await page.keyboard.type('zzqxv');
    await page.keyboard.press('Enter');
    const s = await step(page, 'no match');
    expect(new URLSearchParams(s.address).get('q')).toBeNull();
    expect(s.recentTexts).toEqual([]);
  });

  test('recent texts: 3 at most, newest first, a different case counts as the same', async ({ page, isMobile }) => {
    for (const t of ['villa', 'baroque', 'gothic', 'Villa']) await search(page, isMobile, t);
    expect((await step(page, 'four searches')).recentTexts).toEqual(['Villa', 'gothic', 'baroque']);
  });

  test('phone: sent with the keyboard up, the map frames once the keyboard has gone', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'phone keyboard');
    const full = page.viewportSize()!;
    await openBox(page, true);
    await page.setViewportSize({ width: full.width, height: full.height - 300 });
    await page.keyboard.type('villa');
    const m0 = mapParam(page);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(700);
    expect(mapParam(page), 'no framing while the keyboard is up').toBe(m0);
    await page.setViewportSize(full);
    await settled(page, m0);
  });
});

test.describe('W4 open the search', () => {
  test('text typed and not sent comes back when the box opens again', async ({ page, isMobile }) => {
    await openBox(page, isMobile);
    await page.keyboard.type('bramante');
    await openCategory(page, isMobile);
    await openBox(page, isMobile);
    await expect(page.locator('input[type=search]')).toHaveValue('bramante');
  });

  test('"/" opens the search and puts the cursor in the box, on every screen', async ({ page, isMobile }) => {
    test.skip(isMobile, 'keyboard');
    for (const open of [async () => {}, async () => openCategory(page, false), async () => search(page, false, 'villa')]) {
      await open();
      await page.locator('body').click({ position: { x: 700, y: 400 } }).catch(() => {});
      await page.keyboard.press('Escape');
      await open();
      await page.mouse.click(1, 1);
      await page.keyboard.press('/');
      await expect(page.locator('input[type=search]')).toBeFocused();
    }
  });
});

test.describe('W5 Category', () => {
  test('a tag: not in the box, not in recents; \uff1c back to Category', async ({ page, isMobile }) => {
    await openCategory(page, isMobile);
    await page.locator('section.panel .chip').filter({ hasText: 'Baroque' }).click();
    const s = await step(page, 'tag');
    expect(s.title).toBe('Baroque');
    expect(s.recentTexts).toEqual([]);
    if (isMobile) expect(s.box).toBe('');
    await page.locator('section.panel').getByRole('button', { name: 'Back' }).click();
    expect((await step(page, 'back to Category')).panel).toContain('category');
  });

  test('phone: the Category button again goes back (\uff1c)', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'phone');
    await openCategory(page, true);
    await page.locator('.topbar').getByRole('button', { name: 'Category' }).click();
    expect((await step(page, 'Category again')).panel).toBe('');
  });
});

test.describe('W6 \uff1c', () => {
  test('card → results: the list and the map view of the results come back', async ({ page, isMobile }) => {
    const m0 = await search(page, isMobile, 'villa');
    await rowsIn(page).first().click();
    await settled(page, m0);
    await page.locator('section.panel.card').getByRole('button', { name: 'Back' }).click();
    const back = await settled(page, mapParam(page));
    const s = await step(page, 'back to results');
    expect(new URLSearchParams(s.address).get('q')).toBe('villa');
    expect(back).toBe(m0);
  });

  test('typing → card → \uff1c: the typed text comes back', async ({ page, isMobile }) => {
    await openBox(page, isMobile);
    await page.keyboard.type('pantheon');
    await rowsIn(page).first().click();
    await expect(page.locator('section.panel.card')).toBeVisible();
    await page.locator('section.panel.card').getByRole('button', { name: 'Back' }).click();
    await expect(page.locator('input[type=search]')).toHaveValue('pantheon');
  });
});

test.describe('W7 × and Esc', () => {
  test('Esc closes everything, the map stays where it is, the box empties', async ({ page, isMobile }) => {
    const m0 = await search(page, isMobile, 'villa');
    await page.keyboard.press('Escape');
    const s = await step(page, 'esc');
    expect(s.panel).toBe('');
    expect(s.address).toBe('');
    expect(mapParam(page)).toBe(m0);
    if (isMobile) expect(s.box).toBe('');
  });

  test('search box ×: with text it clears the text; empty, it closes', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'the phone box × (desktop: the box × is the page ×)');
    await openBox(page, true);
    await page.keyboard.type('villa');
    await page.locator('.topbar').getByRole('button', { name: 'Clear' }).click();
    expect((await step(page, 'clear text')).box).toBe('');
    await expect(page.locator('input[type=search]')).toBeFocused();
  });
});

test.describe('W8 country lines', () => {
  test('a country line frames its buildings and turns grey; moving the map makes it clickable again', async ({ page, isMobile }) => {
    await search(page, isMobile, 'baroque');
    const line = page.locator('section.panel .c-head').first();
    await expect(line).toBeVisible();
    const m0 = mapParam(page);
    await line.click();
    await settled(page, m0);
    await expect(line).toHaveAttribute('aria-disabled', 'true');
    const m1 = mapParam(page);
    await nudgeMap(page, isMobile);
    await settled(page, m1);
    await expect(line).toHaveAttribute('aria-disabled', 'false');
  });
});

test.describe('W9 Other Possible Outcomes', () => {
  test('opening adds them and frames all; folding puts the map back; another search folds them', async ({ page, isMobile }) => {
    await search(page, isMobile, 'rome');
    const more = page.locator('section.panel .more-btn');
    test.skip(!(await more.count()), 'no other outcomes for this text');
    const m0 = mapParam(page);
    const n = await rowsIn(page).count();
    await more.click();
    await settled(page, m0);
    expect(await rowsIn(page).count()).toBeGreaterThan(n);
    await page.locator('section.panel .fold-btn').click();
    expect(await settled(page, mapParam(page))).toBe(m0);
    await search(page, isMobile, 'villa');
    await search(page, isMobile, 'rome');
    await expect(page.locator('section.panel .more-btn')).toBeVisible();
  });
});

test.describe('W10 map ready and stopped', () => {
  test('a shared link with a card opens that card with no \uff1c', async ({ page }) => {
    await page.goto('./?b=pantheon-rome');
    await expect(page.locator('section.panel.card h1')).toContainText('Pantheon');
    // the map opens on Europe, then comes to the card: the address takes the card's view
    await expect.poll(() => mapParam(page), { timeout: 8000 }).toMatch(/^12\.4/);
    const s = await step(page, 'shared card');
    expect(s.back).toBe(false);
  });

  test('a shared link with a map view opens there', async ({ page }) => {
    await page.goto('./?q=villa&m=11.5,45.5,8');
    await page.waitForTimeout(1500);
    const m = mapParam(page)!.split(',').map(Number);
    expect(m.map((x) => Math.round(x * 10) / 10)).toEqual([11.5, 45.5, 8]);
  });

  test('a reload keeps the screen and the steps behind \uff1c', async ({ page, isMobile }) => {
    await search(page, isMobile, 'villa');
    await rowsIn(page).first().click();
    const a = await step(page, 'before reload');
    await page.reload();
    await expect(page.locator('section.panel.card')).toBeVisible();
    const b = await step(page, 'after reload');
    expect([b.address, b.history, b.back]).toEqual([a.address, a.history, true]);
  });
});

test.describe('W12 fold the panel (desktop)', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop');

  test('folded: the map keeps the dimming; a reload keeps it folded; × forgets it', async ({ page }) => {
    await search(page, false, 'baroque');
    await page.locator('section.panel .row').first().hover();
    await page.mouse.move(5, 790);
    const dimmed = await page.locator('svg.overlay .mk.dim').count();
    await page.locator('nav.rail').getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page.locator('main section.panel:not(.leave *)')).toHaveCount(0);
    expect(await page.locator('svg.overlay .mk.dim').count()).toBe(dimmed);
    await page.reload();
    await page.waitForTimeout(800);
    await expect(page.locator('main section.panel:not(.leave *)')).toHaveCount(0);
    expect(await page.evaluate(() => sessionStorage.getItem('gc-map:folded'))).toBe('1');
    // on a results page the fold button is grey (R7): Search opens the panel again
    await expect(page.locator('nav.rail .rail-fold')).toBeDisabled();
    await page.locator('nav.rail').getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page.locator('main section.panel:not(.leave *)')).toHaveCount(1);
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => sessionStorage.getItem('gc-map:folded'))).toBeNull();
  });
});

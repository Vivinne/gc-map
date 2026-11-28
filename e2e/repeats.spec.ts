/*
 * Layer 4.4 repeats and returns (gc/test-plan.md 4.4): every action done three times in a row; every screen left
 * and come back to with \uff1c, which must bring back the same screen (address, panel, title, rows, text, scroll, map).
 */
import { test, type Page } from '@playwright/test';
import { ACTIONS, DESKTOP_ONLY, PARK, RECIPES, act, expect, fresh, problems, record, screenOf, stateOf } from './support/site';

test.describe.configure({ timeout: 5 * 60 * 1000 });
const mapParam = (page: Page) => new URL(page.url()).searchParams.get('m');
const scroll = (page: Page) => page.evaluate(() => document.querySelector('main section.panel:not(.leave *) .p-body')?.scrollTop ?? 0);

for (const name of Object.keys(ACTIONS).filter((n) => n !== 'reload'))
  test(`three times: ${name}`, async ({ page, isMobile }, info) => {
    // the first screen (in recipe order) where the action applies
    for (const [state, recipe] of Object.entries(RECIPES)) {
      if (isMobile && DESKTOP_ONLY.has(state)) continue;
      await fresh(page);
      for (const s of recipe) await act(page, isMobile, s);
      if (!(await ACTIONS[name]!.can(page, isMobile))) continue;
      const bad: string[] = [];
      for (let k = 1; k <= 3; k++) {
        if (k > 1 && !(await ACTIONS[name]!.can(page, isMobile))) break;
        await act(page, isMobile, name);
        if (!isMobile) await page.mouse.move(PARK.x, PARK.y);
        for (const p of await problems(page, isMobile)) bad.push(`${state} > ${name} ×${k}: ${p}`);
        record({ project: info.project.name, test: `three times ${name}`, step: `${state} ${k}`, to: await screenOf(page), ...(await stateOf(page)) });
      }
      expect(bad).toEqual([]);
      return;
    }
    test.skip(true, 'no screen where this action applies on this device');
  });

/** The first step from a screen that opens another screen */
const FORWARD = ['row', 'mapDot', 'mapNum', 'tag', 'recentBuilding', 'previewRow', 'architect', 'enter'];

for (const [state, recipe] of Object.entries(RECIPES))
  test(`come back with \uff1c: ${state}`, async ({ page, isMobile }, info) => {
    test.skip(isMobile && DESKTOP_ONLY.has(state), 'desktop panel folding');
    test.skip(state.endsWith(':folded'), 'a folded panel has no \uff1c');
    await fresh(page);
    for (const s of recipe) await act(page, isMobile, s);
    // scroll the list a little, so its place is part of what must come back
    await page.evaluate(() => document.querySelector('main section.panel:not(.leave *) .p-body')?.scrollTo({ top: 60 }));
    await page.waitForTimeout(200);
    const a = { ...(await stateOf(page)), m: mapParam(page), scroll: await scroll(page), screen: await screenOf(page) };
    let went = '';
    // from a card: its architect (a marker on the map could be the open building itself, which adds no step)
    for (const f of state.startsWith('card') ? ['architect', 'mapNum'] : FORWARD) if (await ACTIONS[f]!.can(page, isMobile)) {
      went = f;
      break;
    }
    test.skip(!went, 'no way forward from here');
    if (went === 'row') {
      // a row already in sight: clicking one out of sight would scroll the list first, and that scroll is what ＜ keeps
      const i = await page.locator('main section.panel:not(.leave *) .row').evaluateAll((rows) => {
        const box = rows[0]!.closest('.p-body')!.getBoundingClientRect();
        return rows.findIndex((r) => { const b = r.getBoundingClientRect(); return b.top >= box.top && b.bottom <= box.bottom; });
      });
      await page.locator('main section.panel:not(.leave *) .row').nth(i).click();
      await act(page, isMobile, 'none');
    } else await act(page, isMobile, went);
    const mid = await screenOf(page);
    test.skip(!(await ACTIONS.back!.can(page, isMobile)), `no \uff1c after ${went} (${mid})`);
    await act(page, isMobile, 'back');
    if (!isMobile) await page.mouse.move(PARK.x, PARK.y);
    const b = { ...(await stateOf(page)), m: mapParam(page), scroll: await scroll(page), screen: await screenOf(page) };
    record({ project: info.project.name, test: `come back ${state}`, step: `${went} then back`, mid, ...b });
    // the typing screen lists the recent buildings, and the card opened in between is one more of them
    const keep = (x: typeof a) => ({ screen: x.screen, address: x.address, panel: x.panel, title: x.title, rows: state.startsWith('typing') ? 0 : x.rows, box: x.box, history: x.history, scroll: x.scroll, m: x.m });
    // the typing screen: a sent search takes its place, so \uff1c goes to the screen before it (R4); the box keeps its text
    if (state.startsWith('typing') && went === 'enter') return;
    expect(keep(b)).toEqual(keep(a));
  });

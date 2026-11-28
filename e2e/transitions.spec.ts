/*
 * Layer 4.2 state transition coverage (gc/test-plan.md appendix B): every screen is reached, and every action a
 * screen allows is taken from it once (all screens and all transitions, 0-switch). Each pair starts from a fresh
 * visit and the screen's recipe, so a step's result never depends on the pair before it.
 * After every step the checks of appendix D run. FLOW_RECORD: each transition is written for the old/new comparison.
 */
import { test } from '@playwright/test';
import { ACTIONS, PARK, DESKTOP_ONLY, RECIPES, act, expect, fresh, problems, record, screenOf, stateOf } from './support/site';

test.describe.configure({ timeout: 15 * 60 * 1000 });

for (const [state, recipe] of Object.entries(RECIPES))
  test(`from ${state}`, async ({ page, isMobile }, info) => {
    test.skip(isMobile && DESKTOP_ONLY.has(state), 'desktop panel folding');
    const reach = async () => {
      await fresh(page);
      for (const s of recipe) await act(page, isMobile, s);
    };
    await reach();
    expect(await screenOf(page), `recipe for ${state}`).toBe(state.replace(/^card-.*?(?=:|$)/, 'card').replace(/^category-.*?(?=:|$)/, 'category'));
    const applicable: string[] = [];
    for (const [name, a] of Object.entries(ACTIONS)) if (await a.can(page, isMobile)) applicable.push(name);
    const found: string[] = [];
    for (const name of applicable) {
      await page.context().clearCookies();
      await page.evaluate(() => (sessionStorage.clear(), localStorage.clear()));
      await reach();
      // the same recipe can leave the map a little differently (a mark may sit under the panel this time)
      if (!(await ACTIONS[name]!.can(page, isMobile))) {
        record({ project: info.project.name, test: `from ${state}`, step: name, to: 'not available this time' });
        continue;
      }
      await act(page, isMobile, name);
      if (!isMobile) await page.mouse.move(PARK.x, PARK.y);
      const to = await screenOf(page);
      const s = await stateOf(page);
      const bad = await problems(page, isMobile);
      for (const b of bad) found.push(`${state} --${name}--> ${to}: ${b}`);
      record({ project: info.project.name, test: `from ${state}`, step: name, to, ...s });
    }
    info.annotations.push({ type: 'transitions', description: `${state}: ${applicable.join(', ')}` });
    expect(found).toEqual([]);
  });

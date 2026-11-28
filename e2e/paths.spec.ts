/*
 * Layer 4.1 user paths (SPEC §6): the 7 paths from start to end, plain and with 4 detours half way
 * (＜ then the step again, × then the whole path again, a reload, another search then ＜ back).
 * A path with a detour must end on the same screen as the plain path; appendix D is checked after every step.
 */
import { test } from '@playwright/test';
import { ACTIONS, PARK, act, expect, fresh, problems, record, screenOf, stateOf } from './support/site';

const PATHS: Record<string, string[]> = {
  text: ['clickBox', 'type:villa', 'enter', 'row'],
  'recent building': ['clickBox', 'recentBuilding'],
  'recent text': ['clickBox', 'recentText'],
  style: ['category', 'tag', 'row'],
  architect: ['clickBox', 'search:palladio', 'row', 'architect'],
  browse: ['zoomTo', 'mapDot'],
  dense: ['mapNum', 'row'],
};
const DETOURS = ['none', 'back', 'close', 'reload', 'other search'] as const;

for (const [path, steps] of Object.entries(PATHS))
  for (const detour of DETOURS)
    test(`${path} path, detour: ${detour}`, async ({ page, isMobile }, info) => {
      test.setTimeout(120000);
      const bad: string[] = [];
      const check = async (label: string) => {
        if (!isMobile) await page.mouse.move(PARK.x, PARK.y);
        for (const p of await problems(page, isMobile)) bad.push(`${label}: ${p}`);
        record({ project: info.project.name, test: `${path} / ${detour}`, step: label, screen: await screenOf(page), ...(await stateOf(page)) });
      };
      await fresh(page);
      // the detour comes half way, on a screen that is not the typing screen (a search sent from the typing screen
      // takes its place in the history, so ＜ cannot come back to it)
      const typingAt = (i: number) => steps.slice(0, i + 1).some((s) => s === 'clickBox') && !steps.slice(0, i + 1).some((s) => s === 'enter' || s.startsWith('search:') || s === 'recentText' || s === 'recentBuilding' || s === 'previewRow');
      let half = Math.max(1, Math.floor(steps.length / 2));
      while (half < steps.length && typingAt(half - 1) && (detour === 'back' || detour === 'other search')) half++;
      test.skip(half >= steps.length && detour !== 'none' && detour !== 'close' && detour !== 'reload', 'no screen on this path where the detour fits');
      const screens: string[] = [];
      for (let i = 0; i < steps.length; i++) {
        await act(page, isMobile, steps[i]!);
        await check(`${i + 1} ${steps[i]}`);
        screens.push(await screenOf(page));
        if (i !== half - 1 || detour === 'none') continue;
        if (detour === 'back') {
          if (await ACTIONS.back!.can(page, isMobile)) {
            await act(page, isMobile, 'back');
            await check('detour ＜');
            // back on the screen before this step: the step again; back further (a search takes the typing
            // screen's place): the path again from here up to this step
            const from = (await screenOf(page)) === screens[i - 1] ? i : 0;
            for (let k = from; k <= i; k++) await act(page, isMobile, steps[k]!);
            await check(`again ${steps[i]}`);
          }
        } else if (detour === 'close') {
          await act(page, isMobile, 'esc');
          await check('detour Esc');
          // × leaves the map where it is: a path that starts on the map starts again from a fresh visit
          if (steps[0] === 'mapNum' || steps[0] === 'zoomTo' || steps[0] === 'mapDot') await fresh(page);
          for (let k = 0; k <= i; k++) await act(page, isMobile, steps[k]!);
          await check('path again to here');
        } else if (detour === 'reload') {
          await act(page, isMobile, 'reload');
          await check('detour reload');
          // a reload ends the typing focus: the box is clicked again where the path types next
          if (steps[i + 1]?.startsWith('type:') || steps[i + 1] === 'recentBuilding' || steps[i + 1] === 'recentText' || steps[i + 1] === 'enter') await act(page, isMobile, 'clickBox');
        } else {
          const at = await screenOf(page);
          await act(page, isMobile, 'clickBox');
          await act(page, isMobile, 'search:baroque');
          await check('detour other search');
          while ((await screenOf(page)) !== at && (await ACTIONS.back!.can(page, isMobile))) await act(page, isMobile, 'back');
          await check('detour ＜ back');
          if (steps[i + 1]?.startsWith('type:') || steps[i + 1] === 'recentBuilding' || steps[i + 1] === 'recentText' || steps[i + 1] === 'enter') await act(page, isMobile, 'clickBox');
        }
      }
      const end = await screenOf(page);
      info.annotations.push({ type: 'end', description: end });
      expect(bad).toEqual([]);
      expect(end.replace(/-.*$/, '')).toBe(path === 'architect' || path === 'recent text' ? 'results' : 'card');
    });

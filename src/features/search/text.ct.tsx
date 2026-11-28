/* F1 search, layer 3A: the typed-text and recents doors (gc/test-modules.md, search: door). */
import { expect, test } from '@playwright/experimental-ct-react';
import type { Page } from '@playwright/test';
import { TextStory } from './text.story';

const now = async (page: Page) => JSON.parse((await page.locator('#text').textContent())!) as { draft: string; texts: string[]; buildings: string[] };
const ready = (page: Page) => page.waitForFunction(() => !!window.textTest);
const draftSaved = (page: Page) => page.evaluate(() => sessionStorage.getItem('gc-map:draft'));

test('typed text: kept for this tab while typing; another screen keeps the text waiting (unsent), not the box', async ({ mount, page }) => {
  await mount(<TextStory />);
  await ready(page);
  await page.evaluate(() => window.textTest.text.setDraft('vil'));
  await expect.poll(() => draftSaved(page)).toBe('vil');
  await page.evaluate(() => {
    window.textTest.text.unsent.current = 'vil';
    window.textTest.setScreen('category');
  });
  await expect.poll(() => draftSaved(page)).toBe('vil');
  await page.evaluate(() => {
    window.textTest.text.unsent.current = null;
    window.textTest.setScreen('results');
  });
  await expect.poll(() => draftSaved(page)).toBeNull();
});

test('typed text after a reload: the typing screen gets it back; an emptied box stays empty', async ({ mount, page }) => {
  await page.evaluate(() => sessionStorage.setItem('gc-map:draft', ''));
  await mount(<TextStory sent="villa" />);
  await ready(page);
  expect((await now(page)).draft).toBe('');
});

test('recents: every change is saved at once and read back; 3 at most; removal', async ({ mount, page }) => {
  await mount(<TextStory />);
  await ready(page);
  for (const t of ['a', 'b', 'c', 'd']) await page.evaluate((x) => window.textTest.recent.addText(x), t);
  await page.evaluate(() => window.textTest.recent.addBuilding('x'));
  expect(await now(page)).toMatchObject({ texts: ['d', 'c', 'b'], buildings: ['x'] });
  expect(await page.evaluate(() => localStorage.getItem('gc-atlas:recent-text'))).toBe(JSON.stringify(['d', 'c', 'b']));
  await page.evaluate(() => (window.textTest.recent.removeText('C'), window.textTest.recent.removeBuilding('x')));
  expect(await now(page)).toMatchObject({ texts: ['d', 'b'], buildings: [] });
});

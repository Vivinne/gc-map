/* C3 pointing, layer 3A: the door's contract (gc/test-modules.md, pointing). */
import { expect, test } from '@playwright/experimental-ct-react';
import type { Page } from '@playwright/test';
import { PointingStory } from './pointing.story';

const now = async (page: Page) => JSON.parse((await page.locator('#point').textContent())!) as { hover: string; seen: string[]; fold: string[] };
const ready = (page: Page) => page.waitForFunction(() => !!window.pointTest);

test('the three are kept apart: pointing, rows on screen, rows kept for a folded panel', async ({ mount, page }) => {
  await mount(<PointingStory />);
  await ready(page);
  await page.evaluate(() => (window.pointTest.api.setHoverId('a'), window.pointTest.api.setSeenIds(['a', 'b'])));
  expect(await now(page)).toEqual({ hover: 'a', seen: ['a', 'b'], fold: [] });
  await page.evaluate(() => window.pointTest.api.keepSeen());
  await page.evaluate(() => window.pointTest.api.setSeenIds(['c']));
  expect(await now(page)).toEqual({ hover: 'a', seen: ['c'], fold: ['a', 'b'] });
});

test('a new screen ends the pointing, and nothing else', async ({ mount, page }) => {
  await mount(<PointingStory />);
  await ready(page);
  await page.evaluate(() => (window.pointTest.api.setHoverId('a'), window.pointTest.api.setSeenIds(['a'])));
  await page.evaluate(() => window.pointTest.newScreen());
  expect(await now(page)).toEqual({ hover: '', seen: ['a'], fold: [] });
});

test('a finger: touching a list row keeps the pointing, touching anything else ends it; a mouse press never does', async ({ mount, page, isMobile }) => {
  await mount(<PointingStory />);
  await ready(page);
  await page.evaluate(() => window.pointTest.api.setHoverId('a'));
  if (isMobile) {
    await page.locator('.row').tap();
    expect((await now(page)).hover).toBe('a');
    await page.locator('.other').tap();
    expect((await now(page)).hover).toBe('');
  } else {
    await page.locator('.other').click();
    expect((await now(page)).hover).toBe('a');
  }
});

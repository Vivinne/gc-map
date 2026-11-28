/* F2 Category, layer 2: the 10 tags (gc/test-modules.md, category). */
import { expect, test } from '@playwright/experimental-ct-react';
import { expectAccessible, expectCleanLayout, expectFocusRing, expectPressFeedback } from '../../../playwright/checks';
import { BUILDINGS, ERAS, ERA_ORDER } from '../../data';
import { CategoryList } from './index';

const hex = (c: string) => `rgb(${parseInt(c.slice(1, 3), 16)}, ${parseInt(c.slice(3, 5), 16)}, ${parseInt(c.slice(5, 7), 16)})`;

test('category: 10 tags in category order, each with its colour and its number of buildings', async ({ mount }) => {
  const list = await mount(<CategoryList onPick={() => {}} />);
  const chips = list.locator('.chip');
  await expect(chips).toHaveCount(10);
  for (const [i, e] of ERA_ORDER.entries()) {
    const chip = chips.nth(i);
    await expect(chip).toContainText(ERAS[e].label);
    await expect(chip.locator('.n')).toHaveText(String(BUILDINGS.filter((b) => b.eras.includes(e)).length));
    await expect(chip.locator('.sw')).toHaveCSS('background-color', hex(ERAS[e].color));
  }
});

test('category: two columns 4 px apart, 32 px high pills (KEEP)', async ({ mount }) => {
  const list = await mount(<CategoryList onPick={() => {}} />);
  await expect(list).toHaveCSS('grid-template-columns', /px \d/);
  const [a, b] = [(await list.locator('.chip').nth(0).boundingBox())!, (await list.locator('.chip').nth(1).boundingBox())!];
  expect(Math.round(b.x - (a.x + a.width))).toBe(4);
  expect(a.height).toBe(32);
  await expect(list.locator('.chip').first()).toHaveCSS('border-top-left-radius', '999px');
  await expectCleanLayout(list);
});

test('category: a pick reports the tag name', async ({ mount }) => {
  const picked: string[] = [];
  const list = await mount(<CategoryList onPick={(l) => picked.push(l)} />);
  await list.getByRole('button', { name: /Baroque/ }).click();
  await list.getByRole('button', { name: /Others/ }).click();
  expect(picked).toEqual(['Baroque', 'Others']);
});

test('category: press feedback, focus ring, accessibility', async ({ mount, page }) => {
  const list = await mount(<CategoryList onPick={() => {}} />);
  await expectPressFeedback(page, list.locator('.chip').first());
  await expectFocusRing(page, list.locator('.chip').nth(3));
  await expectAccessible(page);
});

/* F1 search, layer 2: the search box alone (gc/test-modules.md, search). */
import { expect, test } from '@playwright/experimental-ct-react';
import { expectAccessible, expectCleanLayout, expectFocusRing, expectPressFeedback } from '../../../playwright/checks';
import { SEARCH_HINT } from './SearchBox';
import { Box } from './search.story';

const noop = () => {};

test('search box: hint, every letter reported, Enter reported', async ({ mount, page }) => {
  const seen: string[] = [];
  const box = await mount(<Box onChange={(t) => seen.push(`type:${t}`)} onSubmit={() => seen.push('enter')} onFocus={() => seen.push('focus')} />);
  const input = page.locator('#root').getByRole('searchbox', { name: 'Search' });
  await expect(input).toHaveAttribute('placeholder', SEARCH_HINT);
  await input.click();
  await page.keyboard.type('vil');
  await page.keyboard.press('Enter');
  // the box holds no text of its own (the owner passes value back), so each key arrives on its own
  expect(seen).toEqual(['focus', 'type:v', 'type:i', 'type:l', 'enter']);
});

test('search box: a press on the magnifier or the padding puts the cursor in the text', async ({ mount, page }) => {
  const box = await mount(<Box />);
  const form = page.locator('#root').locator('form');
  const b = (await form.boundingBox())!;
  await form.click({ position: { x: 14, y: b.height / 2 } });
  await expect(page.locator('#root').getByRole('searchbox')).toBeFocused();
});

// decision table: phone / desktop × back given or not × clear shown or not
for (const docked of [false, true])
  for (const back of [false, true])
    for (const clear of [false, true])
      test(`search box: ${docked ? 'desktop' : 'phone'}, back ${back}, clear ${clear}`, async ({ mount, page }) => {
        const seen: string[] = [];
        const box = await mount(<Box docked={docked} showClear={clear} onBack={back ? () => seen.push('back') : undefined} onClear={() => seen.push('clear')} onCategory={() => seen.push('category')} />);
        await expect(page.locator('#root').getByRole('button', { name: 'Back' })).toHaveCount(back ? 1 : 0);
        await expect(page.locator('#root').getByRole('button', { name: 'Clear' })).toHaveCount(clear ? 1 : 0);
        await expect(page.locator('#root').getByRole('button', { name: 'Category' })).toHaveCount(docked ? 0 : 1);
        if (back) await page.locator('#root').getByRole('button', { name: 'Back' }).click();
        if (clear) await page.locator('#root').getByRole('button', { name: 'Clear' }).click();
        if (!docked) await page.locator('#root').getByRole('button', { name: 'Category' }).click();
        expect(seen).toEqual([...(back ? ['back'] : []), ...(clear ? ['clear'] : []), ...(docked ? [] : ['category'])]);
        await expectCleanLayout(box);
      });

test('search box: the Category button lit while Category is open', async ({ mount, page }) => {
  const box = await mount(<Box categoryOpen />);
  const cat = page.locator('#root').getByRole('button', { name: 'Category' });
  await expect(cat).toHaveAttribute('aria-expanded', 'true');
  await expect(cat).toHaveCSS('background-color', 'rgb(45, 52, 59)') // --ink;
});

test('search box: press feedback, focus ring, accessibility', async ({ mount, page }) => {
  const box = await mount(<Box value="villa" showClear onBack={noop} />);
  await expectPressFeedback(page, page.locator('#root').getByRole('button', { name: 'Clear' }));
  await expectPressFeedback(page, page.locator('#root').getByRole('button', { name: 'Back' }));
  await expectPressFeedback(page, page.locator('#root').getByRole('button', { name: 'Category' }));
  await expectFocusRing(page, page.locator('#root').getByRole('button', { name: 'Clear' }));
  await expectAccessible(page);
});

test('search box: on touch screens the text is 16 px (iPhone does not zoom the page)', async ({ mount, page, isMobile }) => {
  const box = await mount(<Box />);
  await expect(page.locator('#root').getByRole('searchbox')).toHaveCSS('font-size', isMobile ? '16px' : '14px');
});

test('search box: 40 px high; phone: Category button beside it, 8 px apart', async ({ mount, page }) => {
  const box = await mount(<Box />);
  const f = (await page.locator('#root').locator('form').boundingBox())!;
  const c = (await page.locator('#root').getByRole('button', { name: 'Category' }).boundingBox())!;
  expect([f.height, c.height, c.width]).toEqual([40, 40, 40]);
  expect(Math.round(c.x - (f.x + f.width))).toBe(8);
  expect(c.y).toBe(f.y);
});

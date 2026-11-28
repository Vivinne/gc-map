/* F6 rail, layer 2: the three buttons' lit, white and grey states (decision table, SPEC R7). */
import { expect, test } from '@playwright/experimental-ct-react';
import { expectAccessible, expectPressFeedback } from '../../../playwright/checks';
import { Rail, type RailPage } from './index';

const PAGES: RailPage[] = ['search', 'category', 'other'];

for (const open of [true, false])
  for (const page of PAGES)
    for (const canFold of [true, false])
      test(`rail: panel ${open ? 'open' : 'folded'}, page ${page}, something to fold ${canFold}`, async ({ mount }) => {
        const seen: string[] = [];
        const rail = await mount(<Rail open={open} page={page} canFold={canFold} onFold={() => seen.push('fold')} onToggle={() => seen.push('toggle')} onSearch={() => seen.push('search')} onCategory={() => seen.push('category')} />);
        const search = rail.getByRole('button', { name: 'Search' });
        const category = rail.getByRole('button', { name: 'Category' });
        const fold = rail.locator('.rail-fold');
        // lit: its page is on screen and the panel is open
        await expect(search).toHaveAttribute('aria-pressed', String(open && page === 'search'));
        await expect(category).toHaveAttribute('aria-pressed', String(open && page === 'category'));
        // the fold button works only for pages with no rail button of their own (card, number point list)
        const foldLive = canFold && page === 'other';
        await expect(fold).toBeEnabled({ enabled: foldLive });
        await expect(fold).toHaveClass(open && foldLive ? /\bon\b/ : /^(?!.*\bon\b)/);
        await search.click();
        await category.click();
        if (foldLive) await fold.click();
        const expected = [open && page === 'search' ? 'fold' : 'search', open && page === 'category' ? 'fold' : 'category', ...(foldLive ? ['toggle'] : [])];
        expect(seen).toEqual(expected);
      });

test('rail: 56 px wide, 40 px buttons 8 px apart, 16 px from the top', async ({ mount }) => {
  const rail = await mount(<Rail open page="other" canFold onFold={() => {}} onToggle={() => {}} onSearch={() => {}} onCategory={() => {}} />);
  expect(Math.round((await rail.boundingBox())!.width)).toBe(56);
  const boxes = await Promise.all([0, 1, 2].map((i) => rail.locator('.rail-btn').nth(i).boundingBox()));
  expect(boxes.map((b) => [Math.round(b!.width), Math.round(b!.height)])).toEqual([[40, 40], [40, 40], [40, 40]]);
  expect(Math.round(boxes[0]!.y)).toBe(16);
  expect(Math.round(boxes[1]!.y - boxes[0]!.y - 40)).toBe(8);
});

test('rail: press feedback on live buttons; a grey fold button gives none', async ({ mount, page }) => {
  const rail = await mount(<Rail open page="search" canFold onFold={() => {}} onToggle={() => {}} onSearch={() => {}} onCategory={() => {}} />);
  await expectPressFeedback(page, rail.getByRole('button', { name: 'Category' }));
  const fold = rail.locator('.rail-fold');
  await expect(fold).toBeDisabled();
  await expect(fold).toHaveCSS('cursor', 'default');
  await expectAccessible(page);
});

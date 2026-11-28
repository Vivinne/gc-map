/* A1 shell, layer 2: the whole page; which panel each screen shows, its title and \uff1c ×, the fallback page (gc/test-modules.md, shell). */
import { expect, test } from '@playwright/experimental-ct-react';
import type { Page } from '@playwright/test';
import { expectAccessible } from '../../playwright/checks';
import { streetTiles } from '../../playwright/map';
import { BUILDINGS } from '../data';
import App from './index';

const panel = (page: Page) => page.locator('main > section.panel, main > .dock > section.panel');
const title = (page: Page) => panel(page).locator('.p-head .h-title');
const rail = (page: Page, name: string) => page.locator('nav.rail').getByRole('button', { name, exact: true });

/** Desktop: Search on the rail, then wait for the box to take the cursor (it does once the panel is in) */
async function openSearch(page: Page) {
  await rail(page, 'Search').click();
  await expect(panel(page).getByRole('searchbox')).toBeFocused();
}

test.beforeEach(async ({ page }) => {
  await streetTiles(page, 'ok');
});

test.describe('desktop', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop');

  test('a fresh visit: the map with the rail, no panel', async ({ mount, page }) => {
    await mount(<App />);
    await expect(page.locator('nav.rail')).toBeVisible();
    await expect(panel(page)).toHaveCount(0);
    await expect(page.locator('.topbar')).toHaveCount(0);
  });

  test('Search from the rail: the search page slides out, the box is its top row with no title', async ({ mount, page }) => {
    await mount(<App />);
    await rail(page, 'Search').click();
    await expect(panel(page)).toHaveClass(/\bsearch\b/);
    await expect(page.locator('main > .dock')).toHaveClass(/\bslide-in\b/);
    await expect(panel(page).getByRole('searchbox')).toBeFocused();
    await expect(title(page)).toHaveCount(0);
    await expect(rail(page, 'Search')).toHaveAttribute('aria-pressed', 'true');
  });

  test('Category from the plain map: only ×; a tag: its name as title with \uff1c back to Category', async ({ mount, page }) => {
    await mount(<App />);
    await rail(page, 'Category').click();
    await expect(title(page)).toHaveText('Category');
    await expect(panel(page).getByRole('button', { name: 'Back' })).toHaveCount(0);
    await expect(panel(page).getByRole('button', { name: 'Close' })).toBeVisible();
    const tag = panel(page).locator('button').filter({ hasText: 'Baroque' }).first();
    await tag.click();
    await expect(title(page)).toHaveText('Baroque');
    await expect(page.locator('main > .dock')).not.toHaveClass(/\bslide-in\b/);
    await panel(page).getByRole('button', { name: 'Back' }).click();
    await expect(title(page)).toHaveText('Category');
    await panel(page).getByRole('button', { name: 'Close' }).click();
    await expect(panel(page)).toHaveCount(0);
  });

  test('a search: results with the count read out; a row opens its card; \uff1c back to the results', async ({ mount, page }) => {
    await mount(<App />);
    await openSearch(page);
    await page.keyboard.type('villa');
    await page.keyboard.press('Enter');
    const status = page.getByRole('status').filter({ hasText: /results?$/ });
    await expect(status).toHaveText(/^\d+ results?$/);
    const n = Number((await status.textContent())!.split(' ')[0]);
    await expect(panel(page).locator('.row')).toHaveCount(n);
    const first = (await panel(page).locator('.row b').first().textContent())!;
    await panel(page).locator('.row').first().click();
    await expect(panel(page)).toHaveClass(/\bcard\b/);
    await expect(panel(page).locator('h1')).toHaveText(first);
    await expect(rail(page, 'Search')).toHaveAttribute('aria-pressed', 'false');
    await panel(page).getByRole('button', { name: 'Back' }).click();
    await expect(panel(page).locator('.row')).toHaveCount(n);
  });

  test('fold button: lit on a card, folds the panel; white while folded, opens it again on the same card', async ({ mount, page }) => {
    await mount(<App />);
    await openSearch(page);
    await page.keyboard.type('pantheon');
    await page.keyboard.press('Enter');
    await panel(page).locator('.row').first().click();
    const fold = page.locator('nav.rail .rail-fold');
    await expect(fold).toHaveClass(/\bon\b/);
    await fold.click();
    await expect(panel(page)).toHaveCount(0);
    await expect(fold).toBeEnabled();
    await expect(fold).not.toHaveClass(/\bon\b/);
    await fold.click();
    await expect(panel(page)).toHaveClass(/\bcard\b/);
  });

  test('typed text that finds nothing: No Results with its hint, Enter does not send', async ({ mount, page }) => {
    await mount(<App />);
    await openSearch(page);
    await page.keyboard.type('zzqxv');
    await expect(panel(page)).toContainText('No Results');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status').filter({ hasText: /results?$|No Results/ })).toHaveCount(0);
  });
});

test.describe('phone', () => {
  test.skip(({ isMobile }) => !isMobile, 'phone');

  test('a fresh visit: search box and Category top left, no rail, no zoom buttons', async ({ mount, page }) => {
    await mount(<App />);
    await expect(page.locator('.topbar')).toBeVisible();
    await expect(page.locator('nav.rail')).toHaveCount(0);
    await expect(page.locator('.ctrls')).toBeHidden();
  });

  test('Category: under the search box; a tag: a sheet from the bottom with the tag as title', async ({ mount, page }) => {
    await mount(<App />);
    await page.locator('.topbar').getByRole('button', { name: 'Category' }).click();
    await expect(panel(page)).toHaveClass(/\btop\b/);
    await panel(page).locator('.chip').filter({ hasText: 'Baroque' }).click();
    await expect(panel(page)).toHaveClass(/\bsheet\b/);
    await expect(title(page)).toHaveText('Baroque');
  });

  test('a search from the box: results in a sheet; the box keeps the text; a row opens the card in a sheet', async ({ mount, page }) => {
    await mount(<App />);
    const box = page.locator('.topbar').getByRole('searchbox');
    await box.click();
    // an empty box with nothing recent opens no panel
    await expect(panel(page)).toHaveCount(0);
    await page.keyboard.type('villa');
    await expect(panel(page)).toHaveClass(/\bpreview\b/);
    await expect(panel(page).locator('.row').first()).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(panel(page)).toHaveClass(/\bresults\b/);
    await expect(panel(page)).toHaveClass(/\bsheet\b/);
    await expect(box).toHaveValue('villa');
    await panel(page).locator('.row').first().click();
    await expect(panel(page)).toHaveClass(/\bcard\b/);
  });
});

test('no WebGL: the fallback page lists every building while no panel is open, and none while one is', async ({ mount, page, isMobile }) => {
  await page.evaluate(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...rest: unknown[]) {
      return /webgl/.test(kind) ? null : (get as (...a: unknown[]) => unknown).call(this, kind, ...rest);
    } as typeof get;
  });
  await mount(<App />);
  const down = page.locator('.map-down');
  await expect(down.locator('h2')).toHaveText("The map can't be shown in this browser.");
  await expect(down.locator('.row')).toHaveCount(BUILDINGS.length);
  await expect(page.locator('.sr-only').filter({ hasText: 'Map unavailable' })).toHaveCount(1);
  if (isMobile) await page.locator('.topbar').getByRole('button', { name: 'Category' }).click();
  else await rail(page, 'Category').click();
  await expect(down.locator('.row')).toHaveCount(0);
});

test('accessibility: the page with a results list open', async ({ mount, page, isMobile }) => {
  await mount(<App />);
  if (isMobile) await page.locator('.topbar').getByRole('searchbox').click();
  else await openSearch(page);
  await page.keyboard.type('villa');
  await page.keyboard.press('Enter');
  await expect(panel(page).locator('.row').first()).toBeVisible();
  await page.waitForTimeout(500);
  await expectAccessible(page);
});

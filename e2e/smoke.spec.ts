/* Layer 4 core flow (runs on every deploy): search, open a card, back, close; no page errors. */
import { expect, test } from '@playwright/test';

test('core flow: search, card, back, close', async ({ page, isMobile }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('./');
  if (!isMobile) await page.getByRole('button', { name: 'Search' }).first().click();
  const box = page.getByRole('searchbox').or(page.locator('input')).first();
  await box.click();
  await box.fill('villa');
  await box.press('Enter');
  await expect(page).toHaveURL(/q=villa/);
  const rows = page.locator('.row');
  await expect(rows.first()).toBeVisible();
  await rows.first().click();
  await expect(page).toHaveURL(/b=/);
  await page.getByRole('button', { name: 'Back' }).first().click();
  await expect(page).not.toHaveURL(/b=/);
  await page.keyboard.press('Escape');
  await expect(page).not.toHaveURL(/q=/);
  expect(errors).toEqual([]);
});

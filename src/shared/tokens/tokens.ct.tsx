/* S1 tokens, layer 2: page base, focus ring, reduced motion (KEEP.md). */
import { expect, test } from '@playwright/experimental-ct-react';
import { expectFocusRing } from '../../../playwright/checks';
import { HeadBar } from '../ui';
import { PAPER } from './index';

const rgb = (hex: string) => {
  const h = hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex;
  return `rgb(${parseInt(h.slice(1, 3), 16)}, ${parseInt(h.slice(3, 5), 16)}, ${parseInt(h.slice(5, 7), 16)})`;
};

test('tokens: page paper colour, interface font', async ({ mount, page }) => {
  await mount(<HeadBar canBack onBack={() => {}} onClose={() => {}} title="Category" />);
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(rgb(PAPER));
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('.h-title')!).fontFamily)).toMatch(/Archivo/);
});

test('tokens: keyboard focus shows a 3 px ink ring', async ({ mount, page }) => {
  const row = await mount(<HeadBar canBack onBack={() => {}} onClose={() => {}} />);
  await expectFocusRing(page, row.getByRole('button', { name: 'Back' }));
  await expect(row.getByRole('button', { name: 'Back' })).toHaveCSS('outline-width', '3px');
  await expect(row.getByRole('button', { name: 'Back' })).toHaveCSS('outline-color', 'rgb(45, 52, 59)');
});

test('tokens: with reduced motion, nothing moves or fades', async ({ mount, page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const row = await mount(<HeadBar canBack onBack={() => {}} onClose={() => {}} />);
  const s = await row.getByRole('button', { name: 'Back' }).evaluate((e) => [getComputedStyle(e).transitionDuration, getComputedStyle(e).animationName]);
  expect(s).toEqual(['0s', 'none']);
});

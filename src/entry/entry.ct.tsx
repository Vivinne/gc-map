/* A2 entry, layer 2: error guard (one reload after a deploy, never a loop) and the /atlas redirect. */
import { expect, test } from '@playwright/experimental-ct-react';
import { expectAccessible, expectPressFeedback } from '../../playwright/checks';
import { Redirect } from './index';
import { GuardedFailure } from './entry.story';

test('guard: a running app shows as it is', async ({ mount }) => {
  const c = await mount(<GuardedFailure kind="none" />);
  await expect(c).toContainText('App is running');
});

test('guard: an ordinary error shows the error page with Reload; nothing reloads by itself', async ({ mount, page }) => {
  let loads = 0;
  page.on('load', () => loads++);
  const c = await mount(<GuardedFailure kind="error" />);
  await expect(page.getByRole('alert')).toContainText('Something went wrong');
  await page.waitForTimeout(500);
  expect(loads).toBe(0);
  await expectPressFeedback(page, page.getByRole('button', { name: 'Reload' }));
  await expectAccessible(page);
  await c.unmount();
});

test('guard: a missing script file (after a deploy) reloads once, then stays on the error page', async ({ mount, page }) => {
  await page.evaluate(() => sessionStorage.removeItem('gc-atlas:reloaded'));
  const reload = page.waitForEvent('load');
  await mount(<GuardedFailure kind="chunk" />);
  await reload;
  expect(await page.evaluate(() => sessionStorage.getItem('gc-atlas:reloaded'))).toBe('1');
  // the second failure does not reload again
  let loads = 0;
  page.on('load', () => loads++);
  await mount(<GuardedFailure kind="chunk" />);
  await expect(page.getByRole('alert')).toBeVisible();
  await page.waitForTimeout(500);
  expect(loads).toBe(0);
});

test('guard: with storage blocked a missing script file does not reload (no endless reloading)', async ({ mount, page }) => {
  await page.evaluate(() => Object.defineProperty(window, 'sessionStorage', { get: () => { throw new Error('blocked'); } }));
  let loads = 0;
  page.on('load', () => loads++);
  await mount(<GuardedFailure kind="chunk" />);
  await expect(page.getByRole('alert')).toBeVisible();
  await page.waitForTimeout(500);
  expect(loads).toBe(0);
});

test('redirect: goes to the new address with the query, and shows a link', async ({ mount, page }) => {
  const c = await mount(<Redirect to="#moved" />);
  await expect(c.getByRole('link', { name: 'GC Atlas' })).toHaveAttribute('href', '#moved');
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#moved');
});

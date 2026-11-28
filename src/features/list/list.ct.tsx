/* F3 list, layer 2: rows, country lines, Other Possible Outcomes, No Results (gc/test-modules.md, list). */
import { expect, test } from '@playwright/experimental-ct-react';
import { expectAccessible, expectCleanLayout, expectFocusRing, expectPressFeedback } from '../../../playwright/checks';
import { BUILDINGS, ERAS, architectOf, builtOf, shownStyle } from '../../data';
import { ListInPanel } from './list.story';

const hex = (c: string) => `rgb(${parseInt(c.slice(1, 3), 16)}, ${parseInt(c.slice(3, 5), 16)}, ${parseInt(c.slice(5, 7), 16)})`;
const longest = [...BUILDINGS].sort((a, b) => b.name.length - a.name.length).slice(0, 3);
const five = BUILDINGS.slice(0, 5);
const ev = () => {
  const seen: string[] = [];
  return { seen, onEvent: (k: string, v: string) => seen.push(`${k}:${v}`) };
};

test('rows: colour strip, name in bold, built · city, architect · style', async ({ mount }) => {
  const list = await mount(<ListInPanel list={five} onEvent={() => {}} />);
  for (const [i, b] of five.entries()) {
    const row = list.locator('.row').nth(i);
    await expect(row.locator('.strip')).toHaveCSS('background-color', hex(ERAS[b.era].color));
    await expect(row.locator('b')).toHaveText(b.name);
    await expect(row.locator('b')).toHaveCSS('font-weight', '700');
    await expect(row.locator('.row-t > span').nth(1)).toContainText(shownStyle(b));
    if (builtOf(b)) await expect(row.locator('.row-t > span').first()).toContainText(builtOf(b));
    if (architectOf(b) !== '-') await expect(row.locator('.row-who').first()).toBeVisible();
  }
});

test('rows: the longest names wrap, never cut with …', async ({ mount }) => {
  const list = await mount(<ListInPanel list={longest} onEvent={() => {}} />);
  await expectCleanLayout(list);
});

test('rows: a press opens the building; pointing reports it and leaving clears it', async ({ mount, page, isMobile }) => {
  const e = ev();
  const list = await mount(<ListInPanel list={five} onEvent={e.onEvent} />);
  await list.locator('.row').nth(1).click();
  expect(e.seen).toContain(`open:${five[1]!.id}`);
  if (!isMobile) {
    await page.mouse.move(600, 600);
    await expect.poll(() => e.seen.at(-1)).toBe('hover:');
    e.seen.length = 0;
    await list.locator('.row').nth(2).hover();
    await page.mouse.move(600, 600);
    await expect.poll(() => e.seen.filter((s) => s.startsWith('hover'))).toEqual([`hover:${five[2]!.id}`, 'hover:']);
  }
});

test('rows: the rows on screen are reported as the list scrolls', async ({ mount }) => {
  const e = ev();
  const list = await mount(<ListInPanel list={BUILDINGS.slice(0, 30)} onEvent={e.onEvent} />);
  await expect.poll(() => e.seen.filter((s) => s.startsWith('visible:')).at(-1)?.split('~')[0]).toBe(`visible:${BUILDINGS[0]!.id}`);
  await list.evaluate((el) => (el.scrollTop = el.scrollHeight));
  await expect.poll(() => e.seen.at(-1)?.includes(BUILDINGS[29]!.id)).toBe(true);
});

// boundary: 9 rows are not split by country, 10 are
for (const n of [9, 10])
  test(`country lines: ${n} rows`, async ({ mount }) => {
    const list = await mount(<ListInPanel list={BUILDINGS.slice(0, n)} country onEvent={() => {}} />);
    await expect(list.locator('.c-head')).toHaveCount(n >= 10 ? new Set(BUILDINGS.slice(0, n).map((b) => b.nation)).size : 0);
  });

// decision table: the map shows the country framed or not
for (const framed of [false, true])
  test(`country line: ${framed ? 'already framed (grey, not clickable)' : 'clickable'}`, async ({ mount, page }) => {
    const e = ev();
    const list = await mount(<ListInPanel list={BUILDINGS.slice(0, 12)} country framed={framed} onEvent={e.onEvent} />);
    const head = list.locator('.c-head').first();
    await head.click({ force: true });
    expect(e.seen.some((s) => s.startsWith('country:'))).toBe(!framed);
    await expect(head).toHaveAttribute('aria-disabled', String(framed));
    if (framed) await expect(head).toHaveCSS('cursor', 'default');
    else await expectPressFeedback(page, head);
  });

test('Other Possible Outcomes: a button, then a grey line with ∧ that folds them away', async ({ mount, page }) => {
  const e = ev();
  const list = await mount(<ListInPanel list={five} more={BUILDINGS.slice(5, 8)} onEvent={e.onEvent} />);
  await expectPressFeedback(page, list.getByRole('button', { name: 'Other Possible Outcomes' }));
  await list.getByRole('button', { name: 'Other Possible Outcomes' }).click();
  await expect(list.locator('.row')).toHaveCount(8);
  await expectPressFeedback(page, list.getByRole('button', { name: 'Fold away' }));
  await list.getByRole('button', { name: 'Fold away' }).click();
  await expect(list.locator('.row')).toHaveCount(5);
  expect(e.seen.filter((s) => s.startsWith('more'))).toEqual(['more:open', 'more:close']);
});

test('No Results with its grey hint; with other outcomes waiting, the button follows', async ({ mount }) => {
  const list = await mount(<ListInPanel list={[]} more={BUILDINGS.slice(0, 2)} onEvent={() => {}} />);
  await expect(list.getByText('No Results')).toBeVisible();
  await expect(list.getByText('Try other words, or clear the search with ×.')).toBeVisible();
  await expect(list.getByRole('button', { name: 'Other Possible Outcomes' })).toBeVisible();
});

test('recent buildings: the remove × reports its building and keeps room beside the text', async ({ mount, page }) => {
  const e = ev();
  const list = await mount(<ListInPanel list={longest} remove onEvent={e.onEvent} />);
  await list.getByRole('button', { name: `Remove ${longest[0]!.name} from recent` }).click();
  expect(e.seen).toContain(`remove:${longest[0]!.id}`);
  expect(e.seen.some((s) => s.startsWith('open:'))).toBe(false);
  await expectCleanLayout(list, { inside: '.rm-x' });
});

// known defect, kept until the user decides (T3-3): with a mouse, the pressed × looks the same as the pointed ×
test('recent buildings: the remove × looks different while pressed', async ({ mount, page, isMobile }) => {
  test.fail(!isMobile, 'T3-3');
  const list = await mount(<ListInPanel list={longest} remove onEvent={() => {}} />);
  await expectPressFeedback(page, list.locator('.rm-x').first(), { move: false });
});

test('rows: press feedback, focus ring, accessibility', async ({ mount, page }) => {
  const list = await mount(<ListInPanel list={five} country onEvent={() => {}} />);
  await expectPressFeedback(page, list.locator('.row').first());
  await expectFocusRing(page, list.locator('.row').nth(2));
  await expectAccessible(page);
});

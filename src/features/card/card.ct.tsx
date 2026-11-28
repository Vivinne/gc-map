/* F4 card, layer 2: the building card alone (gc/test-modules.md, card). */
import { expect, test } from '@playwright/experimental-ct-react';
import { expectAccessible, expectCleanLayout, expectFocusRing, expectPressFeedback } from '../../../playwright/checks';
import { BUILDINGS, ERAS, architectOf, architectParts, builtOf, examNote, shownStyle, type Building } from '../../data';
import { BuildingCard } from './index';

const hex = (c: string) => `rgb(${parseInt(c.slice(1, 3), 16)}, ${parseInt(c.slice(3, 5), 16)}, ${parseInt(c.slice(5, 7), 16)})`;
const find = (f: (b: Building) => boolean) => BUILDINGS.find(f)!;
const KIND = {
  none: find((b) => architectOf(b) === '-'),
  one: find((b) => architectParts(b).length === 1 && !/&/.test(architectOf(b))),
  two: find((b) => architectParts(b).filter((p) => p.search).length === 2),
  three: find((b) => architectParts(b).filter((p) => p.search).length >= 3),
  firm: find((b) => /&/.test(architectOf(b))),
};
const noop = () => {};

test('card: title on the category colour, name, built · city, style, summary, exam years last', async ({ mount, isMobile }) => {
  const b = find((x) => x.exams.length > 0 && !!x.summary && x.tags.length > 0);
  const card = await mount(<BuildingCard b={b} mobile={isMobile} canBack onBack={noop} onClose={noop} onArchitect={noop} />);
  await expect(card.locator('.c-top')).toHaveCSS('background-color', hex(ERAS[b.era].color));
  await expect(card.locator('h1')).toHaveText(b.name);
  await expect(card.locator('h1')).toHaveCSS('font-weight', '800');
  await expect(card.locator('.c-line').first()).toContainText(builtOf(b));
  await expect(card.locator('.c-line').nth(1)).toContainText(shownStyle(b));
  await expect(card.locator('.c-sum')).toHaveText(b.summary);
  const exam = card.locator('.exam');
  await expect(exam).toHaveText(examNote(b));
  await expect(exam).toHaveCSS('font-style', 'italic');
  await expect(card.locator('.c-body > *').last()).toHaveClass(/exam/);
  await expectCleanLayout(card);
});

test('card: no exam years, no exam line', async ({ mount }) => {
  const card = await mount(<BuildingCard b={find((x) => x.exams.length === 0)} mobile={false} canBack onBack={noop} onClose={noop} onArchitect={noop} />);
  await expect(card.locator('.exam')).toHaveCount(0);
});

test('card: keywords in one italic line, labelled (E3), struck ones stay struck', async ({ mount }) => {
  const b = find((x) => x.tags.some((t) => t.startsWith('~~')));
  const card = await mount(<BuildingCard b={b} mobile={false} canBack onBack={noop} onClose={noop} onArchitect={noop} />);
  const keys = card.locator('.c-keys');
  await expect(keys).toHaveCSS('font-style', 'italic');
  await expect(keys).toContainText('\u95dc\u9375\u5b57\uff1a');
  await expect(keys.locator('s')).toHaveCount(b.tags.filter((t) => t.startsWith('~~')).length);
});

// decision table: who built it
for (const [kind, b] of Object.entries(KIND))
  test(`card: architects (${kind}): each person is a link that searches that name`, async ({ mount }) => {
    const asked: string[] = [];
    const card = await mount(<BuildingCard b={b} mobile={false} canBack onBack={noop} onClose={noop} onArchitect={(n) => asked.push(n)} />);
    const people = architectParts(b).filter((p) => p.search);
    const links = card.locator('.c-who');
    await expect(links).toHaveCount(people.length);
    for (let i = 0; i < people.length; i++) await links.nth(i).click();
    expect(asked).toEqual(people.map((p) => p.search));
  });

// SPEC 9 (user, 2026-11-28): no architect shows the style only, as the list rows do
test('card: no architect shows the style only', async ({ mount }) => {
  const card = await mount(<BuildingCard b={KIND.none} mobile={false} canBack onBack={noop} onClose={noop} onArchitect={noop} />);
  await expect(card.locator('.c-line').nth(1)).toHaveText(shownStyle(KIND.none));
});

test('card: data lines carry no Chinese and no field names', async ({ mount }) => {
  for (const b of BUILDINGS.slice(0, 40)) {
    const card = await mount(<BuildingCard b={b} mobile={false} canBack onBack={noop} onClose={noop} onArchitect={noop} />);
    for (const line of await card.locator('.c-line').allTextContents()) expect(line, b.id).not.toMatch(/[\u3400-\u9fff]|Architect:|Style:|Built:/);
    await card.unmount();
  }
});

for (const canBack of [true, false])
  test(`card: \uff1c ${canBack ? 'shown' : 'hidden'}; \uff1c and × report`, async ({ mount, isMobile }) => {
    const seen: string[] = [];
    const card = await mount(<BuildingCard b={KIND.one} mobile={isMobile} canBack={canBack} onBack={() => seen.push('back')} onClose={() => seen.push('close')} onArchitect={noop} />);
    await expect(card.getByRole('button', { name: 'Back' })).toHaveCount(canBack ? 1 : 0);
    if (canBack) await card.getByRole('button', { name: 'Back' }).click();
    await card.getByRole('button', { name: 'Close' }).click();
    expect(seen).toEqual(canBack ? ['back', 'close'] : ['close']);
  });

test('card: the card text can be selected; press feedback, focus ring, accessibility', async ({ mount, page, isMobile }) => {
  const card = await mount(<BuildingCard b={KIND.two} mobile={isMobile} canBack onBack={noop} onClose={noop} onArchitect={noop} />);
  await expect(card.locator('.c-sum')).not.toHaveCSS('user-select', 'none');
  await expectPressFeedback(page, card.locator('.c-who').first());
  await expectPressFeedback(page, card.getByRole('button', { name: 'Close' }));
  await expectFocusRing(page, card.locator('.c-who').first());
  await expectAccessible(page);
});

// WCAG 1.4.3 / 1.4.11: white bold 22 px title and the white \uff1c × on the category colour need 3:1
const lum = (h: string) => {
  const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
};
// T3-2 (fixed 2026-11-28): Ancient and Medieval darkened
test('card: white title on every category colour reaches 3:1', async () => {
  for (const e of Object.values(ERAS)) expect(1.05 / (lum(e.color) + 0.05), e.label).toBeGreaterThanOrEqual(3);
});

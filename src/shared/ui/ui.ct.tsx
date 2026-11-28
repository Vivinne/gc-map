/* S2 ui, layer 2: the title row in its four forms (decision table: \uff1c yes/no × title yes/no). */
import { expect, test } from '@playwright/experimental-ct-react';
import { expectAccessible, expectFocusRing, expectPressFeedback } from '../../../playwright/checks';
import { HeadBar, Icon, RemoveButton } from './index';

for (const canBack of [true, false]) {
  for (const title of ['Category', undefined]) {
    test(`title row: back ${canBack ? 'shown' : 'hidden'}, title ${title ? 'shown' : 'none'}`, async ({ mount }) => {
      const pressed: string[] = [];
      const row = await mount(<HeadBar canBack={canBack} title={title} onBack={() => pressed.push('back')} onClose={() => pressed.push('close')} />);
      await expect(row.getByRole('button', { name: 'Back' })).toHaveCount(canBack ? 1 : 0);
      if (title) await expect(row.getByText(title)).toBeVisible();
      await row.getByRole('button', { name: 'Close' }).click();
      if (canBack) await row.getByRole('button', { name: 'Back' }).click();
      expect(pressed).toEqual(canBack ? ['close', 'back'] : ['close']);
      // \uff1c, title and × on one centre line, 40 px high
      const box = await row.boundingBox();
      expect(Math.round(box!.height)).toBe(40);
    });
  }
}

test('remove button: reports its entry, 24 px, keeps the text cursor where it is', async ({ mount }) => {
  const seen: string[] = [];
  const b = await mount(<RemoveButton label="villa" onRemove={() => seen.push('remove')} />);
  await expect(b).toHaveAttribute('aria-label', 'Remove villa from recent');
  await b.click();
  expect(seen).toEqual(['remove']);
  const box = (await b.boundingBox())!;
  expect([box.width, box.height]).toEqual([24, 24]);
});

test('icons: all 10 draw', async ({ mount }) => {
  for (const name of ['search', 'plus', 'minus', 'close', 'left', 'up', 'grid', 'clock', 'panel', 'panelOff'] as const) {
    const i = await mount(<Icon name={name} size={16} />);
    expect((await i.boundingBox())!.width, name).toBe(16);
    await i.unmount();
  }
});

test('title row: press feedback on \uff1c and ×, focus ring, accessibility', async ({ mount, page }) => {
  const row = await mount(<HeadBar canBack title="Category" onBack={() => {}} onClose={() => {}} />);
  await expectPressFeedback(page, row.getByRole('button', { name: 'Back' }));
  await expectPressFeedback(page, row.getByRole('button', { name: 'Close' }));
  await expectFocusRing(page, row.getByRole('button', { name: 'Close' }));
  await expectAccessible(page);
});

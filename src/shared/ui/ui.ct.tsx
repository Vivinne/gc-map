/* S2 ui, layer 2: the title row in its four forms (decision table: ＜ yes/no × title yes/no). */
import { expect, test } from '@playwright/experimental-ct-react';
import { HeadBar } from './index';

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
      // ＜, title and × on one centre line, 40 px high
      const box = await row.boundingBox();
      expect(Math.round(box!.height)).toBe(40);
    });
  }
}

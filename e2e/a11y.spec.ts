/*
 * Layer 5 accessibility (WCAG 2.2 AA rules, axe): no violation beyond the agreed baseline (e2e/a11y-baseline.json,
 * taken from the old version: the light grey small text is an accepted exception).
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const baseline = JSON.parse(readFileSync(join(__dirname, 'a11y-baseline.json'), 'utf8')) as Record<string, string[]>;

const screens: [string, (p: import('@playwright/test').Page, mobile: boolean) => Promise<void>][] = [
  ['plain map', async () => {}],
  ['results', async (p, m) => {
    if (!m) await p.getByRole('button', { name: 'Search' }).first().click();
    const box = p.locator('input').first();
    await box.click();
    await box.fill('the');
    await box.press('Enter');
    await p.locator('.row').first().waitFor();
  }],
];

for (const [name, open] of screens) {
  test(`axe: ${name}`, async ({ page, isMobile }, info) => {
    await page.goto('./');
    await open(page, isMobile);
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    const found = [...new Set(r.violations.map((v) => v.id))].sort();
    const key = `${info.project.name} ${name}`;
    // A11Y_RECORD=<file>: record this build's violations (to take the baseline from the old version)
    if (process.env.A11Y_RECORD) return void appendFileSync(process.env.A11Y_RECORD, JSON.stringify({ [key]: found }) + '\n');
    expect(found.filter((id) => !(baseline[key] ?? []).includes(id)), key).toEqual([]);
  });
}

/*
 * Layer 4.3 addresses (SPEC §11): every field alone and in the common pairs, edge and broken values. A shared link
 * opens that screen with no \uff1c; a broken one opens what it can and never the error page.
 */
import { test } from '@playwright/test';
import { expect, problems, record, rest, screenOf, stateOf } from './support/site';
import { streetTiles } from '../playwright/map';

const LINKS: [string, string][] = [
  ['q', 'q=villa'],
  ['q + m', 'q=villa&m=11.5,45.5,8'],
  ['p=search', 'p=search'],
  ['p=search + q', 'p=search&q=villa'],
  ['p=category', 'p=category'],
  ['p=era + q', 'p=era&q=Baroque'],
  ['b', 'b=pantheon-rome'],
  ['b + m', 'b=pantheon-rome&m=12.47,41.9,15'],
  ['q + b', 'q=villa&b=villa-capra-la-rotonda-vicenza'],
  ['g', 'g=parthenon-athens~erechtheion-athens'],
  ['g + m', 'g=parthenon-athens~erechtheion-athens&m=23.72,37.97,15'],
  ['m only', 'm=2.35,48.86,12'],
  ['m at the edges', 'm=180,85.0511,0'],
  ['m beyond the edges', 'm=500,-99,30'],
  ['m broken', 'm=abc,,1'],
  ['b unknown', 'b=no-such-building'],
  ['g unknown and known', 'g=no-such~pantheon-rome'],
  ['g empty', 'g='],
  ['p=era without q', 'p=era'],
  ['p unknown', 'p=settings'],
  ['q with no match', 'q=zzqxv'],
  ['q empty', 'q='],
  ['q with symbols', `q=${encodeURIComponent('St. Peter\'s & co %')}`],
  ['q in Chinese', `q=${encodeURIComponent('\u5927\u6559\u5802')}`],
  ['q very long', `q=${'a'.repeat(1000)}`],
  ['unknown field', 'x=1&q=villa'],
];

for (const [name, query] of LINKS)
  test(`shared link: ${name}`, async ({ page, isMobile }, info) => {
    await streetTiles(page, 'ok');
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`./?${query}`);
    await page.waitForFunction(() => !!document.querySelector('.map-canvas canvas'));
    await rest(page);
    const s = await stateOf(page);
    record({ project: info.project.name, test: `link ${name}`, step: 'open', screen: await screenOf(page), ...s });
    expect(errors).toEqual([]);
    expect(await problems(page, isMobile)).toEqual([]);
    expect(s.history, 'a shared link has no steps behind it').toBe(1);
    expect(s.back).toBe(false);
  });

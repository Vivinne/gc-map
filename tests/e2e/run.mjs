// Browser checks of the single-file build (site/index.html) in Chromium with software WebGL.
// Street tiles are not needed: the offline basemap draws the map. Screenshots go to .e2e/.
// Usage: npm run site && npm run e2e
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const url = new URL('../../site/index.html', import.meta.url).href;
const shots = new URL('../../.e2e/', import.meta.url);
mkdirSync(shots, { recursive: true });
const results = [];
const check = (name, ok, info = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? `  (${info})` : ''}`);
};

// CHROMIUM_PATH lets the checks reuse an installed browser when the Playwright version differs
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

async function open(viewport, hash = '') {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource|openfreemap|ERR_/i.test(m.text())) errors.push(m.text());
  });
  await page.goto(url + hash);
  await page.waitForSelector('.overlay', { timeout: 15000 });
  await page.waitForTimeout(1200);
  return { page, errors };
}
const shot = (page, name) => page.screenshot({ path: new URL(`${name}.png`, shots).pathname });

// ---------- desktop ----------
{
  const { page, errors } = await open({ width: 1440, height: 900 });
  check('map draws city circles', (await page.locator('.overlay .donut').count()) >= 5);
  check('city list shows Rome first', (await page.locator('.index .city .nm').first().textContent()) === 'Rome');
  await shot(page, 'd1-home');

  // Style chip: instant pressed state and counts
  await page.locator('.styles .chip', { hasText: 'Modern' }).click();
  check('style chip toggles on', (await page.locator('.styles .chip.on').count()) === 1);
  check('list switches to results', /68 buildings/.test(await page.locator('.lhead').first().textContent()));
  await page.locator('.styles .chip', { hasText: 'Modern' }).click();

  // City focus and building detail
  await page.locator('.index .city', { hasText: 'Rome' }).click();
  await page.waitForTimeout(1200);
  check('city crumb shows Rome', (await page.locator('.crumb b').textContent()) === 'Rome');
  await page.locator('.row', { hasText: 'Domus Aurea' }).click();
  await page.waitForTimeout(1200);
  check('detail opens', (await page.locator('.detail h1').textContent()) === 'DOMUS AUREA');
  check('exam line shown', /2007 TEST-ARCHED/.test(await page.locator('.detail .exam').textContent()));
  check('position line', /of 26 in Rome/.test(await page.locator('.d-pos').textContent()));
  check('nearby list has 3', (await page.locator('.relgrp').first().locator('.rel').count()) === 3);
  check('labels drawn at city scale', (await page.locator('.overlay .place-lbl').count()) >= 10);
  await shot(page, 'd2-building');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(300);
  check('arrow key moves to next', (await page.locator('.detail h1').textContent()) !== 'DOMUS AUREA');
  await page.keyboard.press('s');
  check('star toggles', (await page.locator('.d-tools button.on').count()) === 1);
  check('seen counter counts', /2 seen/.test(await page.locator('.seen .t').textContent()));
  await page.keyboard.press('Escape');
  check('Esc closes detail', (await page.locator('.detail').count()) === 0);

  // Same-spot chooser (four St. Peter's entries share one coordinate)
  await page.keyboard.press('/');
  await page.keyboard.type('Baldacchino');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1200);
  await page.keyboard.press('Escape');
  const pile = page.locator('.overlay .pile').first();
  if (await pile.count()) {
    await pile.click({ force: true });
    check('same-spot chooser opens', (await page.locator('.stack-pick .sp-row').count()) >= 2);
    await page.locator('.stack-pick .sp-row').first().click();
    check('chooser opens a building', (await page.locator('.detail').count()) === 1);
    await page.keyboard.press('Escape');
  } else check('same-spot marker visible', false);
  await page.keyboard.press('Escape');

  // Search panel
  await page.keyboard.press('/');
  await page.keyboard.type('corb');
  await page.waitForTimeout(200);
  check('search finds the architect', (await page.locator('.hit .av').first().textContent()) === 'LC');
  check('search lists 6 buildings', (await page.locator('.hit .sq').count()) === 6);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await shot(page, 'd3-search');
  await page.keyboard.press('Tab');
  await page.waitForTimeout(400);
  check('Tab keeps a list filter', (await page.locator('.pill', { hasText: 'Search: corb' }).count()) === 1);
  check('toast with undo', (await page.locator('.toast button', { hasText: 'Undo' }).count()) === 1);
  await page.locator('.toast button').click();
  check('undo restores', (await page.locator('.pill').count()) === 0);

  // Chinese note text is searchable
  await page.keyboard.press('/');
  await page.keyboard.type('\u5eca\u9999');
  await page.waitForTimeout(200);
  check('search matches note text', (await page.locator('.hit', { hasText: 'Ronchamp' }).count()) === 1);
  await page.keyboard.press('Escape');

  // Period band: drag a span
  const band = page.locator('.band-svg');
  const box = await band.boundingBox();
  await page.mouse.move(box.x + box.width * 0.62, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.8, box.y + 20, { steps: 8 });
  await page.mouse.move(box.x + box.width * 0.95, box.y + 20, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  check('band drag sets a period', (await page.locator('.pill', { hasText: 'Period' }).count()) === 1);
  await page.locator('.toggle', { hasText: 'Asked in previous years' }).click();
  await page.keyboard.press('t');
  await page.waitForTimeout(600);
  check('timeline draws items', (await page.locator('.tl-item').count()) > 10);
  await page.locator('.tl-item').nth(8).hover();
  await page.waitForTimeout(200);
  check('timeline hover preview', (await page.locator('.tl-side .tcard').count()) === 1);
  await shot(page, 'd4-timeline');
  await page.locator('.tl-item').nth(8).click();
  await page.waitForTimeout(900);
  check('timeline click opens on map', (await page.locator('.detail').count()) === 1 && (await page.locator('.modes .on').textContent()).includes('Map'));
  await page.keyboard.press('Escape');

  // Review
  await page.keyboard.press('r');
  await page.waitForTimeout(400);
  check('review starts with all buildings', /of 204 known/.test(await page.locator('.r-prog').textContent()));
  check('name hidden first', (await page.locator('.hidden-name').count()) === 1);
  await shot(page, 'd5-review');
  await page.keyboard.press(' ');
  check('space shows answer', (await page.locator('.rc-ans').count()) === 1);
  await page.keyboard.press('2');
  await page.waitForTimeout(150);
  check('got it counts', /1 of 204 known/.test(await page.locator('.r-prog').textContent()));

  // URL state round trip
  await page.keyboard.press('m');
  const hash = await page.evaluate(() => location.hash);
  check('address keeps the filters', /e=1/.test(hash) && /r=/.test(hash), hash);
  check('no script errors (desktop)', errors.length === 0, errors.join(' | '));
  await page.close();
}

// ---------- address restores a selection ----------
{
  const { page, errors } = await open({ width: 1440, height: 900 }, '#b=pantheon-rome');
  await page.waitForTimeout(1200);
  check('address opens a building', (await page.locator('.detail h1').textContent()) === 'PANTHEON');
  check('no script errors (address)', errors.length === 0, errors.join(' | '));
  await page.close();
}

// ---------- phone ----------
{
  const { page, errors } = await open({ width: 390, height: 844 });
  await shot(page, 'm1-home');
  check('phone tab bar', (await page.locator('.tabbar button').count()) === 3);
  await page.locator('.m-chips .chip', { hasText: 'List' }).click();
  check('phone list sheet', (await page.locator('.m-sheet').count()) === 1);
  await page.locator('.m-sheet .city', { hasText: 'Milan' }).click();
  await page.waitForTimeout(1200);
  await page.locator('.m-chips .chip', { hasText: 'List' }).click();
  await page.locator('.m-sheet .row', { hasText: 'Santa Maria delle Grazie' }).click();
  await page.waitForTimeout(1200);
  check('phone detail sheet', (await page.locator('.detail.sheet').count()) === 1);
  await shot(page, 'm2-building');
  await page.locator('.tabbar button', { hasText: 'Review' }).click();
  await page.waitForTimeout(400);
  await shot(page, 'm3-review');
  check('phone review', (await page.locator('.rcard').count()) === 1);
  await page.locator('.tabbar button', { hasText: 'Timeline' }).click();
  await page.waitForTimeout(400);
  await shot(page, 'm4-timeline');
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('phone timeline needs no sideways scroll', sideways <= 0 && (await page.locator('.tlv-row').count()) > 50, `${sideways}px`);
  await page.locator('.tlv-filter .chip', { hasText: 'France' }).click();
  check('phone timeline country filter', (await page.locator('.tlv-row').count()) === 30);
  await page.locator('.tlv-row', { hasText: 'Villa Savoye' }).click();
  await page.waitForTimeout(900);
  check('phone timeline opens the building', (await page.locator('.detail.sheet h1').textContent()) === 'VILLA SAVOYE');
  await page.locator('.tabbar button', { hasText: 'Map' }).click();
  await page.locator('.m-search').click();
  await page.keyboard.type('bramante');
  await page.waitForTimeout(200);
  await shot(page, 'm5-search');
  check('phone search', (await page.locator('.hit').count()) >= 5);
  check('no script errors (phone)', errors.length === 0, errors.join(' | '));
  await page.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);

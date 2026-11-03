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
  check('no side panel at start (map first)', (await page.locator('.drawer').count()) === 0 && (await page.locator('.detail').count()) === 0);
  const mapBox = await page.locator('.map-canvas').boundingBox();
  check('map fills the window below the top bar', mapBox.width >= 1430 && mapBox.height >= 840, `${mapBox.width}x${mapBox.height}`);
  check('period band starts as a slim strip', (await page.locator('.band-svg-box.slim').count()) === 1);
  await shot(page, 'd1-home');

  // Filters drawer
  await page.keyboard.press('f');
  check('F opens the filters drawer', (await page.locator('.drawer').count()) === 1);
  check('city list shows Rome first', (await page.locator('.drawer .city .nm').first().textContent()) === 'Rome');
  await page.locator('.drawer .styles .chip', { hasText: 'Modern' }).click();
  check('style chip toggles on', (await page.locator('.drawer .styles .chip.on').count()) === 1);
  check('filter count on the button', (await page.locator('.fbtn .badge').textContent()) === '1');
  await page.locator('.drawer .styles .chip', { hasText: 'Modern' }).click();

  // City and building
  await page.locator('.drawer .city', { hasText: 'Rome' }).click();
  await page.waitForTimeout(1000);
  check('city crumb shows Rome', (await page.locator('.crumb b').textContent()) === 'Rome');
  await page.locator('.drawer .row', { hasText: 'Domus Aurea' }).click();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1200);
  check('Esc closes the drawer first', (await page.locator('.drawer').count()) === 0 && (await page.locator('.detail').count()) === 1);
  check('detail opens with its city number', /^4DOMUS AUREA$/.test((await page.locator('.detail h1').textContent()).trim()));
  check('exam line shown', /2007 TEST-ARCHED/.test(await page.locator('.detail .exam').textContent()));
  check('position line', /of 26 in Rome/.test(await page.locator('.d-pos').textContent()));
  check('city list has every Rome building', (await page.locator('.c-list .c-row').count()) === 26);
  check('numbered pins on the map', (await page.locator('.overlay .pin').count()) >= 20);
  const inView = await page.evaluate(() => [...document.querySelectorAll('.overlay .pin text')].map((t) => t.textContent));
  check('whole city in view after opening', ['1', '24', '25', '26'].every((n) => inView.includes(n)), inView.length + ' pins');
  const panel = await page.locator('.detail').boundingBox();
  check('detail card is compact', panel.width <= 342, `${panel.width}px`);
  await shot(page, 'd2-building');

  await page.locator('.c-row', { hasText: 'Colosseum' }).hover();
  check('list hover lights the pin', (await page.locator('.overlay .pin.hot').count()) === 1);
  await page.locator('.c-sort .chip', { hasText: 'Nearest first' }).click();
  check('nearest-first order', /Domus Aurea/.test(await page.locator('.c-row').first().textContent()));

  // Zoom in: the city inset appears; clicking it shows the whole city again
  await page.locator('.ctrls button[aria-label="Zoom in"]').click();
  await page.waitForTimeout(500);
  await page.locator('.ctrls button[aria-label="Zoom in"]').click();
  await page.waitForTimeout(700);
  check('city inset while zoomed in', (await page.locator('.inset').count()) === 1);
  await shot(page, 'd3-street');
  await page.locator('.inset').click();
  await page.waitForTimeout(900);
  check('inset returns to the whole city', (await page.locator('.inset').count()) === 0);

  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(300);
  check('arrow key moves to next', !/DOMUS AUREA/.test(await page.locator('.detail h1').textContent()));
  await page.keyboard.press('s');
  check('star toggles', (await page.locator('.d-tools button.on').count()) === 1);
  check('seen counter counts', /2 seen/.test(await page.locator('.seen .t').textContent()));
  await page.keyboard.press('Escape');
  check('Esc closes detail', (await page.locator('.detail').count()) === 0);

  // Same spot: the St. Peter's entries fan out as separate numbered pins
  await page.keyboard.press('/');
  await page.keyboard.type('Baldacchino');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1300);
  const peter = await page.evaluate(() => [...document.querySelectorAll('.overlay .pin')].filter((g) => /St\. Peter/.test(g.querySelector('title')?.textContent ?? '')).map((g) => g.getAttribute('transform')));
  check('same-spot entries fan out', peter.length >= 4 && new Set(peter).size === peter.length, String(peter.length));
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
  await page.waitForTimeout(150);
  await shot(page, 'd4-search');
  await page.keyboard.press('Tab');
  await page.waitForTimeout(400);
  check('Tab keeps a list filter', (await page.locator('.fbtn .badge').textContent()) === '1');
  check('toast with undo', (await page.locator('.toast button', { hasText: 'Undo' }).count()) === 1);
  await page.locator('.toast button').click();
  check('undo restores', (await page.locator('.fbtn .badge').count()) === 0);

  await page.keyboard.press('/');
  await page.keyboard.type('\u5eca\u9999');
  await page.waitForTimeout(200);
  check('search matches note text', (await page.locator('.hit', { hasText: 'Ronchamp' }).count()) === 1);
  await page.keyboard.press('Escape');

  // Period band: opens on pointer, drag a span
  await page.locator('.band').hover();
  await page.waitForTimeout(200);
  check('band opens on pointer', (await page.locator('.band-svg-box.slim').count()) === 0);
  const band = page.locator('.band-svg');
  const box = await band.boundingBox();
  await page.mouse.move(box.x + box.width * 0.62, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.8, box.y + 20, { steps: 8 });
  await page.mouse.move(box.x + box.width * 0.95, box.y + 20, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  check('band drag sets a period', / to /.test(await page.locator('.band-meta b').textContent()));
  await page.mouse.move(700, 300);
  check('band stays open while a period is set', (await page.locator('.band-svg-box.slim').count()) === 0);
  await page.keyboard.press('f');
  await page.locator('.toggle', { hasText: 'Asked in previous years' }).click();
  await shot(page, 'd5-filters');
  await page.keyboard.press('Escape');
  await page.keyboard.press('t');
  await page.waitForTimeout(600);
  check('timeline draws items', (await page.locator('.tl-item').count()) > 10);
  await page.locator('.tl-item').nth(8).hover();
  await page.waitForTimeout(200);
  check('timeline hover preview', (await page.locator('.tl-side .tcard').count()) === 1);
  await shot(page, 'd6-timeline');
  await page.locator('.tl-item').nth(8).click();
  await page.waitForTimeout(900);
  check('timeline click opens on map', (await page.locator('.detail').count()) === 1 && (await page.locator('.modes .on').textContent()).includes('Map'));
  await page.keyboard.press('Escape');

  // Review
  await page.keyboard.press('r');
  await page.waitForTimeout(400);
  check('review starts with all buildings', /of 204 known/.test(await page.locator('.r-prog').textContent()));
  check('name hidden first', (await page.locator('.hidden-name').count()) === 1);
  await shot(page, 'd7-review');
  await page.keyboard.press(' ');
  check('space shows answer', (await page.locator('.rc-ans').count()) === 1);
  await page.keyboard.press('2');
  await page.waitForTimeout(150);
  check('got it counts', /1 of 204 known/.test(await page.locator('.r-prog').textContent()));

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
  check('address opens a building', /PANTHEON$/.test(await page.locator('.detail h1').textContent()));
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
  check('phone timeline opens the building', /VILLA SAVOYE$/.test(await page.locator('.detail.sheet h1').textContent()));
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

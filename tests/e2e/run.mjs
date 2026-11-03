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
  check('no side panel at start (map first)', (await page.locator('.drawer').count()) === 0 && (await page.locator('.side').count()) === 0);
  const mapBox = await page.locator('.map-canvas').boundingBox();
  check('map fills the window below the top bar', mapBox.width >= 1430 && mapBox.height >= 840, `${mapBox.width}x${mapBox.height}`);
  const bandTexts = await page.locator('.eb-blk').allTextContents();
  check('period band shows counts only', bandTexts.length === 8 && bandTexts.every((t) => /^\d+$/.test(t)), bandTexts.join(','));
  const text = await page.evaluate(() => document.body.innerText);
  check('no help text on screen', !/click|drag|outside this view|seen of|buildings$/im.test(text), text.slice(0, 120));
  await shot(page, 'd1-home');

  // Two clicks: city circle, then a building
  const big = await page.evaluate(() => {
    const ds = [...document.querySelectorAll('.overlay .donut')];
    let best = null, n = 0;
    for (const d of ds) { const v = Number(d.querySelector('.donut-n')?.textContent); if (v > n) { n = v; best = d; } }
    const r = best.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.click(big.x, big.y);
  await page.waitForTimeout(1100);
  check('click 1: a circle opens its city list', (await page.locator('.citypanel h2').textContent()).startsWith('Rome') && (await page.locator('.citypanel .o-row').count()) === 26);
  check('city list rows carry only number and name', (await page.locator('.citypanel .o-row').first().innerText()).trim().split('\n').length === 2);
  check('numbered pins on the map', (await page.locator('.overlay .pin').count()) >= 20);
  await page.locator('.citypanel .o-row', { hasText: 'Domus Aurea' }).click();
  await page.waitForTimeout(1100);
  check('click 2: the building opens', /^4\s*DOMUS AUREA$/.test((await page.locator('.side.card h1').innerText()).trim()));
  const lines = await page.locator('.f-data p').allTextContents();
  check('data lines: span and place, ruler, style', lines.join(' | ') === 'AD 64\u201368, Rome | Nero | Ancient Rome', lines.join(' | '));
  check('data lines have no Chinese and no labels', !/[\u3400-\u9fff]/.test(lines.join('')));
  const supp = await page.locator('.facts > *').last().innerText();
  check('exam years last, written once', supp.trim() === '\u3010TEST-ARCHED 2007 / 2012 / 2016\u3011', supp);
  check('other buildings start folded', (await page.locator('.side.card .others').count()) === 0 && /Rome\s*25/.test(await page.locator('.others-h').innerText()));
  await page.locator('.others-h').click();
  check('other buildings with a direction arrow', (await page.locator('.others .o-row').count()) === 25 && (await page.locator('.others .o-row .dir').count()) === 25);
  const cardBox = await page.locator('.side.card').boundingBox();
  const listBox = await page.locator('.side.card .others').boundingBox();
  check('the list stays secondary (at most 240 px)', listBox.height <= 241, `${listBox.height}px of ${cardBox.height}px`);
  const inView = await page.evaluate(() => [...document.querySelectorAll('.overlay .pin text, .overlay .edge text')].map((t) => t.textContent));
  check('whole city in view after opening', ['1', '24', '25', '26'].every((n) => inView.includes(n)), inView.length + ' pins');
  const panel = await page.locator('.side.card').boundingBox();
  check('card is compact and 16 px from the map edges', panel.width <= 342 && Math.round(1440 - panel.x - panel.width) === 16 && Math.round(panel.y - 48) === 16, `${panel.x},${panel.y},${panel.width}`);
  await shot(page, 'd2-building');

  await page.locator('.others .o-row', { hasText: 'Colosseum' }).hover();
  check('list hover lights the pin', (await page.locator('.overlay .pin.hot, .overlay .edge.hot').count()) === 1);
  const h1Before = await page.locator('.side.card h1').boundingBox();
  await page.locator('.c-ic[aria-label="Fold"]').click();
  check('card folds to its title', (await page.locator('.side.card .c-body').count()) === 0 && (await page.locator('.side.card h1').count()) === 1);
  await page.locator('.c-ic[aria-label="Unfold"]').click();
  const h1After = await page.locator('.side.card h1').boundingBox();
  check('controls do not move the content', Math.abs(h1Before.y - h1After.y) < 1 && (await page.locator('.side.card .c-body').count()) === 1);

  // Zoom in: off-screen buildings of the city sit on the view edge, pointing at them; the inset shows the city
  await page.locator('.ctrls button[aria-label="Zoom in"]').click();
  await page.waitForTimeout(500);
  await page.locator('.ctrls button[aria-label="Zoom in"]').click();
  await page.waitForTimeout(700);
  check('edge markers point at off-screen buildings', (await page.locator('.overlay .edge').count()) >= 5);
  check('city inset while zoomed in', (await page.locator('.inset').count()) === 1);
  await shot(page, 'd3-street');
  await page.locator('.inset').click();
  await page.waitForTimeout(900);
  check('inset returns to the whole city', (await page.locator('.inset').count()) === 0);
  await page.locator('.ctrls button[aria-label="Zoom in"]').click();
  await page.waitForTimeout(400);
  await page.locator('.ctrls button[aria-label="Zoom in"]').click();
  await page.waitForTimeout(700);
  const other = page.locator('.overlay .edge').filter({ hasNot: page.locator('title', { hasText: 'Domus Aurea' }) }).first();
  const otherName = await other.locator('title').textContent();
  await other.click({ force: true });
  await page.waitForTimeout(900);
  check('an edge marker opens its building', (await page.locator('.side.card h1').innerText()).includes(otherName.toUpperCase()), otherName);

  // Country and full map
  await page.locator('.ctrls button[aria-label="Country"]').click();
  await page.waitForTimeout(900);
  const italy = await page.evaluate(() => document.querySelectorAll('.overlay .donut, .overlay .dot').length);
  check('country button shows the whole country', italy >= 5, String(italy));
  await page.locator('.ctrls button[aria-label="Full map"]').click();
  await page.waitForTimeout(900);
  check('full map button returns to Europe', (await page.locator('.overlay .donut').count()) >= 5);
  await page.locator('.c-back').click();
  await page.waitForTimeout(900);
  await page.locator('.citypanel .o-row', { hasText: 'Pantheon' }).click();
  await page.waitForTimeout(900);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(300);
  await page.keyboard.press('s');
  check('star toggles', (await page.locator('.c-ic.on').count()) === 1);
  check('seen counter counts', /^4\/204/.test((await page.locator('.seen').innerText()).trim()), (await page.locator('.seen').innerText()).trim());
  await page.keyboard.press('Escape');
  check('Esc goes back to the city list', (await page.locator('.side.card').count()) === 0 && (await page.locator('.citypanel').count()) === 1);
  await page.keyboard.press('Escape');
  check('Esc again closes the city', (await page.locator('.side').count()) === 0);

  // Same spot: the St. Peter's entries fan out as separate numbered pins
  await page.keyboard.press('/');
  await page.keyboard.type('Baldacchino');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1300);
  const peter = await page.evaluate(() => [...document.querySelectorAll('.overlay .pin')].filter((g) => /St\. Peter/.test(g.querySelector('title')?.textContent ?? '')).map((g) => g.getAttribute('transform')));
  check('same-spot entries fan out', peter.length >= 4 && new Set(peter).size === peter.length, String(peter.length));
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  // Filters drawer
  await page.keyboard.press('f');
  check('F opens the filters drawer', (await page.locator('.drawer').count()) === 1);
  check('drawer lists cities, Rome first', (await page.locator('.drawer .city .nm').first().textContent()) === 'Rome');
  await page.locator('.drawer .styles .chip', { hasText: 'Modern' }).click();
  check('filter count on the button', (await page.locator('.fbtn .badge').textContent()) === '1');
  await page.locator('.drawer .styles .chip', { hasText: 'Modern' }).click();
  await page.locator('.drawer .city', { hasText: 'Milan' }).click();
  await page.waitForTimeout(900);
  check('drawer city opens the city list', (await page.locator('.citypanel h2').textContent()).startsWith('Milan') && (await page.locator('.drawer').count()) === 0);
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

  // Period band: one click shows one period
  await page.locator('.eb-blk[aria-label^="Modern"]').click();
  check('band click shows one period', (await page.locator('.eb-blk.on').count()) === 1 && (await page.locator('.eb-blk.off').count()) === 7);
  await page.keyboard.press('f');
  await page.locator('.drawer .chip', { hasText: 'TEST-ARCHED' }).click();
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
  check('timeline click opens on map', (await page.locator('.side.card').count()) === 1 && (await page.locator('.modes .on').textContent()).includes('Map'));
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  // Review
  await page.keyboard.press('r');
  await page.waitForTimeout(400);
  check('review starts with all buildings', /0\/204/.test(await page.locator('.r-prog').innerText()));
  check('name hidden first', (await page.locator('.rc-head h2.q').count()) === 1);
  await shot(page, 'd7-review');
  await page.keyboard.press(' ');
  check('space shows answer', (await page.locator('.rc-ans').count()) === 1);
  await page.keyboard.press('2');
  await page.waitForTimeout(150);
  check('got it counts', /1\/204/.test(await page.locator('.r-prog').innerText()));

  await page.keyboard.press('m');
  const hash = await page.evaluate(() => location.hash);
  check('address keeps the filters', /e=1/.test(hash) && /s=modern/.test(hash), hash);
  check('no script errors (desktop)', errors.length === 0, errors.join(' | '));
  await page.close();
}

// ---------- address restores a selection ----------
{
  const { page, errors } = await open({ width: 1440, height: 900 }, '#b=pantheon-rome');
  await page.waitForTimeout(1200);
  check('address opens a building', /PANTHEON$/.test((await page.locator('.side.card h1').innerText()).trim()));
  check('no script errors (address)', errors.length === 0, errors.join(' | '));
  await page.close();
}

// ---------- phone ----------
{
  const { page, errors } = await open({ width: 390, height: 844 });
  await shot(page, 'm1-home');
  check('phone tab bar', (await page.locator('.tabbar button').count()) === 3);
  await page.locator('.m-chips .chip[aria-label="All filters and list"]').click();
  check('phone list sheet', (await page.locator('.m-sheet').count()) === 1);
  await page.locator('.m-sheet .city', { hasText: 'Milan' }).click();
  await page.waitForTimeout(1200);
  check('phone city sheet', (await page.locator('.side.citypanel.sheet').count()) === 1);
  await page.locator('.citypanel .o-row', { hasText: 'Santa Maria delle Grazie' }).click();
  await page.waitForTimeout(1200);
  check('phone building sheet', (await page.locator('.side.card.sheet').count()) === 1);
  await shot(page, 'm2-building');
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('phone page needs no sideways scroll', sideways <= 0, `${sideways}px`);
  await page.locator('.tabbar button', { hasText: 'Review' }).click();
  await page.waitForTimeout(400);
  await shot(page, 'm3-review');
  check('phone review', (await page.locator('.rcard').count()) === 1);
  await page.locator('.tabbar button', { hasText: 'Timeline' }).click();
  await page.waitForTimeout(400);
  await shot(page, 'm4-timeline');
  check('phone timeline in one column', (await page.locator('.tlv-row').count()) > 50);
  await page.locator('.tlv-filter .chip', { hasText: 'France' }).click();
  check('phone timeline country filter', (await page.locator('.tlv-row').count()) === 30);
  await page.locator('.tlv-row', { hasText: 'Villa Savoye' }).click();
  await page.waitForTimeout(900);
  check('phone timeline opens the building', /VILLA SAVOYE$/.test((await page.locator('.side.card h1').innerText()).trim()));
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

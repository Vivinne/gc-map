import { readFileSync } from 'node:fs';
// Browser checks of the single-file build (site/index.html) in Chromium with software WebGL.
// Street tiles are not needed: the offline basemap draws the map. Screenshots go to .e2e/.
// Usage: npm run site && npm run e2e
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const url = new URL('../../site/index.html', import.meta.url).href;
const shots = new URL('../../.e2e/', import.meta.url);
mkdirSync(shots, { recursive: true });
const results = [];
const PLACES = JSON.parse(readFileSync(new URL('../../src/data/places.json', import.meta.url), 'utf8')).places;
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
  check('full map is the plain map: no card, no city, no filters', (await page.locator('.side').count()) === 0 && (await page.locator('.fbtn .badge').count()) === 0);
  await page.keyboard.press('/');
  await page.keyboard.type('sagrada');
  await page.waitForTimeout(200);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(900);
  await page.locator('.ctrls button[aria-label="Country"]').click();
  await page.waitForTimeout(1200);
  check('Country on a building in Spain frames Spain, not the full map', (await page.locator('.side.card').count()) === 1 && (await page.locator('.overlay .donut, .overlay .pin, .overlay .dot').count()) < 30);
  await page.locator('.ctrls button[aria-label="Full map"]').click();
  await page.waitForTimeout(900);
  await page.keyboard.press('/');
  await page.keyboard.type('colosseum');
  await page.waitForTimeout(200);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(900);
  await page.locator('.c-back').click();
  await page.waitForTimeout(900);
  await page.locator('.citypanel .o-row', { hasText: 'Pantheon' }).click();
  await page.waitForTimeout(900);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(300);
  await page.keyboard.press('s');
  check('star toggles', (await page.locator('.c-ic.on').count()) === 1);
  await page.locator('.c-ic[aria-label="Collect"]').click();
  check('star opens the collect menu', (await page.locator('.c-menu .cm-row').count()) === 1);
  await page.keyboard.press('Escape');
  check('Esc closes the menu first', (await page.locator('.c-menu').count()) === 0 && (await page.locator('.side.card').count()) === 1);
  check('seen counter counts', /^6\/204/.test((await page.locator('.seen').innerText()).trim()), (await page.locator('.seen').innerText()).trim());
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
  const bandBefore = await page.locator('.band.dock').boundingBox();
  await page.keyboard.press('f');
  await page.waitForTimeout(200);
  const bandAfter = await page.locator('.band.dock').boundingBox();
  check('opening the filters moves nothing else', bandBefore.x === bandAfter.x && bandBefore.width === bandAfter.width && (await page.locator('.drawer').boundingBox()).y + (await page.locator('.drawer').boundingBox()).height <= bandAfter.y);
  await page.locator('.drawer .chip', { hasText: 'TEST-ARCHED' }).click();
  await shot(page, 'd5-filters');
  await page.keyboard.press('Escape');

  // Quiz: set-up, a run, restart, the result, end early
  await page.keyboard.press('q');
  await page.waitForTimeout(300);
  check('quiz tab opens on the set-up', (await page.locator('.quizv .qz-grid').count()) === 1 && (await page.locator('.modes .on').textContent()).includes('Quiz'));
  await page.locator('.qz-c[aria-label="Building to City"]').click();
  await page.locator('.qz-n', { hasText: /^5$/ }).click();
  check('start shows the number of questions', /Start\s*5/.test(await page.locator('.qz-start').innerText()));
  await page.locator('.qz-start').click();
  await page.waitForTimeout(100);
  check('quiz runs: 1/5, four choices', /1\/5/.test(await page.locator('.qz-count').innerText()) && (await page.locator('.qz-o').count()) === 4 && /Building\s*City/i.test(await page.locator('.qz-k').innerText()));
  await page.keyboard.press('1');
  check('answer is marked', (await page.locator('.qz-o.ok').count()) === 1 && (await page.locator('.qz-track i.ok, .qz-track i.no').count()) === 1);
  await shot(page, 'd7-quiz');
  await page.locator('.qz-after .btn').click();
  check('next question', /2\/5/.test(await page.locator('.qz-count').innerText()));
  await page.locator('[aria-label="Restart"]').click();
  check('restart starts over', /1\/5/.test(await page.locator('.qz-count').innerText()) && (await page.locator('.qz-track i.ok, .qz-track i.no').count()) === 0);
  for (let k = 0; k < 5; k++) {
    // the first choice each time: some answers are wrong, so Practise next has entries
    await page.locator('.qz-o').first().click();
    await page.locator('.qz-after .btn').click();
  }
  check('result after the last question', (await page.locator('.qz-score').count()) === 1 && /\/5/.test(await page.locator('.qz-score').innerText()));
  await shot(page, 'd8-result');
  await page.locator('.qz-acts .btn', { hasText: 'New quiz' }).click();
  await page.locator('.qz-start').click();
  await page.keyboard.press('2');
  await page.locator('[aria-label="End"]').click();
  check('end early keeps what was answered', /\/1/.test(await page.locator('.qz-score').innerText()) && /1\/5/.test(await page.locator('.qz-meta').innerText()));

  // Me: personal centre
  await page.keyboard.press('u');
  await page.waitForTimeout(300);
  check('me shows the four tiles', (await page.locator('.me .k').count()) === 4 && /Tested/.test(await page.locator('.me-g').innerText()));
  check('recent quizzes lists both', (await page.locator('.me-recent tbody tr').count()) === 2);
  check('mastery by style: 8 rows', (await page.locator('.ms li').count()) === 8);
  const mBox = await page.locator('.me-mastery').boundingBox();
  await page.locator('.me .seg button', { hasText: 'TEST-ARCHED' }).click();
  check('mastery by TEST-ARCHED: all years + 13', (await page.locator('.ms li').count()) === 14);
  const mBox2 = await page.locator('.me-mastery').boundingBox();
  await page.locator('.me .seg button', { hasText: 'Type' }).click();
  check('mastery by type: 12 rows', (await page.locator('.ms li').count()) === 12 && /%/.test(await page.locator('.ms li', { hasText: 'Building → City' }).innerText()));
  check('switching groups does not move the layout', mBox.height === mBox2.height && mBox.height === (await page.locator('.me-mastery').boundingBox()).height);
  await page.locator('.me .seg button', { hasText: 'Style' }).click();
  const nextBox = await page.locator('.me-next').boundingBox();
  check('cards in a row line up', Math.abs(nextBox.y - mBox.y) < 1 && Math.abs(nextBox.height - mBox.height) < 1);
  await page.locator('.ms li', { hasText: 'Baroque' }).click();
  check('selecting a row changes only the action bar', /Baroque/.test(await page.locator('.me-mastery .act').innerText()) && (await page.locator('.me-mastery').boundingBox()).height === mBox.height);
  await shot(page, 'd9-me');
  await page.locator('.me-mastery .act .btn.dark').click();
  await page.waitForTimeout(200);
  check('mastery quiz starts on that style', (await page.locator('.modes .on').textContent()).includes('Quiz') && (await page.locator('.qz-count').count()) === 1);
  await page.locator('[aria-label="End"]').click();
  await page.keyboard.press('u');
  await page.waitForTimeout(200);
  const nNext = await page.locator('.wk li').count();
  check('practise next lists missed buildings', nNext >= 1, String(nNext));
  await page.locator('.me-next .act .btn').click();
  await page.waitForTimeout(200);
  check('practise next starts a quiz on them', /1\/\d/.test(await page.locator('.qz-count').innerText()));
  await page.locator('[aria-label="End"]').click();
  await page.keyboard.press('u');
  await page.waitForTimeout(200);
  await page.locator('.cl-new input').fill('Florence trip');
  await page.keyboard.press('Enter');
  check('collection created', (await page.locator('.cl li').count()) === 2 && (await page.locator('.cl li', { hasText: 'Florence trip' }).count()) === 1);
  await page.locator('.modes button', { hasText: 'Map' }).click();
  await page.keyboard.press('/');
  await page.keyboard.type('pantheon');
  await page.waitForTimeout(200);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(900);
  await page.locator('.c-ic[aria-label="Collect"]').click();
  await page.locator('.cm-row', { hasText: 'Florence trip' }).click();
  check('building added to the collection', (await page.locator('.cm-row.on', { hasText: 'Florence trip' }).count()) === 1);
  await page.keyboard.press('Escape');
  await page.keyboard.press('u');
  await page.waitForTimeout(200);
  check('collection counts it', /Florence trip\s*1/.test(await page.locator('.cl li', { hasText: 'Florence trip' }).innerText()));
  await page.locator('.cl li', { hasText: 'Florence trip' }).click();
  await page.locator('[aria-label="Show Florence trip on the map"]').click();
  await page.waitForTimeout(900);
  check('collection shows on the map as a filter', (await page.locator('.modes .on').textContent()).includes('Map') && (await page.locator('.fbtn .badge').innerText()) === '1');

  await page.keyboard.press('m');
  await page.reload();
  await page.waitForSelector('.overlay', { timeout: 15000 });
  await page.waitForTimeout(1200);
  check('reload resets the view', (await page.locator('.side').count()) === 0 && (await page.locator('.eb-blk.on').count()) === 0 && (await page.locator('.fbtn .badge').count()) === 0 && (await page.locator('.modes .on').textContent()).includes('Map'));
  check('reload keeps personal progress', !/^0\//.test((await page.locator('.seen').innerText()).trim()));
  check('reload leaves no view address', (await page.evaluate(() => location.hash)) === '');
  await page.keyboard.press('u');
  await page.waitForTimeout(200);
  check('reload keeps collections and results', (await page.locator('.cl li', { hasText: 'Florence trip' }).count()) === 1 && (await page.locator('.me-recent tbody tr').count()) >= 2);
  await page.keyboard.press('m');
  check('no script errors (desktop)', errors.length === 0, errors.join(' | '));
  await page.close();
}

// ---------- Country frames the building's whole country, for every country, desktop and phone ----------
for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  const { page, errors } = await open(vp);
  const reps = ['Secession Building', 'Tassel House', 'Müller House', 'Paimio Sanatorium', 'Mont-Saint-Michel Abbey', 'Cologne Cathedral', 'Parthenon', 'Valle dei Templi', 'Cloaca Maxima', 'Nakagin Capsule Tower', 'Petronas Twin Towers', 'Schröder House', 'Hermitage Museum', 'Seville Cathedral', 'Hagia Sophia', 'Louvre Abu Dhabi', 'Salisbury Cathedral', 'Fallingwater', 'Sagrada', 'Il Redentore', 'Villa Savoye', 'Robie House'];
  const bad = [];
  for (const n of reps) {
    if (vp.width < 900) await page.locator('.m-search').click();
    else await page.keyboard.press('/');
    await page.keyboard.type(n);
    await page.waitForTimeout(150);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);
    await page.locator('.ctrls button[aria-label="Country"]').click();
    await page.waitForTimeout(1100);
    const r = await page.evaluate(() => {
      const m = window.__gcAtlasMap;
      const b = m.getBounds();
      return { w: b.getWest(), e: b.getEast(), s: b.getSouth(), n: b.getNorth(), z: m.getZoom() };
    });
    if ((await page.locator('.side.card').count()) !== 1) bad.push(`${n}: card closed by Country`);
    const place = PLACES.find((p) => p.name.toLowerCase().includes(n.toLowerCase()));
    const [w, so, e, no] = place.nationBox;
    const cx = (w + e) / 2;
    const cy = (so + no) / 2;
    const cxv = cx > 180 ? cx - 360 : cx;
    const inside = cxv >= r.w && cxv <= r.e && cy >= r.s && cy <= r.n;
    const ptIn = place.points[0].lng >= r.w && place.points[0].lng <= r.e && place.points[0].lat >= r.s && place.points[0].lat <= r.n;
    // the whole country is in view (a little tolerance), and it fills the view along at least one side
    const tol = 0.6;
    const contained = w >= r.w - tol && e <= r.e + tol && so >= r.s - tol && no <= r.n + tol;
    const fills = (e - w) / (r.e - r.w) >= 0.3 || (no - so) / (r.n - r.s) >= 0.4 || r.z >= 8.9;
    if (!inside || !ptIn || !contained || !fills) bad.push(`${n}: view ${r.w.toFixed(1)},${r.s.toFixed(1)} ${r.e.toFixed(1)},${r.n.toFixed(1)} z${r.z.toFixed(1)} vs ${place.nation} ${place.nationBox}`);
    if (vp.width < 900) await page.locator('.side.card [aria-label="Close"]').click();
    else await page.keyboard.press('Escape'), await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  }
  check(`Country frames each country (${vp.width} px)`, bad.length === 0, bad.join(' | '));
  check(`no script errors (country ${vp.width})`, errors.length === 0, errors.join(' | '));
  await page.close();
}

// ---------- previous / next come back; a quiz survives a tab change; zooming out to 500 km clears the view ----------
{
  const { page, errors } = await open({ width: 1440, height: 900 });
  const title = async () => (await page.locator('.side.card h1').innerText()).replace(/^\d+\s*/, '').trim();
  for (const n of ['cologne cathedral', 'pantheon', 'sagrada', 'fallingwater']) {
    await page.keyboard.press('/');
    await page.keyboard.type(n);
    await page.waitForTimeout(150);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(900);
    const t0 = await title();
    await page.locator('.c-tools [aria-label="Next"]').click();
    await page.waitForTimeout(700);
    const t1 = await title();
    await page.locator('.c-tools [aria-label="Previous"]').click();
    await page.waitForTimeout(700);
    const t2 = await title();
    check(`next then previous comes back (${n})`, t0 === t2 && t0 !== t1, `${t0} > ${t1} > ${t2}`);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
  }

  await page.keyboard.press('q');
  await page.locator('.qz-n', { hasText: /^5$/ }).click();
  await page.locator('.qz-start').click();
  await page.keyboard.press('1');
  await page.locator('.qz-after .btn').click();
  const before = await page.locator('.qz-p').innerText();
  await page.locator('.modes button', { hasText: 'Map' }).click();
  await page.waitForTimeout(300);
  await page.keyboard.press('1');
  await page.locator('.modes button', { hasText: 'Me' }).click();
  await page.waitForTimeout(200);
  await page.locator('.modes button', { hasText: 'Quiz' }).click();
  await page.waitForTimeout(200);
  check('a quiz in progress is still there after other tabs', /2\/5/.test(await page.locator('.qz-count').innerText()) && (await page.locator('.qz-p').innerText()) === before && (await page.locator('.qz-o.ok').count()) === 0);
  await page.locator('[aria-label="End"]').click();

  await page.locator('.modes button', { hasText: 'Map' }).click();
  await page.keyboard.press('/');
  await page.keyboard.type('colosseum');
  await page.waitForTimeout(150);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1000);
  await page.keyboard.press('1');
  check('a building is open before zooming out', (await page.locator('.side.card').count()) === 1);
  await page.mouse.move(500, 450);
  for (let k = 0; k < 40 && !/[5-9]00 km|\d{4} km/.test(await page.locator('.scale').innerText()); k++) {
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(900);
  const km = await page.locator('.scale').innerText();
  check('zooming out to the 500 km scale clears the view', (await page.locator('.side').count()) === 0 && (await page.locator('.fbtn .badge').count()) === 0, km + ' side ' + (await page.locator('.side').count()) + ' badge ' + (await page.locator('.fbtn .badge').count()));
  check('no script errors (steps, quiz, panorama)', errors.length === 0, errors.join(' | '));
  await page.close();
}

// ---------- an old view address does not restore anything ----------
{
  const { page, errors } = await open({ width: 1440, height: 900 }, '#b=pantheon-rome');
  await page.waitForTimeout(800);
  check('old address is ignored', (await page.locator('.side').count()) === 0 && (await page.evaluate(() => location.hash)) === '');
  check('no script errors (address)', errors.length === 0, errors.join(' | '));
  await page.close();
}

// ---------- phone ----------
{
  const { page, errors } = await open({ width: 390, height: 844 });
  await shot(page, 'm1-home');
  check('phone tab bar', (await page.locator('.tabbar button').count()) === 3);
  await page.locator('.m-fbtn').click();
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
  await page.locator('.tabbar button', { hasText: /^Me$/ }).click();
  await page.waitForTimeout(400);
  await shot(page, 'm5-me');
  check('phone me fits', (await page.locator('.me .k').count()) === 4 && (await page.evaluate(() => document.querySelector('.me').scrollWidth - document.querySelector('.me').clientWidth)) <= 0);
  check('phone me in four parts', (await page.locator('.me-parts button').count()) === 4 && (await page.locator('.me-mastery').count()) === 0);
  await page.locator('.me-parts button', { hasText: 'Mastery' }).click();
  check('phone mastery part', (await page.locator('.me-mastery').count()) === 1 && (await page.locator('.me .k').count()) === 0);
  await page.locator('.me-parts button', { hasText: 'Collections' }).click();
  check('phone collections part', (await page.locator('.me-cols').count()) === 1 && (await page.locator('.me-foot').count()) === 1);
  await page.locator('.tabbar button', { hasText: /^Map$/ }).click();
  await page.waitForTimeout(400);
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

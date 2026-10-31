// e2e: with a stub map, verifies filtering / search / detail / same-spot chooser / unlocated list / URL state / mobile layout
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const page_url = 'file://' + resolve(root, '.e2e/index.html');
const shots = resolve(root, '.e2e/shots');
mkdirSync(shots, { recursive: true });
const data = JSON.parse(readFileSync(resolve(root, 'src/data/places.json'), 'utf8'));
const total = data.places.length;
const totalPts = data.places.reduce((n, p) => n + p.points.length, 0);
const ancient = data.places.filter((p) => p.era === 'ancient');

const browser = await chromium.launch();
const problems = [];
let step = 0;
const ok = (m) => console.log(`✓ ${++step}. ${m}`);

async function newPage(viewport) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') problems.push('console.error: ' + m.text()); });
  // The list, counts and map data follow the tag/search input through useDeferredValue: let React finish that render after each input
  const settle = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 40)))));
  for (const fn of ['click', 'fill']) {
    const orig = page[fn].bind(page);
    page[fn] = async (...a) => { const r = await orig(...a); await settle(); return r; };
  }
  return page;
}

// ---------- Desktop ----------
const page = await newPage({ width: 1280, height: 800 });
await page.goto(page_url);
await page.waitForSelector('[data-testid=count]');
assert.equal((await page.textContent('[data-testid=count]')).trim(), `Showing ${total} / ${total} entries | ${totalPts} map markers`);
ok(`Initially ${total} entries and ${totalPts} markers shown`);
assert.equal(await page.locator('.list').count(), 0);
assert.equal(await page.locator('.marker').count(), totalPts);
ok('The building list is hidden while only the style tags are shown; marker count is correct');

// Tag groups: three buttons; the sub tags appear only after a press
assert.equal(await page.locator('.tag-toggle').count(), 3);
assert.deepEqual(await page.locator('.tag-toggle').allTextContents(), ['【Country】', '【Styles】', '【Previous Years】']);
assert.equal(await page.locator('.tag-item').count(), 0);
for (const b of await page.locator('.tag-toggle').all()) assert.equal(await b.getAttribute('aria-expanded'), 'false');
await page.click('.tag-toggle:has-text("Styles")');
assert.equal(await page.locator('.tag-item').count(), 8);
assert.equal(await page.locator('.tag-toggle:has-text("Styles")').getAttribute('aria-expanded'), 'true');
await page.click('.tag-toggle:has-text("Country")');
await page.click('.tag-toggle:has-text("Previous Years")');
assert.equal(await page.locator('.tag-item').count(), 13 + 6 + 8);
ok('Three group buttons; sub tags show only after a press, several groups can be open at once');

// View: no filter = Europe; with a filter = zoom to the results
const home = await page.evaluate(() => window.__map.bounds);
assert.deepEqual(home, [[-8, 36], [29.5, 55]]);
await page.click('.tag-item:has-text("Modern")');
await page.waitForFunction(() => window.__map.bounds[0][0] < -70); // the list/map follow the deferred filter
const modernBounds = await page.evaluate(() => window.__map.bounds);
assert.ok(modernBounds[0][0] < -70 && modernBounds[1][0] > 130, JSON.stringify(modernBounds)); // includes New York and Tokyo
await page.click('.clear-tags');
await page.waitForFunction(() => window.__map.bounds[0][0] === -8);
assert.deepEqual(await page.evaluate(() => window.__map.bounds), [[-8, 36], [29.5, 55]]);
ok('View: fixed on Europe with no filter, zooms to the results with a filter, back to Europe once cleared');

// Era filter
await page.click('.tag-item:has-text("Ancient")');
assert.equal(await page.locator('.list .item').count(), ancient.length);
assert.equal(await page.locator('.tag-item[data-checked=true]').count(), 1);
assert.equal(await page.locator('.marker').count(), ancient.reduce((n, p) => n + p.points.length, 0));
await page.screenshot({ path: resolve(shots, 'desktop-style.png') });
ok(`Ancient filter -> ${ancient.length} entries`);
await page.click('.clear-tags');
assert.equal(await page.locator('.tag-item').count(), 13 + 6 + 8);
assert.equal(await page.locator('.list').count(), 0);
ok('Clearing the filter restores all entries');

// Tag groups: titles, checkable; union inside a group, intersection across groups
const titles = (await page.locator('.tag-toggle span').allTextContents());
assert.deepEqual(titles, ['【Country】', '【Styles】', '【Previous Years】']);
await page.click('.tag-item:has-text("2018")');
const y18 = data.places.filter((p) => p.exams.includes(2018));
assert.equal(await page.locator('.list .item').count(), y18.length);
await page.click('.tag-group:has(.tag-toggle:has-text("Country")) .tag-item:has-text("Others")');
const y18o = y18.filter((p) => p.country === 'Others');
assert.equal(await page.locator('.list .item').count(), y18o.length);
assert.ok(y18o.length > 0 && y18o.length < y18.length);
await page.click('.tag-item:has-text("2019")');
const inter = data.places.filter((p) => p.country === 'Others' && (p.exams.includes(2018) || p.exams.includes(2019))); // union inside Previous Years, intersection with Country
assert.equal(await page.locator('.list .item').count(), inter.length);
assert.ok(inter.length > 0);
await page.screenshot({ path: resolve(shots, 'desktop-tags.png') });
await page.click('.clear-tags');
assert.equal(await page.locator('.list').count(), 0);
ok(`Tags: 2018 -> ${y18.length}; + Others -> ${y18o.length}; + 2019 -> ${inter.length} (intersection)`);

// Exam-year line in the detail panel
await page.fill('.search', 'Domus Aurea');
await page.click('.list .item:has-text("Domus Aurea")');
assert.equal((await page.textContent('[data-testid=detail] .exam')).trim(), '【2007 TEST-ARCHED】 【2012 TEST-ARCHED】 【2016 TEST-ARCHED】');
const st = await page.$eval('[data-testid=detail] .exam', (e) => { const c = getComputedStyle(e); return [c.fontStyle, c.fontSize]; });
assert.deepEqual(st, ['italic', '11px']);
assert.equal(await page.locator('[data-testid=detail] .context > p:last-child.exam').count(), 1);
await page.fill('.search', 'Colosseum');
await page.click('.list .item:has-text("Colosseum")');
assert.equal(await page.locator('[data-testid=detail] .exam').count(), 0);
await page.fill('.search', '');
await page.keyboard.press('Escape');
ok('Exam-year line: last line of the context, italic small; absent when the building was not in an exam');

// A newly added building: English title and location, year span, architect, exam year
await page.fill('.search', 'Robie');
await page.click('.list .item:has-text("Robie House")');
assert.equal((await page.textContent('[data-testid=detail] h2')).trim(), 'Robie House');
assert.equal((await page.textContent('[data-testid=detail] .loc')).trim(), '1909-1910, Chicago (United States)');
assert.equal((await page.textContent('[data-testid=detail] .who')).trim(), 'Frank Lloyd Wright');
assert.equal((await page.textContent('[data-testid=detail] .exam')).trim(), '【2016 TEST-ARCHED】');
await page.fill('.search', '');
await page.keyboard.press('Escape');
ok('New building (Robie House): heading, architect and exam line');

// Search (including diacritics)
await page.fill('.search', 'pantheon');
const names = await page.locator('.list .item .name').allTextContents();
assert.ok(names.includes('Pantheon') && names.includes('Panthéon'), names.join(','));
ok(`Search for pantheon matches: ${names.join(', ')}`);
await page.fill('.search', 'zzzzzz');
assert.equal(await page.locator('.empty').count(), 1);
ok('No results shows the empty state');
await page.fill('.search', '');

// Select -> detail
await page.fill('.search', 'Colosseum');
await page.click('.list .item:has-text("Colosseum")');
await page.waitForSelector('[data-testid=detail]');
assert.equal((await page.textContent('[data-testid=detail] h2')).trim(), 'Colosseum');
assert.equal((await page.textContent('[data-testid=detail] .loc')).trim(), 'AD 70–80, Rome');
assert.equal(await page.locator('[data-testid=detail] .pt, [data-testid=detail] .coords, [data-testid=detail] .locate, [data-testid=detail] a').count(), 0);
assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('[data-testid=detail] h2')).textTransform), 'uppercase');
assert.equal(await page.locator('[data-testid=detail] .who, [data-testid=detail] .dash').count(), 0);
assert.match(await page.textContent('[data-testid=detail] .ctx'), /橢圓形競技場/);
assert.match(page.url(), /#p=colosseum-rome/);
assert.equal(await page.getAttribute('.marker[data-pid=colosseum-rome]', 'data-selected'), 'true');
await page.fill('.search', '');
ok('Selecting a building: detail in heading/context format (no architect line or dash when the handout names none; no coordinates, source or locate button), URL hash, map selection state');
await page.screenshot({ path: resolve(shots, 'desktop-detail.png') });

// Several entries at one coordinate -> chooser
await page.keyboard.press('Escape');
assert.equal(await page.locator('[data-testid=detail]').count(), 0);
await page.locator('.marker[data-pid=st-peters-dome-vatican]').first().dispatchEvent('click');
await page.waitForSelector('[data-testid=chooser]');
const choice = await page.locator('[data-testid=chooser] .name').allTextContents();
assert.ok(choice.length >= 4, choice.join(','));
ok(`St. Peter's shares one coordinate -> chooser lists ${choice.length} entries: ${choice.join(', ')}`);
const domeName = data.places.find((p) => p.id === 'st-peters-dome-vatican').name;
await page.click(`[data-testid=chooser] .item:has-text("${domeName}")`);
assert.equal((await page.textContent('[data-testid=detail] h2')).trim(), domeName);
assert.equal(await page.locator('[data-testid=chooser]').count(), 0);
ok('Choosing one entry in the chooser -> detail');

// Multi-point building
const palladioName = data.places.find((p) => p.id.startsWith('palladio')).name;
await page.fill('.search', 'Palladio');
await page.click(`.list .item:has-text("${palladioName}")`);
await page.fill('.search', '');
const ptCount = await page.locator('[data-testid=detail] .context').count();
assert.equal(ptCount, 1);
ok('Compound row shows one context block (no sub-point list)');

// Unlocated list: with gaps it opens to show the reason; with no gaps the whole block is absent
const unloc = JSON.parse(readFileSync(resolve(root, 'src/data/unlocated.json'), 'utf8'));
if (unloc.length === 0) {
  assert.equal(await page.locator('.unloc').count(), 0);
  ok('No unlocated items -> the "Unlocated list" is not shown');
} else {
  await page.fill('.search', unloc[0].name); // the list block only shows while a filter or search is active
  await page.locator('.unloc summary').dispatchEvent('click');
  await page.locator(`.unloc button:has-text("${unloc[0].name}")`).dispatchEvent('click');
  await page.waitForSelector('[data-testid=detail]');
  assert.equal((await page.textContent('[data-testid=detail] h2')).trim(), unloc[0].name);
  ok('Unlocated list -> opens the building detail (no marker for it)');
}

// Blank fields stay blank; missing years are filled
await page.fill('.search', 'Salk');
await page.click('.list .item:has-text("Salk Institute")');
await page.waitForSelector('[data-testid=detail]');
assert.equal((await page.textContent('[data-testid=detail] .loc')).trim(), '1959–1965');
await page.fill('.search', 'Triennale');
await page.click('.list .item:has-text("Triennale")');
assert.equal((await page.textContent('[data-testid=detail] .who')).trim(), 'Giovanni Muzio');
await page.fill('.search', 'Rucellai');
await page.click('.list .item:has-text("Palazzo Rucellai")');
assert.equal((await page.textContent('[data-testid=detail] .who')).trim(), 'Leon Battista Alberti');
await page.fill('.search', 'Triennale');
await page.click('.list .item:has-text("Triennale")');
assert.equal((await page.textContent('[data-testid=detail] .dash')).trim(), '－');
assert.equal((await page.textContent('[data-testid=detail] .ctx')).trim(), '位於 Parco Sempione，是 Triennale 的展場，2025 年再度為 Triennale 展出之地。');
await page.fill('.search', '');
await page.fill('.search', 'Miniato');
await page.click('.list .item:has-text("San Miniato")');
const mini = await page.innerText('[data-testid=detail]');
assert.ok(!mini.includes('－'));
await page.fill('.search', '');
ok('Heading shows "year, location" (location omitted when the handout gives none); context text comes from the notes');

// Full map button: fits every marker, including New York and Tokyo
await page.click('.fullmap');
const fullB = await page.evaluate(() => window.__map.focus);
assert.equal(fullB.kind, 'bounds');
assert.deepEqual(fullB.blendWith, [[-8, 36], [29.5, 55]]);
assert.ok(fullB.bounds[0][0] < -70 && fullB.bounds[1][0] > 130, JSON.stringify(fullB.bounds));
ok('The "Full map" button zooms out to halfway between the Europe view and a fit of every marker');

// Detail panel: drag by the coloured heading block
await page.fill('.search', 'Colosseum');
await page.click('.list .item');
await page.waitForSelector('[data-testid=detail]');
const dRect = () => page.evaluate(() => { const r = document.querySelector('.detail').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom }; });
const d0 = await dRect();
const hb = await page.locator('.detail .head h2').boundingBox();
await page.mouse.move(hb.x + 10, hb.y + 10);
await page.mouse.down();
await page.mouse.move(hb.x - 190, hb.y + 110, { steps: 6 });
await page.mouse.up();
const d1 = await dRect();
assert.ok(Math.abs(d1.x - d0.x + 200) < 2 && Math.abs(d1.y - d0.y - 100) < 2, JSON.stringify([d0, d1]));
// Dragging far outside keeps part of the panel on the map
const hb2 = await page.locator('.detail .head h2').boundingBox();
await page.mouse.move(hb2.x + 10, hb2.y + 10);
await page.mouse.down();
await page.mouse.move(5000, 5000, { steps: 4 });
await page.mouse.up();
const d2 = await dRect();
assert.ok(d2.r <= 1266.5 && d2.b <= 786.5 && d2.x >= 13.5 && d2.y >= 13.5, '14 px inside the window: ' + JSON.stringify(d2));
assert.ok(d2.r > 1255 && d2.b > 775, 'Pushed to the bottom-right corner: ' + JSON.stringify(d2));
// Dragged to the top-left corner: it keeps its distance from the three-line button and stays inside the window
const hb3 = await page.locator('.detail .head h2').boundingBox();
await page.mouse.move(hb3.x + 10, hb3.y + 10);
await page.mouse.down();
await page.mouse.move(0, 0, { steps: 6 });
await page.mouse.up();
const d4 = await dRect();
const menuR = await page.evaluate(() => { const r = document.querySelector('.side').getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; });
const apart = d4.x >= menuR.r + 13.5 || d4.y >= menuR.b + 13.5;
assert.ok(apart && d4.x >= 0 && d4.y >= 0, JSON.stringify({ d4, menuR }));
ok('Detail panel keeps 14 px from the window edges and from the open tag panel');
// Back where it was; the position survives choosing another building
const dNow = await dRect();
await page.mouse.move(dNow.x + 20, dNow.y + 20);
await page.mouse.down();
await page.mouse.move(d1.x + 20, d1.y + 20, { steps: 4 });
await page.mouse.up();
await page.fill('.search', 'Pantheon');
await page.click('.list .item');
await page.waitForSelector('[data-testid=detail]');
const d3 = await dRect();
assert.ok(Math.abs(d3.x - d1.x) < 2 && Math.abs(d3.y - d1.y) < 2, JSON.stringify([d1, d3]));
// Minimize: only the name, the [-] and the [x] remain; the [-] restores
const full = await dRect();
assert.equal(await page.locator('.detail .minimize').count(), 1);
const bm = await page.locator('.detail .minimize').boundingBox();
const bc = await page.locator('.detail .close').boundingBox();
assert.ok(Math.abs(bm.width - bc.width) < 0.5 && Math.abs(bm.height - bc.height) < 0.5 && bm.x < bc.x, 'Same size, left of the x');
await page.click('.detail .minimize');
assert.equal(await page.locator('[data-testid=detail-min] .sq').count(), 1, 'Minimized: the [-] turns into a square');
const sqc = await page.evaluate(() => { const b = document.querySelector('[data-testid=detail-min]').getBoundingClientRect(); const q = document.querySelector('[data-testid=detail-min] .sq').getBoundingClientRect(); return { dx: (q.left + q.width / 2) - (b.left + b.width / 2), dy: (q.top + q.height / 2) - (b.top + b.height / 2), bw: getComputedStyle(document.querySelector('[data-testid=detail-min] .sq')).borderTopWidth }; });
assert.ok(Math.abs(sqc.dx) < 1 && Math.abs(sqc.dy) < 1 && parseFloat(sqc.bw) >= 3, 'Square centred and bold: ' + JSON.stringify(sqc));
assert.equal(await page.locator('.detail .context').isVisible(), false);
assert.equal(await page.locator('.detail .loc').isVisible(), false);
assert.equal(await page.locator('.detail h2').isVisible(), true);
assert.ok((await dRect()).h < full.h / 2, 'Smaller');
await page.click('[data-testid=detail-min]');
assert.equal(await page.locator('.detail .context').isVisible(), true);
// Resize: corners keep the proportions (type scales), edges move only their own edge; limits keep 14 px from the map edges and the tag panel
const fs = () => page.evaluate(() => { const d = document.querySelector('.detail'); const r = d.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, h2: parseFloat(getComputedStyle(d.querySelector('h2')).fontSize), body: parseFloat(getComputedStyle(d.querySelector('.ctx')).fontSize), btn: d.querySelector('.close').getBoundingClientRect().width }; });
const dragHandle = async (dir, dx, dy) => {
  const hb = await page.locator(`[data-testid=detail-resize-${dir}]`).boundingBox();
  const x = hb.x + hb.width / 2, y = hb.y + hb.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(60);
};
assert.equal(await page.locator('.detail .rz').count(), 8, 'Four edges and four corners');
const near = (a, b, m, tol = 2) => assert.ok(Math.abs(a - b) <= tol, `${m}: ${a} vs ${b}`);
// Corner: proportional, the opposite corner stays, type and buttons scale
let c0 = await fs();
await dragHandle('sw', 100, 0);
let c1 = await fs();
assert.ok(c1.w < c0.w - 50, JSON.stringify([c0.w, c1.w]));
near(c1.w / c1.h, c0.w / c0.h, 'same proportions', 0.02);
near(c1.r, c0.r, 'right stays'); near(c1.t, c0.t, 'top stays');
assert.ok(c1.h2 < c0.h2 && c1.body < c0.body && c1.btn < c0.btn, 'type and buttons scale');
await dragHandle('se', -3000, 0); // as small as the 11 pt heading allows
let c2 = await fs();
near(c2.h2, 14.667, '11 pt heading is the smallest', 0.1);
// Edges: only the dragged edge moves, the type size does not change
await dragHandle('sw', -3000, 0); // grow the corner back as far as it can go
const big = await fs();
for (const [dir, dx, dy] of [['e', -60, 0], ['w', 60, 0], ['n', 0, 40], ['s', 0, -40]]) {
  const b0 = await fs();
  await dragHandle(dir, dx, dy);
  const b1 = await fs();
  near(b1.h2, b0.h2, `${dir}: type unchanged`, 0.01);
  const fixed = { e: ['l', 't', 'b'], w: ['r', 't', 'b'], n: ['l', 'r', 'b'], s: ['l', 'r', 't'] }[dir];
  for (const f of fixed) near(b1[f], b0[f], `${dir}: ${f} stays`);
  const moved = { e: 'r', w: 'l', n: 't', s: 'b' }[dir];
  assert.ok(Math.abs(b1[moved] - b0[moved]) > 20, `${dir}: its edge moves`);
}
// Limits. Narrowest: title + the two buttons; widest: 2/3 of the map; always 14 px from the map edges
await dragHandle('w', 3000, 0);
let e1 = await fs();
const oneLine = await page.evaluate(() => { const h = document.querySelector('.detail h2'); return h.getBoundingClientRect().height <= parseFloat(getComputedStyle(h).lineHeight) * 1.05; });
assert.ok(oneLine, 'At the narrowest width the heading is still on one line');
await dragHandle('w', -3000, 0);
e1 = await fs();
const sideR = await page.evaluate(() => document.querySelector('.side').getBoundingClientRect().right);
assert.ok(e1.w <= 1280 * 2 / 3 + 1, 'Widest: 2/3 of the map ' + e1.w);
assert.ok(e1.w > 1280 * 2 / 3 - 2 || Math.abs(e1.l - (sideR + 14)) <= 1.5 || e1.l <= 14 + 1, 'Stops at 2/3, or 14 px from the tag panel / the map edge ' + JSON.stringify(e1));
assert.ok(e1.l >= 14 - 1 && (e1.t > 330 || e1.l >= sideR + 14 - 1), 'Clear of the tag panel');
await dragHandle('s', 0, 3000);
e1 = await fs();
assert.ok(Math.abs(e1.b - (800 - 14)) <= 1, 'Longest: the whole map height less the edge distance ' + JSON.stringify(e1));
await dragHandle('n', 0, -3000);
e1 = await fs();
assert.ok(e1.t >= 14 - 1, 'Top keeps 14 px ' + e1.t);
await dragHandle('n', 0, 3000);
await dragHandle('s', 0, -3000);
e1 = await fs();
const expectH = await page.evaluate(() => { const d = document.querySelector('.detail'); const cs = getComputedStyle(d.querySelector('.context')); return d.querySelector('.head').offsetHeight + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + parseFloat(getComputedStyle(d.querySelector('.ctx')).lineHeight) + 2 * parseFloat(getComputedStyle(d.querySelector('.detail-box')).borderTopWidth); });
near(e1.h, expectH, 'Shortest: heading + one line of text', 2);
// Nothing spills out of the black frame, the heading stays on one line, and the white ground is there
const inside = await page.evaluate(() => { const b = document.querySelector('.detail-box').getBoundingClientRect(); const h = document.querySelector('.detail h2'); const r = h.getBoundingClientRect(); const hd = document.querySelector('.detail .head').getBoundingClientRect(); return { within: r.left >= b.left - 0.5 && r.right <= b.right + 0.5 && r.top >= b.top - 0.5 && hd.bottom <= b.bottom + 0.5, oneLine: r.height <= parseFloat(getComputedStyle(h).fontSize) * 1.2 * 1.5, bg: getComputedStyle(document.querySelector('.detail-box')).backgroundColor }; });
assert.ok(inside.within, 'Heading inside the frame ' + JSON.stringify(inside));
assert.ok(inside.oneLine, 'Heading on one line ' + JSON.stringify(inside));
assert.equal(inside.bg, 'rgb(255, 255, 255)', 'White ground');
await dragHandle('se', 3000, 3000);
// Minimized: the same eight handles work (corners proportional, edges move one edge), heading never wraps, height at least one heading line
await page.click('[data-testid=detail-min]');
assert.equal(await page.locator('.detail .rz').count(), 8);
for (const dir of ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']) assert.equal(await page.locator(`[data-testid=detail-resize-${dir}]`).isVisible(), true, dir);
const m0 = await fs();
await dragHandle('e', -60, 0);
const m1 = await fs();
near(m1.l, m0.l, 'min e: left stays'); near(m1.t, m0.t, 'min e: top stays'); near(m1.b, m0.b, 'min e: bottom stays'); near(m1.h2, m0.h2, 'min e: type unchanged', 0.01);
assert.ok(m0.r - m1.r > 20 || m1.w <= m0.w, 'min e: width changed');
await dragHandle('s', 0, 60);
const m2 = await fs();
assert.ok(m2.h > m1.h + 30, 'min s: taller ' + [m1.h, m2.h]);
near(m2.t, m1.t, 'min s: top stays');
await dragHandle('s', 0, -3000);
const m3 = await fs();
assert.ok(m3.h < m2.h && m3.h >= 52 * (m3.h2 / 24) - 1, 'min s: shortest = one heading line ' + m3.h);
await dragHandle('w', 3000, 0);
const m4 = await fs();
assert.ok(await page.evaluate(() => { const h = document.querySelector('.detail h2'); return h.getBoundingClientRect().height <= parseFloat(getComputedStyle(h).lineHeight) * 1.05; }), 'min: heading on one line at the narrowest');
const k0 = m4.h2;
await dragHandle('se', 40, 40);
const m5 = await fs();
assert.ok(m5.h2 > k0 || m5.w > m4.w, 'min corner: scales');
near(m5.l, m4.l, 'min se: left stays'); near(m5.t, m4.t, 'min se: top stays');
await page.click('[data-testid=detail-min]');
ok('Minimized panel: four edges and four corners resize it; heading stays on one line');
ok('Detail panel: corners resize proportionally, edges move only themselves, limits (title + buttons ... 2/3 width; title + one line ... full height) keep 14 px from the edges');
for (const sel of ['.side', '.detail']) assert.equal(await page.evaluate((q) => getComputedStyle(document.querySelector(q)).boxShadow, sel), 'none', sel + ' has no shadow');
ok('No shadow on the tag panel and the detail panel');
// Back and Full map buttons have the same size is checked in the map stub below
// The close button is not a drag handle
await page.click('.detail .close');
assert.equal(await page.locator('[data-testid=detail]').count(), 0);
await page.fill('.search', '');
ok('Detail panel drags by its heading block, stays within the map, keeps its position for the next building');

// Collapsible building list (desktop)
const sideW = () => page.evaluate(() => document.querySelector('.side').getBoundingClientRect().width);
assert.ok((await sideW()) > 250);
assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.side')).position), 'absolute', 'The tag panel floats over the map');
await page.click('.menu-btn');
await page.waitForTimeout(100);
assert.ok((await sideW()) > 40 && (await sideW()) < 80);
assert.ok((await page.evaluate(() => document.querySelector('.side').getBoundingClientRect().height)) < 80, 'Collapsed = just the button');
assert.equal(await page.locator('.side .list').isVisible(), false);
await page.screenshot({ path: resolve(shots, 'desktop-collapsed.png') });
const stageW = await page.evaluate(() => document.querySelector('.stage').getBoundingClientRect().width);
assert.ok(stageW >= 1200, String(stageW));
await page.click('.menu-btn');
await page.waitForTimeout(100);
assert.ok((await sideW()) > 250);
ok('Building list collapses to give the map the full width, and expands again');

// Plain-text rendering (HTML is not executed)
const injected = await page.evaluate(() => document.querySelectorAll('.detail script, .list script, .detail img').length);
assert.equal(injected, 0);
ok('No injected nodes');

// URL restore
const p2 = await newPage({ width: 1280, height: 800 });
await p2.goto(page_url + '#p=maxxi-rome&t=s:modern&q=hadid');
await p2.waitForSelector('[data-testid=detail]');
assert.equal((await p2.textContent('[data-testid=detail] h2')).trim(), 'MAXXI');
// Groups start collapsed; the checked count shows on the button and opening it shows the checked tag
assert.equal(await p2.locator('.tag-item').count(), 0);
assert.equal((await p2.textContent('[data-testid=checked-styles]')).trim(), '1');
await p2.click('.tag-toggle:has-text("Styles")');
assert.equal(await p2.locator('.tag-item[data-checked=true]').textContent().then((t) => /Modern/.test(t)), true);
assert.equal(await p2.inputValue('.search'), 'hadid');
ok('URL hash restores selection / era / search; a collapsed group shows its checked count');
await p2.close();

// ---------- Mobile ----------
const m = await newPage({ width: 390, height: 800 });
await m.goto(page_url);
await m.waitForSelector('.tabs');
assert.equal(await m.locator('.side').isVisible(), false);
assert.equal(await m.locator('.stage').isVisible(), true);
await m.screenshot({ path: resolve(shots, 'mobile-map.png') });
await m.click('.tabs button:has-text("List")');
assert.equal(await m.locator('.side').isVisible(), true);
assert.equal(await m.locator('.stage').isVisible(), false);
await m.screenshot({ path: resolve(shots, 'mobile-list.png') });
assert.equal(await m.locator('.list').count(), 0);
await m.fill('.search', 'Trevi');
await m.click('.list .item:has-text("Trevi Fountain")');
assert.equal(await m.locator('.stage').isVisible(), true);
await m.waitForSelector('[data-testid=detail]');
const box = await m.locator('[data-testid=detail]').boundingBox();
assert.ok(box.width >= 388 && box.y > 0, JSON.stringify(box));
ok('Mobile: tab switch, picking from the list returns to the map and shows the bottom panel');
await m.screenshot({ path: resolve(shots, 'mobile-detail.png') });
const overflow = await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
assert.equal(overflow, false);
ok('No horizontal scrolling on mobile');

// Figure ground check: steps through the buildings, Y / N marks advance and persist, the arrows move
await page.evaluate(() => window.localStorage.removeItem('gc-fg-marks'));
await page.click('[data-testid=fg-open]');
await page.waitForSelector('[data-testid=fgbar]');
const pos0 = await page.locator('[data-testid=fg-pos]').innerText();
assert.ok(/^1 \/ \d+$/.test(pos0), pos0);
const total = Number(pos0.split('/')[1]);
await page.keyboard.press('ArrowRight');
assert.ok((await page.locator('[data-testid=fg-pos]').innerText()).startsWith('2 /'), 'Right arrow: next');
await page.keyboard.press('ArrowLeft');
assert.ok((await page.locator('[data-testid=fg-pos]').innerText()).startsWith('1 /'), 'Left arrow: previous');
await page.keyboard.press('n');
assert.ok((await page.locator('[data-testid=fg-pos]').innerText()).startsWith('2 /'), 'N marks and advances');
await page.keyboard.press('y');
assert.ok((await page.locator('[data-testid=fg-pos]').innerText()).startsWith('3 /'), 'Y marks and advances');
const marks = await page.evaluate(() => JSON.parse(window.localStorage.getItem('gc-fg-marks') ?? '{}'));
assert.deepEqual(Object.values(marks), ['N', 'Y']);
assert.ok((await page.locator('.fg-sum').innerText()).includes('Marked 2/' + total), 'Summary counts the marks');
assert.ok(await page.locator('[data-testid=detail]').isVisible(), 'The building being checked is selected');
await page.click('[data-testid=fg-close]');
assert.equal(await page.locator('[data-testid=fgbar]').count(), 0);
ok('Figure ground check: arrows step, Y / N mark and advance, marks persist, the checked building is selected');

await browser.close();
if (problems.length) { console.error('Browser errors:\n' + problems.join('\n')); process.exit(1); }
console.log(`\nAll passed (${step} checks). Screenshots: ${shots}`);

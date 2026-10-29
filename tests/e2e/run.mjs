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

// View: no filter = Europe; with a filter = zoom to the results
const home = await page.evaluate(() => window.__map.bounds);
assert.deepEqual(home, [[-8, 36], [29.5, 55]]);
await page.click('.era-item:has-text("Modern")');
const modernBounds = await page.evaluate(() => window.__map.bounds);
assert.ok(modernBounds[0][0] < -70 && modernBounds[1][0] > 130, JSON.stringify(modernBounds)); // includes New York and Tokyo
await page.click('.era-back');
assert.deepEqual(await page.evaluate(() => window.__map.bounds), [[-8, 36], [29.5, 55]]);
ok('View: fixed on Europe with no filter, zooms to the results with a filter, back to Europe once cleared');

// Era filter
await page.click('.era-item:has-text("Ancient")');
assert.equal(await page.locator('.list .item').count(), ancient.length);
assert.equal(await page.locator('.era-item').count(), 0);
assert.match(await page.textContent('.era-current'), /Ancient/);
assert.equal(await page.locator('.marker').count(), ancient.reduce((n, p) => n + p.points.length, 0));
await page.screenshot({ path: resolve(shots, 'desktop-style.png') });
ok(`Ancient filter -> ${ancient.length} entries`);
await page.click('.era-back');
assert.equal(await page.locator('.era-item').count(), 5);
assert.equal(await page.locator('.list').count(), 0);
ok('Clearing the filter restores all entries');

// Search (including diacritics)
await page.fill('.search', 'pantheon');
const names = await page.locator('.list .item .name').allTextContents();
assert.ok(names.includes('Pantheon') && names.includes('Panthéon'), names.join(','));
ok(`Search for pantheon matches: ${names.join(', ')}`);
await page.fill('.search', 'zzzzzz');
assert.equal(await page.locator('.empty').count(), 1);
ok('No results shows the empty state');
await page.fill('.search', '');

// Located only
await page.check('.check input');
const located = data.places.filter((p) => p.points.length).length;
assert.equal(await page.locator('.list .item').count(), located);
await page.uncheck('.check input');
ok(`Located only -> ${located} entries`);

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
  await page.click('.unloc summary');
  await page.click(`.unloc button:has-text("${unloc[0].name}")`);
  await page.waitForSelector('[data-testid=detail] .gap');
  assert.match(await page.textContent('[data-testid=detail] .gap'), /No coordinate yet/);
  ok('Unlocated list -> detail shows the reason for the gap');
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

// Collapsible building list (desktop)
const sideW = () => page.evaluate(() => document.querySelector('.side').getBoundingClientRect().width);
assert.ok((await sideW()) > 300);
await page.click('.menu-btn');
await page.waitForTimeout(100);
assert.ok((await sideW()) > 40 && (await sideW()) < 80);
assert.equal(await page.locator('.side .list').isVisible(), false);
await page.screenshot({ path: resolve(shots, 'desktop-collapsed.png') });
const stageW = await page.evaluate(() => document.querySelector('.stage').getBoundingClientRect().width);
assert.ok(stageW >= 1200, String(stageW));
await page.click('.menu-btn');
await page.waitForTimeout(100);
assert.ok((await sideW()) > 300);
ok('Building list collapses to give the map the full width, and expands again');

// Plain-text rendering (HTML is not executed)
const injected = await page.evaluate(() => document.querySelectorAll('.detail script, .list script, .detail img').length);
assert.equal(injected, 0);
ok('No injected nodes');

// URL restore
const p2 = await newPage({ width: 1280, height: 800 });
await p2.goto(page_url + '#p=maxxi-rome&e=modern&q=hadid&loc=1');
await p2.waitForSelector('[data-testid=detail]');
assert.equal((await p2.textContent('[data-testid=detail] h2')).trim(), 'MAXXI');
assert.match(await p2.textContent('.era-current'), /Modern/);
assert.equal(await p2.inputValue('.search'), 'hadid');
assert.equal(await p2.isChecked('.check input'), true);
ok('URL hash restores selection / era / search / located-only');
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

await browser.close();
if (problems.length) { console.error('Browser errors:\n' + problems.join('\n')); process.exit(1); }
console.log(`\nAll passed (${step} checks). Screenshots: ${shots}`);

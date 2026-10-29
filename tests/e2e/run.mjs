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
assert.equal(await page.locator('.list .item').count(), total);
assert.equal(await page.locator('.marker').count(), totalPts);
ok('List rows and marker count are correct');

// View: no filter = Europe; with a filter = zoom to the results
const home = await page.evaluate(() => window.__map.bounds);
assert.deepEqual(home, [[-8, 36], [29.5, 55]]);
await page.click('.chip:has-text("Modern")');
const modernBounds = await page.evaluate(() => window.__map.bounds);
assert.ok(modernBounds[0][0] < -70 && modernBounds[1][0] > 130, JSON.stringify(modernBounds)); // includes New York and Tokyo
await page.click('.chip:has-text("Modern")');
assert.deepEqual(await page.evaluate(() => window.__map.bounds), [[-8, 36], [29.5, 55]]);
ok('View: fixed on Europe with no filter, zooms to the results with a filter, back to Europe once cleared');

// Era filter
await page.click('.chip:has-text("Ancient")');
assert.equal(await page.locator('.list .item').count(), ancient.length);
assert.equal(await page.getAttribute('.chip:has-text("Ancient")', 'aria-pressed'), 'true');
assert.equal(await page.locator('.marker').count(), ancient.reduce((n, p) => n + p.points.length, 0));
ok(`Ancient filter -> ${ancient.length} entries`);
await page.click('.chip:has-text("Ancient")');
assert.equal(await page.locator('.list .item').count(), total);
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
await page.click('.list .item:has-text("Colosseum")');
await page.waitForSelector('[data-testid=detail]');
assert.equal((await page.textContent('[data-testid=detail] h2')).trim(), 'Colosseum');
const href = await page.getAttribute('[data-testid=detail] .pt a', 'href');
assert.equal(href, 'https://en.wikipedia.org/wiki/Colosseum');
assert.equal(await page.getAttribute('[data-testid=detail] .pt a', 'rel'), 'noopener noreferrer');
assert.match(page.url(), /#p=colosseum-rome/);
assert.equal(await page.getAttribute('.marker[data-pid=colosseum-rome]', 'data-selected'), 'true');
ok('Selecting a building: detail, source link, URL hash, map selection state');
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
await page.click(`.list .item:has-text("${palladioName}")`);
const ptCount = await page.locator('[data-testid=detail] .pt').count();
assert.ok(ptCount >= 3, String(ptCount));
ok(`Compound row shows ${ptCount} sub-points`);
await page.click('[data-testid=detail] .locate >> nth=1');
const mapState = await page.evaluate(() => window.__map);
assert.ok(mapState.focus && mapState.focus.kind === 'point');
ok('The sub-point "Show on map" button focuses the map');

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

// Rows with no handout location whose coordinate was supplied by a source
await page.fill('.search', 'Salk');
await page.click('.list .item:has-text("Salk Institute")');
await page.waitForSelector('[data-testid=detail] .pt');
assert.match(await page.textContent('[data-testid=detail] .loc'), /not given in the handout/);
assert.match(await page.textContent('[data-testid=detail] .pnote'), /^Supplementary location: San Diego/);
assert.equal(await page.getAttribute('[data-testid=detail] .pt a', 'href'), 'https://en.wikipedia.org/wiki/Salk_Institute_for_Biological_Studies');
ok('Row with no location: location still shows "not given in the handout", the coordinate carries "Supplementary location" and a source');
await page.fill('.search', 'Wexner');
await page.click('.list .item:has-text("Wexner Center")');
await page.waitForSelector('[data-testid=detail] .pt a');
assert.equal((await page.textContent('[data-testid=detail] .pt a')).trim(), 'Source: latitude.to');
ok('A non-Wikipedia source shows its domain name');
await page.fill('.search', 'Villa Muggia');
await page.click('.list .item:has-text("Villa Muggia")');
await page.waitForSelector('[data-testid=detail] .pnote');
assert.match(await page.textContent('[data-testid=detail] .loc'), /Milan/);
assert.match(await page.textContent('[data-testid=detail] .pnote'), /inconsistent with the handout/);
ok('Source location disagrees with the handout: handout location unchanged, the coordinate note flags the conflict');
await page.fill('.search', '');

// Estimate point: marked unverified, no source link
await page.fill('.search', 'Santa Susanna');
await page.click('.list .item:has-text("Santa Susanna")');
await page.waitForSelector('[data-testid=detail] .prec-estimate');
assert.match(await page.textContent('[data-testid=detail] .status'), /unverified/);
assert.match(await page.textContent('[data-testid=detail] .pnote'), /confidence/i);
assert.equal(await page.locator('[data-testid=detail] .pt a').count(), 0);
await page.fill('.search', '');
ok('Estimate point: shows "Estimate (from memory, no source)", "unverified" and a confidence level, with no source link');

// Plain-text rendering (HTML is not executed)
const injected = await page.evaluate(() => document.querySelectorAll('.detail script, .list script, .detail img').length);
assert.equal(injected, 0);
ok('No injected nodes');

// URL restore
const p2 = await newPage({ width: 1280, height: 800 });
await p2.goto(page_url + '#p=maxxi-rome&e=modern&q=hadid&loc=1');
await p2.waitForSelector('[data-testid=detail]');
assert.equal((await p2.textContent('[data-testid=detail] h2')).trim(), 'MAXXI');
assert.equal(await p2.getAttribute('.chip:has-text("Modern")', 'aria-pressed'), 'true');
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

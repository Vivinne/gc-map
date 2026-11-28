/*
 * System-test model of the site (gc/test-plan.md appendix B): what screen is on, the actions a person can take,
 * recipes that reach each screen from a fresh visit, the record kept after every step, and the checks that must
 * hold after every step (appendix D).
 */
import { expect, type Page } from '@playwright/test';
import { appendFileSync } from 'node:fs';
import { streetTiles } from '../../playwright/map';

export const RECORD = process.env.FLOW_RECORD;

/** Desktop: where the mouse rests between steps: on the rail, where no mark of the map can be under it */
export const PARK = { x: 28, y: 600 };

// ---------- reading the page ----------

const mapParam = (page: Page) => new URL(page.url()).searchParams.get('m');
const livePanel = 'main section.panel:not(.leave *)';

/** The screen on now, by the address and the panel (appendix B states) */
export async function screenOf(page: Page): Promise<string> {
  return page.evaluate((sel) => {
    const q = new URLSearchParams(location.search);
    const panel = document.querySelector(sel);
    const folded = !panel && !!document.querySelector('nav.rail') && [...q.keys()].some((k) => k !== 'm');
    let s = 'map';
    if (q.get('b')) s = 'card';
    else if (q.get('g')) s = 'group';
    else if (q.get('p') === 'category') s = 'category';
    else if (q.get('p') === 'era') s = 'tag';
    else if (q.get('p') === 'search') {
      const recent = !!panel?.querySelector('.recent, .recent-b');
      const rows = panel?.querySelectorAll('.row').length ?? 0;
      s = panel?.textContent?.includes('No Results') ? 'typing-none' : recent ? 'typing-recent' : rows ? 'typing-preview' : 'typing-empty';
    } else if (q.get('q')) {
      const more = !!panel?.querySelector('.fold-btn');
      const countries = !!panel?.querySelector('.c-head');
      s = more ? 'results-more' : countries ? 'results-countries' : 'results-small';
    }
    return folded ? `${s}:folded` : s;
  }, livePanel);
}

/** Everything a step changes (appendix B, every-step record) */
export async function stateOf(page: Page) {
  return page.evaluate((sel) => {
    const q = new URLSearchParams(location.search);
    q.delete('m');
    const panel = document.querySelector(sel) as HTMLElement | null;
    const box = document.querySelector('input[type=search]') as HTMLInputElement | null;
    let hist: unknown[] = [];
    try {
      hist = JSON.parse(sessionStorage.getItem('gc-map:history') ?? '[]') as unknown[];
    } catch {}
    const rail = [...document.querySelectorAll('nav.rail button')].map((b) => `${b.getAttribute('aria-pressed') ?? ''}${b.classList.contains('on') ? 'on' : ''}${(b as HTMLButtonElement).disabled ? 'off' : ''}`).join(',');
    return {
      address: q.toString(),
      history: hist.length,
      panel: panel ? [...panel.classList].filter((c) => !['panel', 'd', 'm', 'half', 'fold', 'full'].includes(c)).join(' ') : '',
      title: panel?.querySelector('.p-head .h-title')?.textContent ?? panel?.querySelector('h1')?.textContent ?? '',
      back: !!panel?.querySelector('.p-head [aria-label="Back"]') || !!document.querySelector('form.sbox [aria-label="Back"]'),
      rows: panel?.querySelectorAll('.row').length ?? 0,
      box: box?.value ?? null,
      recentTexts: JSON.parse(localStorage.getItem('gc-atlas:recent-text') ?? '[]') as string[],
      recentBuildings: JSON.parse(localStorage.getItem('gc-atlas:recent-building') ?? '[]') as string[],
      rail,
      rings: document.querySelectorAll('svg.overlay .mk.hot').length,
      dimmed: document.querySelectorAll('svg.overlay .mk.dim').length > 0,
    };
  }, livePanel);
}
export type State = Awaited<ReturnType<typeof stateOf>>;

/** Appendix D: what must never happen, checked after every step */
export async function problems(page: Page, mobile: boolean): Promise<string[]> {
  const out: string[] = [];
  const s = await stateOf(page);
  const screen = await screenOf(page);
  if ((await page.locator(livePanel).count()) > 1) out.push('two panels at once');
  // the error guard's page (Next.js also puts an empty alert region on every page, so the text is looked for)
  if (await page.getByText('Something went wrong').count()) out.push('error page');
  const lower = s.recentTexts.map((t) => t.toLowerCase());
  if (new Set(lower).size !== lower.length || new Set(s.recentBuildings).size !== s.recentBuildings.length) out.push('recent list repeats');
  if (s.recentTexts.length > 3 || s.recentBuildings.length > 3) out.push('recent list over 3');
  // the address matches the panel on screen
  const kind = screen.replace(/:folded$/, '');
  const want: Record<string, RegExp> = { card: /\bcard\b/, group: /\bgroup\b/, category: /\bcategory\b/, tag: /\bresults\b/, 'results-small': /\b(results|search)\b/, 'results-countries': /\b(results|search)\b/, 'results-more': /\b(results|search)\b/ };
  if (!screen.endsWith(':folded') && want[kind] && !want[kind].test(s.panel)) out.push(`address says ${kind}, panel is "${s.panel}"`);
  if (kind === 'map' && s.panel && !/preview|search/.test(s.panel)) out.push(`plain map with a panel "${s.panel}"`);
  // the ink ring follows pointing only: with the mouse away, no ring (a finger's last row may keep one)
  if (!mobile && s.rings > 0) out.push('ink ring with nothing pointed at');
  return out;
}

// ---------- steps ----------

/** Waits for the page to come to rest after a step: the camera has stopped (the marks stay put) and panels are in */
export async function rest(page: Page) {
  // a camera move starts shortly after a step (once the panel has its size): give it that time first
  await page.waitForTimeout(250);
  const where = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('svg.overlay .mk')]
        .slice(0, 6)
        .map((e) => { const r = e.getBoundingClientRect(); return `${Math.round(r.x)},${Math.round(r.y)}`; })
        .join(' ') + `|${new URL(location.href).searchParams.get('m')}`,
    ).catch(() => '');
  let last = await where();
  let still = 0;
  for (let i = 0; i < 60 && still < 4; i++) {
    await page.waitForTimeout(120);
    const now = await where();
    still = now === last ? still + 1 : 0;
    last = now;
  }
}

export async function fresh(page: Page) {
  await streetTiles(page, 'ok');
  // one recent search and one recent building waiting, so the recent lists can be used from the start
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('gc-atlas:recent-text', JSON.stringify(['villa']));
    localStorage.setItem('gc-atlas:recent-building', JSON.stringify(['pantheon-rome']));
  });
  await page.goto('./');
  await page.waitForFunction(() => !!document.querySelector('.map-canvas canvas'));
  await rest(page);
}

type Act = { can(page: Page, mobile: boolean): Promise<boolean>; run(page: Page, mobile: boolean): Promise<void> };
const visible = (page: Page, sel: string) => page.locator(sel).first().isVisible({ timeout: 0 }).catch(() => false);
/** A mark on the map well inside the screen */
async function markOnScreen(page: Page, sel: string) {
  const i = await page.locator(sel).evaluateAll((gs) =>
    gs.findIndex((g) => {
      const r = g.getBoundingClientRect();
      const panel = document.querySelector('main section.panel:not(.leave *)')?.getBoundingClientRect();
      const free = (x: number, y: number) => !panel || x < panel.left || x > panel.right || y < panel.top || y > panel.bottom;
      return r.width > 0 && r.left > 70 && r.right < innerWidth - 60 && r.top > 80 && r.bottom < innerHeight - 70 && free(r.left + r.width / 2, r.top + r.height / 2);
    }),
  );
  return i < 0 ? null : page.locator(sel).nth(i);
}
async function clickAt(page: Page, sel: string) {
  const m = await markOnScreen(page, sel);
  if (!m) throw new Error(`no ${sel} on screen`);
  const b = (await m.boundingBox())!;
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
}
const inPanel = (s: string) => `${livePanel} ${s}`;
const box = 'input[type=search]';
const rail = (page: Page, name: string) => page.locator('nav.rail').getByRole('button', { name, exact: true });
const typed = (text: string): Act => ({
  can: async (page) => page.evaluate(() => document.activeElement?.matches('input[type=search]') ?? false),
  run: async (page) => {
    await page.locator(box).fill(text);
  },
});

/** Appendix B actions (the ones that apply to this site's screens) */
export const ACTIONS: Record<string, Act> = {
  back: { can: async (p) => visible(p, `${inPanel('.p-head [aria-label="Back"]')}, form.sbox [aria-label="Back"]`), run: async (p) => p.locator(`${inPanel('.p-head [aria-label="Back"]')}, form.sbox [aria-label="Back"]`).first().click() },
  close: { can: async (p) => visible(p, inPanel('.p-head [aria-label="Close"]')), run: async (p) => p.locator(inPanel('.p-head [aria-label="Close"]')).first().click() },
  boxClear: { can: async (p) => visible(p, 'form.sbox [aria-label="Clear"]'), run: async (p) => p.locator('form.sbox [aria-label="Clear"]').first().click() },
  esc: { can: async () => true, run: async (p) => p.keyboard.press('Escape') },
  slash: { can: async (_p, m) => !m, run: async (p) => (await p.mouse.click(PARK.x, PARK.y), p.keyboard.press('/')) },
  clickBox: {
    can: async (p) => visible(p, box),
    run: async (p) => p.locator(box).first().click(),
  },
  typeMatch: typed('pan'),
  typeNone: typed('zzqxv'),
  enter: { can: async (p) => p.evaluate(() => { const a = document.activeElement as HTMLInputElement | null; return !!a?.matches('input[type=search]') && !!a.value; }), run: async (p) => p.keyboard.press('Enter') },
  previewRow: { can: async (p) => (await stateOf(p)).address.includes('p=search') && visible(p, inPanel('.row:not(.text):not(.recent-b .row)')), run: async (p) => p.locator(inPanel('ul.rows:not(.recent) .row:not(.text)')).first().click() },
  recentText: { can: async (p) => visible(p, inPanel('.row.text')), run: async (p) => p.locator(inPanel('.row.text')).first().click() },
  recentBuilding: { can: async (p) => visible(p, inPanel('.recent-b .row')), run: async (p) => p.locator(inPanel('.recent-b .row')).first().click() },
  removeRecent: { can: async (p) => visible(p, inPanel('.rm-x')), run: async (p) => p.locator(inPanel('.rm-x')).first().click() },
  row: { can: async (p) => !(await stateOf(p)).address.includes('p=search') && visible(p, inPanel('.row')), run: async (p) => p.locator(inPanel('.row')).first().click() },
  hoverRow: { can: async (p, m) => !m && visible(p, inPanel('.row')), run: async (p) => (await p.locator(inPanel('.row')).first().hover(), p.mouse.move(PARK.x, PARK.y)) },
  country: { can: async (p) => visible(p, inPanel('.c-head:not(.off)')), run: async (p) => p.locator(inPanel('.c-head:not(.off)')).first().click() },
  moreOpen: { can: async (p) => visible(p, inPanel('.more-btn')), run: async (p) => p.locator(inPanel('.more-btn')).first().click() },
  moreClose: { can: async (p) => visible(p, inPanel('.fold-btn')), run: async (p) => p.locator(inPanel('.fold-btn')).first().click() },
  architect: { can: async (p) => visible(p, inPanel('.c-who')), run: async (p) => p.locator(inPanel('.c-who')).first().click() },
  categoryBtn: { can: async (p, m) => m && visible(p, '.topbar [aria-label="Category"]'), run: async (p) => p.locator('.topbar [aria-label="Category"]').click() },
  tag: { can: async (p) => visible(p, inPanel('.chip')), run: async (p) => p.locator(inPanel('.chip')).filter({ hasText: 'Baroque' }).click() },
  railSearch: { can: async (_p, m) => !m, run: async (p) => rail(p, 'Search').click() },
  railCategory: { can: async (_p, m) => !m, run: async (p) => rail(p, 'Category').click() },
  railFold: { can: async (p, m) => !m && p.evaluate(() => !(document.querySelector('nav.rail .rail-fold') as HTMLButtonElement | null)?.disabled), run: async (p) => p.locator('nav.rail .rail-fold').click() },
  mapDot: { can: async (p) => !!(await markOnScreen(p, 'svg.overlay circle.mk.dot')), run: async (p) => clickAt(p, 'svg.overlay circle.mk.dot') },
  mapName: { can: async (p) => !!(await markOnScreen(p, 'svg.overlay g.mk.name')), run: async (p) => clickAt(p, 'svg.overlay g.mk.name') },
  mapNum: { can: async (p) => !!(await markOnScreen(p, 'svg.overlay g.mk.num')), run: async (p) => clickAt(p, 'svg.overlay g.mk.num') },
  zoomIn: { can: async (_p, m) => !m, run: async (p) => p.getByRole('button', { name: 'Zoom in' }).click() },
  zoomOut: { can: async (_p, m) => !m, run: async (p) => p.getByRole('button', { name: 'Zoom out' }).click() },
  wheel: { can: async (_p, m) => !m, run: async (p) => (await p.mouse.move(1000, 400), p.mouse.wheel(0, -300)) },
  dragMap: {
    can: async () => true,
    run: async (p, m) => {
      const [x, y] = m ? [200, 140] : [1000, 300];
      await p.mouse.move(x, y);
      await p.mouse.down();
      await p.mouse.move(x - 50, y + 30, { steps: 5 });
      await p.mouse.up();
    },
  },
  dragSheet: {
    can: async (p, m) => m && visible(p, inPanel('.p-head.drag')),
    run: async (p) => {
      const h = (await p.locator(inPanel('.p-head.drag')).boundingBox())!;
      await p.mouse.move(h.x + 40, h.y + 8);
      await p.mouse.down();
      await p.mouse.move(h.x + 40, h.y + 90, { steps: 5 });
      await p.mouse.up();
    },
  },
  reload: { can: async () => true, run: async (p) => (await p.reload(), p.waitForFunction(() => !!document.querySelector('.map-canvas canvas'))).then(() => {}) },
};

/** Recipes: actions from a fresh visit that reach each screen (appendix B states) */
export const RECIPES: Record<string, string[]> = {
  map: [],
  'typing-recent': ['clickBox'],
  'typing-preview': ['clickBox', 'typeMatch'],
  'typing-none': ['clickBox', 'typeNone'],
  'results-small': ['clickBox', 'search:palladio'],
  'results-countries': ['clickBox', 'search:baroque'],
  'results-more': ['clickBox', 'search:pantheon', 'moreOpen'],
  'category-plain': ['category'],
  'category-over': ['clickBox', 'search:villa', 'category'],
  tag: ['category', 'tag'],
  group: ['mapNum'],
  'card-map': ['zoomTo', 'mapDot'],
  'card-list': ['clickBox', 'search:villa', 'row'],
  'card-preview': ['clickBox', 'typeMatch', 'previewRow'],
  'card-recent': ['clickBox', 'recentBuilding'],
  'card-architect': ['clickBox', 'search:palladio', 'row', 'architect', 'row'],
  'results-small:folded': ['clickBox', 'search:palladio', 'railSearch'],
  'tag:folded': ['category', 'tag', 'railCategory'],
  'group:folded': ['mapNum', 'railFold'],
  'card-list:folded': ['clickBox', 'search:villa', 'row', 'railFold'],
};
export const DESKTOP_ONLY = new Set(['results-small:folded', 'tag:folded', 'group:folded', 'card-list:folded']);

/** Runs one recipe or action step by name */
export async function act(page: Page, mobile: boolean, name: string) {
  if (name.startsWith('type:')) {
    await page.locator(box).fill(name.slice(5));
  } else if (name.startsWith('search:')) {
    await page.locator(box).fill(name.slice(7));
    await page.keyboard.press('Enter');
  } else if (name === 'category') {
    if (mobile) await page.locator('.topbar [aria-label="Category"]').click();
    else await rail(page, 'Category').click();
  } else if (name === 'zoomTo') {
    // a closer view over northern Italy, where single dots stand apart
    await page.goto('./?m=11.2,45.2,7');
    await page.waitForFunction(() => !!document.querySelector('.map-canvas canvas'));
  } else if (name === 'clickBox' && !mobile && !(await visible(page, box))) {
    await rail(page, 'Search').click();
    await page.waitForTimeout(300);
    await page.locator(box).click();
  } else await ACTIONS[name]!.run(page, mobile);
  await rest(page);
}

export function record(entry: Record<string, unknown>) {
  if (RECORD) appendFileSync(RECORD, `${JSON.stringify(entry)}\n`);
}

export { expect };

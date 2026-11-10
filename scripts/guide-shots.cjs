// Screenshots for the page guides. Runs the single-file site (site/index.html) in Chromium, sets up each
// scene, captures it and records where each marked control is (as a fraction of the picture), then writes
// src/data/guide-shots.ts with the pictures (WebP, base64) and the marks.
//   node scripts/guide-shots.cjs            build everything
//   DEBUG=1 node scripts/guide-shots.cjs    also write full screenshots with the marks drawn to /tmp/guide-debug
// Needs Playwright and Chromium (PLAYWRIGHT, CHROME env vars) and Python with Pillow for the WebP step.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT || '/opt/node-tools/node_modules/playwright');

const ROOT = path.join(__dirname, '..');
const RAW = '/tmp/guide-raw';
const DEBUG = process.env.DEBUG ? '/tmp/guide-debug' : '';
fs.mkdirSync(RAW, { recursive: true });
if (DEBUG) fs.mkdirSync(DEBUG, { recursive: true });

const DEVICES = {
  d: { width: 1440, height: 900, phone: false },
  m: { width: 390, height: 844, phone: true },
};

// A mark: `q` is a CSS selector (first visible match) or a function body run in the page returning an
// element; `at` is the point on it: c (centre), l, r, t, b (middle of that edge); `label` is the words shown.
const tab = (phone, label) => (phone ? `.tabbar button[aria-label="${label}"]` : `.modes button[aria-label="${label}"]`);

// find by text: the first visible element matching `sel` whose text starts with `t`
const byText = (sel, t) => `fn:const v=[...document.querySelectorAll(${JSON.stringify(sel)})].filter((e)=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&e.textContent.trim().startsWith(${JSON.stringify(t)})});const a=(e)=>{const r=e.getBoundingClientRect();return r.width*r.height};v.sort((x,y)=>a(x)-a(y));return v[0]||null`;
const nth = (sel, k) => `fn:const v=[...document.querySelectorAll(${JSON.stringify(sel)})].filter((e)=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0});return v[${k}]||null`;

async function search(p, phone, q) {
  if (phone) await p.locator('.m-search').click();
  else await p.keyboard.press('/');
  await p.waitForTimeout(250);
  if (q) {
    await p.keyboard.type(q);
    await p.waitForTimeout(300);
  }
}
async function closeAll(p, phone) {
  for (let k = 0; k < 3; k++) await p.keyboard.press('Escape');
  if (phone) {
    const x = p.locator('.m-sheet [aria-label="Close"]');
    if (await x.count()) await x.first().click().catch(() => {});
  }
}
async function union(p, sels, pad, full) {
  return p.evaluate(({ sels, pad, full }) => {
    const rs = sels.flatMap((s) => [...document.querySelectorAll(s)]).map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0);
    if (!rs.length) return null;
    let x0 = Math.min(...rs.map((r) => r.left)) - pad, y0 = Math.min(...rs.map((r) => r.top)) - pad;
    let x1 = Math.max(...rs.map((r) => r.right)) + pad, y1 = Math.max(...rs.map((r) => r.bottom)) + pad;
    x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(innerWidth, x1); y1 = Math.min(innerHeight, y1);
    if (full === 'w') { x0 = 0; x1 = innerWidth; }
    return { x: Math.round(x0), y: Math.round(y0), width: Math.round(x1 - x0), height: Math.round(y1 - y0) };
  }, { sels, pad, full });
}

const SCENES = [
  {
    id: 'map-main',
    async setup(p) {
      await home(p);
    },
    // phone: the top of the screen, where the controls are (the page tabs below need no guide)
    crop: async (p, phone) => (phone ? { x: 0, y: 0, width: 390, height: 520 } : null),
    marks: (phone) => [
      { q: phone ? '.m-fbtn' : '.fbtn', label: 'Opens filters and the list' },
      { q: phone ? '.m-search' : '.top .search', label: 'Finds buildings, architects, cities' },
      { q: '.modes', label: 'Switches page', desk: true },
      { q: "fn:const v=[...document.querySelectorAll('.overlay .donut')].map((e)=>[e,e.getBoundingClientRect()]).filter(([,r])=>r.width>0&&r.top>innerHeight*0.3&&r.top<innerHeight*(innerWidth<900?0.52:0.8));v.sort((a,b)=>a[1].x-b[1].x);return v[0]?v[0][0]:null", label: 'Lists the buildings in a city', side: 'l' },
      { q: "fn:const c=[innerWidth/2,innerHeight/2];const v=[...document.querySelectorAll('.overlay .dot')].map((e)=>[e,e.getBoundingClientRect()]).filter(([,r])=>r.width>0&&r.top>innerHeight*0.3&&r.top<innerHeight*(innerWidth<900?0.52:0.8));v.sort((a,b)=>a[1].x-b[1].x);return v[0]?v[0][0]:null", label: 'Opens a building', side: 'l' },
      ...(phone ? [] : [{ q: '.ctrls button[aria-label="Zoom in"]', label: 'Zooms in or out' }]),
      { q: '.ctrls button[aria-label="Country"]', label: 'Shows the whole country' },
      { q: '.ctrls button[aria-label="Full map"]', label: 'Shows the whole map' },
    ],
  },
  {
    id: 'map-filters',
    async setup(p, phone) {
      await p.locator(phone ? '.m-fbtn' : '.fbtn').click();
      await p.waitForTimeout(400);
      await p.locator('.index .styles button').nth(3).click();
      await p.waitForTimeout(400);
    },
    crop: async (p, phone) => (phone ? union(p, ['.m-sheet .styles', '.m-sheet .sec', '.m-sheet .rows li:nth-child(-n+4) .row'], 8, 'w').then((r) => r && { ...r, y: 0, height: r.y + r.height }) : union(p, ['.index .styles', '.index .sec', '.index .rows li:nth-child(-n+5) .row'], 14)),
    marks: () => [
      { q: '.index .styles button', label: 'Pick styles, oldest first', desk: true },
      { q: nth('.index .sec .chips button', 0), label: 'Pick countries', desk: true },
      { q: byText('.index .sec .chips button', 'TEST-ARCHED'), label: 'Buildings from past exams', desk: true },
      { q: '.index [aria-label^="Starred"]', label: 'Your starred buildings', side: 'r', desk: true },
      { q: ['.index .styles', '.index .sec .chips'], label: 'Tap tags to filter the map', phone: true },
      { q: '.index .rows .row', label: 'Opens a building', desk: true },
      { q: nth('.index .rows .row', 1), label: 'Opens a building', phone: true },
      { q: '.index .chip.clear', label: 'Removes every filter', desk: true },
    ],
  },
  {
    id: 'map-card',
    async setup(p, phone) {
      await closeAll(p, phone);
      const rm = p.locator('[aria-label="Active filters"] [aria-label^="Remove"]');
      while (await rm.count()) { await rm.first().click(); await p.waitForTimeout(200); }
      await search(p, phone, 'pantheon');
      await p.keyboard.press('Enter');
      await p.waitForTimeout(2500);
    },
    crop: async (p, phone) => (phone ? union(p, ['.side .grab', '.side .c-top', '.side .c-body', '.side .others-h'], 4, 'w').then((r) => r && { ...r, height: Math.min(844 - r.y, r.height + 40) }) : union(p, ['.side'], 10)),
    marks: (phone) => [
      { q: '.c-back-t', label: 'Back to the city' },
      { q: '.c-photo svg', label: 'Opens photos of it', desk: true },
      { q: '.c-bar [aria-label="Previous"] svg', label: 'Previous or next building' },
      { q: '.c-bar [aria-label="Collect"] svg', label: 'Stars it or adds it to a list' },
      { q: '.c-bar [aria-label="Close"] svg', label: 'Closes the card', desk: true },
      { q: '.f-who, .f-who-t', label: 'Who designed it', desk: true },
      { q: '.f-keys li', label: 'Features to look for', side: 'l', desk: true },
      { q: '.c-tag', label: 'Shows all of this style', desk: true },
      { q: '.c-tags', label: 'Shows all with this tag', phone: true },
      { q: '.others-h', label: 'Lists the others in this city' },
    ],
  },
  {
    id: 'map-search',
    async setup(p, phone) {
      await closeAll(p, phone);
      // computer: the search window shown at the width of its list (its preview column left out), so the
      // picture is the whole window with the dimmed page round every side
      if (!phone) await p.addStyleTag({ content: '.pal{width:600px!important;max-width:600px!important}.pal-prev{display:none!important}' });
      await search(p, phone, '');
      await p.waitForSelector('.pal-in');
      await p.waitForTimeout(700);
    },
    crop: async (p, phone) => (phone ? union(p, ['.pal-in', '.pal-body .hit'], 10, 'w').then((r) => r && { ...r, y: 0, height: r.y + r.height }) : union(p, ['.pal'], 12)),
    marks: () => [
      { q: '.pal-in', label: 'Type a building, architect or city' },
      { q: nth('.pal .hit', 0), label: 'Reopens what you read lately' },
      { q: byText('.pal .hit', 'LC'), label: 'Opens an example' },
    ],
  },
  {
    id: 'quiz-run',
    async setup(p, phone) {
      await closeAll(p, phone);
      await p.locator(tab(phone, 'Quiz')).click();
      await p.waitForTimeout(500);
      await p.locator('.qv-quick:not(.qv-custom) .btn.dark').first().click();
      await p.waitForTimeout(400);
      await p.locator('.qv-o').nth(1).click();
      await p.waitForTimeout(300);
    },
    crop: async (p, phone) => (phone ? union(p, ['.qv-main'], 12, 'w') : union(p, ['.qv-main', '.qv-side'], 16)),
    marks: (phone) => [
      { q: '.qv-prog', label: 'Shows answered and still to come' },
      { q: phone ? '.qv-end' : byText('.qv-side .btn', 'End quiz'), label: 'Ends the quiz at any time' },
      ...(phone ? [] : [{ q: byText('.qv-side .btn', 'Quiz menu'), label: 'Back to the quiz menu' }, { q: nth('.qv-side li, .qv-side .qv-list > *', 0), label: 'Jumps to a question', at: 'l' }]),
      { q: nth('.qv-o', 1), label: 'Pick one answer', at: 'r' },
      { q: nth('.qv-main .act .btn', 0), label: 'Previous question' },
      { q: '.qv-main .act .btn.dark', label: 'Next, or skip if unsure' },
    ],
  },
  {
    id: 'quiz-result',
    async setup(p) {
      for (let k = 0; k < 14; k++) {
        if (await p.locator('.qv-confirm').count()) { await p.locator('.qv-confirm .btn.dark').click(); await p.waitForTimeout(150); }
        if (await p.locator('.qv-res').count()) break;
        if (!(await p.locator('.qv-o.on, .qv-o.pick, .qv-o[aria-pressed="true"]').count())) await p.locator('.qv-o').nth(k % 4).click().catch(() => {});
        const nx = p.locator('.qv-main .act .btn').last();
        if (!(await nx.count())) break;
        await nx.click();
        await p.waitForTimeout(350);
      }
      await p.waitForTimeout(800);
    },
    crop: async (p, phone) => (phone ? union(p, ['.qv-main'], 12, 'w').then((r) => r && { ...r, height: Math.min(844 - r.y, r.height + 80) }) : union(p, ['.qv-main', '.qv-side'], 16)),
    marks: (phone) => [
      { q: '.qv-res > div:first-child', label: 'How many you answered', desk: true },
      { q: '.qv-res > div:last-child', label: 'Right out of answered' },
      { q: nth('.qv-main .qv-rl, .qv-main li', 0), label: 'Opens the building', at: 'l' },
      { q: byText('.qv-res-act .btn', 'Quiz menu'), label: 'Back to the quiz menu', desk: true },
      { q: byText('.qv-res-act .btn', 'Mistakes'), label: 'Quizzes only the wrong ones' },
      { q: byText('.qv-res-act .btn', 'Retry'), label: 'Asks the same questions again' },
      { q: byText('.qv-res-act .btn', 'Practice again'), label: 'New questions of the same kind' },
      { q: '.qv-side', label: 'Lists all your mistakes', at: 't' },
    ],
  },
  {
    id: 'quiz-home',
    async setup(p, phone) {
      await p.locator('.qv-res-act .btn', { hasText: 'Quiz menu' }).click();
      await p.waitForTimeout(600);
    },
    crop: async (p, phone) => (phone ? union(p, ['.qv-col'], 12, 'w') : union(p, ['.qv-col'], 16)),
    marks: (phone) => [
      { q: '.qv-custom .btn.line', label: 'Starts your own quiz', ...(phone ? {} : { side: 'r' }) },
      { q: '.qv-custom .qv-fold', label: 'Chooses what to ask', ...(phone ? {} : { side: 'r' }) },
      { q: '.qv-quick:not(.qv-custom):not(.qv-again) .btn', label: 'Starts 5 quick questions', ...(phone ? {} : { side: 'r' }) },
      { q: '.qv-again .btn', label: 'Repeats the last kind, new questions', ...(phone ? {} : { side: 'r' }) },
    ],
  },
  {
    id: 'progress',
    async setup(p, phone) {
      await p.locator(tab(phone, 'Progress')).click();
      await p.waitForTimeout(600);
    },
    crop: async (p, phone) => (phone ? union(p, ['.me-parts', '.ov-tiles'], 8, 'w').then((r) => r && { ...r, y: 0, height: r.y + r.height }) : union(p, ['.me-parts button', '.ov-tiles > :nth-child(-n+3)'], 16)),
    marks: () => [
      { q: byText('.me-parts *', 'Mistakes'), label: 'Lists every wrong answer' },
      { q: byText('.me-parts *', 'Quiz history'), label: 'Lists past quizzes' },
      { q: byText('.me-parts *', 'Collections'), label: 'Shows your stars and lists' },
      { q: '.ov-acc', label: 'Your score over 7 days' },
      { q: nth('.ov-k', 0), label: 'Lists those buildings', at: 'b' },
    ],
  },
  {
    id: 'settings',
    async setup(p, phone) {
      await closeAll(p, phone);
      await p.locator(phone ? tab(phone, 'Settings') : '.modes button[aria-label="Settings"], .top button[aria-label="Settings"]').first().click();
      await p.waitForTimeout(600);
    },
    crop: async (p, phone) => union(p, ['.me-pg .card'], phone ? 10 : 16, phone ? 'w' : '').then((r) => (phone ? r && { ...r, height: Math.min(844 - r.y, r.height + 60) } : r)),
    marks: () => [
      { q: '.set-btns .btn', label: 'Opens a guide again' },
      { q: nth('.set-dev .btn', 0), label: 'Saves your progress to a file' },
      { q: nth('.set-dev .btn', 1), label: 'Loads it on another device' },
    ],
  },
];

async function home(p) {
  await p.goto('file://' + path.join(ROOT, 'site/index.html'));
  await p.waitForSelector('.overlay');
  await p.waitForTimeout(1500);
}

async function pointOf(p, m) {
  return p.evaluate(({ q, at }) => {
    const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    let r = null;
    if (Array.isArray(q)) {
      // several parts taken as one control: the box round all of them
      const rs = q.flatMap((x) => [...document.querySelectorAll(x)]).filter(vis).map((e) => e.getBoundingClientRect());
      if (!rs.length) return null;
      const l = Math.min(...rs.map((b) => b.left)), t = Math.min(...rs.map((b) => b.top));
      const rr = Math.max(...rs.map((b) => b.right)), bb = Math.max(...rs.map((b) => b.bottom));
      r = { left: l, top: t, right: rr, bottom: bb, width: rr - l, height: bb - t };
    } else {
      let el = null;
      if (q.startsWith('fn:')) el = new Function(q.slice(3))();
      else el = [...document.querySelectorAll(q)].find(vis) || null;
      if (!el) return null;
      r = el.getBoundingClientRect();
    }
    const x = at === 'l' ? r.left : at === 'r' ? r.right : r.left + r.width / 2;
    const y = at === 't' ? r.top : at === 'b' ? r.bottom : r.top + r.height / 2;
    return { x, y, box: [r.left, r.top, r.width, r.height] };
  }, { q: m.q, at: m.at || 'c' });
}

function emit() {
  const marks = {};
  for (const f of fs.readdirSync(RAW)) if (/^marks-[a-z]+\.json$/.test(f)) Object.assign(marks, JSON.parse(fs.readFileSync(path.join(RAW, f), 'utf8')));
  const lines = ['// Generated by scripts/guide-shots.cjs: screenshots of the site for the page guides, and where each marked control is.', "export interface GuideMark { x: number; y: number; label: string; b?: [number, number, number, number]; side?: 't' | 'b' | 'l' | 'r' }", 'export interface GuideShot { src: string; w: number; h: number; marks: GuideMark[] }', 'export const SHOTS: Record<string, GuideShot> = {'];
  let total = 0;
  for (const key of Object.keys(marks).sort()) {
    const png = path.join(RAW, `${key}.png`);
    const webp = path.join(RAW, `${key}.webp`);
    // desktop pictures show at up to ~800 px wide, phone ones at ~300: keep 1.75x that
    const max = key.startsWith('d-') ? 1400 : 560;
    execFileSync('python3', ['-c', `from PIL import Image\nim=Image.open(${JSON.stringify(png)}).convert('RGB')\nif im.width>${max}: im=im.resize((${max}, round(im.height*${max}/im.width)), Image.LANCZOS)\nim.save(${JSON.stringify(webp)}, 'WEBP', quality=72, method=6)`]);
    const b64 = fs.readFileSync(webp).toString('base64');
    total += b64.length;
    const m = marks[key];
    lines.push(`  ${JSON.stringify(key)}: { src: 'data:image/webp;base64,${b64}', w: ${m.w}, h: ${m.h}, marks: ${JSON.stringify(m.marks)} },`);
  }
  lines.push('};', '');
  fs.writeFileSync(path.join(ROOT, 'src/data/guide-shots.ts'), lines.join('\n'));
  console.log(`src/data/guide-shots.ts written (${(total / 1024).toFixed(0)} KB of pictures)`);
}

(async () => {
  if (process.argv[2] === 'emit') return emit();
  const only = process.argv[2];
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const out = {};
  for (const [dev, d] of Object.entries(DEVICES)) {
    if (process.env.DEV && process.env.DEV !== dev) continue;
    const c = await b.newContext({ viewport: { width: d.width, height: d.height }, isMobile: d.phone, hasTouch: d.phone, deviceScaleFactor: 2 });
    await c.addInitScript(() => {
      try { localStorage.setItem('gc-atlas:tours-seen', JSON.stringify(['map', 'quiz', 'progress', 'settings'])); localStorage.setItem('gc-atlas:guide-hidden', 'true'); } catch {}
      const s = document.createElement('style');
      s.textContent = '.map-tiles,.toast{display:none!important} *{caret-color:transparent!important}';
      document.addEventListener('DOMContentLoaded', () => document.head.appendChild(s));
    });
    await c.route(/google\.com|wikimedia|bing|openfreemap/, (r) => r.abort());
    const p = await c.newPage();
    p.on('pageerror', (e) => console.log(dev, 'pageerror', e.message));
    for (const s of SCENES) {
      if (only && s.id !== only) continue;
      // SCENES=a,b: only these (e.g. with Quiz and Progress off, their scenes cannot be reached)
      if (process.env.SCENES && !process.env.SCENES.split(',').includes(s.id)) continue;
      await s.setup(p, d.phone);
      await p.waitForTimeout(500);
      // never a picture taken mid-way through a panel's opening: every running animation finished first
      await p.evaluate(() => Promise.all(document.getAnimations().filter((x) => x.effect && x.effect.getTiming().iterations !== Infinity).map((x) => x.finished.catch(() => {}))));
      await p.waitForTimeout(150);
      const crop = (await s.crop(p, d.phone)) || { x: 0, y: 0, width: d.width, height: d.height };
      const file = path.join(RAW, `${dev}-${s.id}.png`);
      await p.screenshot({ path: file, clip: crop });
      const marks = [];
      for (const m of s.marks(d.phone).filter((m) => (d.phone ? !m.desk : !m.phone))) {
        const pt = await pointOf(p, m);
        if (!pt) { console.log(dev, s.id, 'missing', m.q); continue; }
        const f = (v, d) => +(v / d).toFixed(4);
        const [bx, by, bw, bh] = pt.box;
        marks.push({ x: f(pt.x - crop.x, crop.width), y: f(pt.y - crop.y, crop.height), b: [f(bx - crop.x, crop.width), f(by - crop.y, crop.height), f(bw, crop.width), f(bh, crop.height)], label: m.label, ...(m.side ? { side: m.side } : {}) });
      }
      out[`${dev}-${s.id}`] = { w: crop.width, h: crop.height, marks };
      if (DEBUG) {
        await p.evaluate((ms) => {
          for (const m of ms) { const e = document.createElement('div'); e.className = 'gdbg'; e.style.cssText = `position:fixed;z-index:9999;left:${m.x - 5}px;top:${m.y - 5}px;width:10px;height:10px;border-radius:50%;background:red`; e.title = m.label; document.body.appendChild(e); }
        }, await Promise.all(s.marks(d.phone).filter((m) => (d.phone ? !m.desk : !m.phone)).map((m) => pointOf(p, m))).then((a) => a.filter(Boolean)));
        await p.screenshot({ path: path.join(DEBUG, `${dev}-${s.id}.png`) });
        await p.evaluate(() => document.querySelectorAll('.gdbg').forEach((e) => e.remove()));
      }
    }
    await c.close();
  }
  await b.close();
  const file = path.join(RAW, `marks-${process.env.DEV || 'all'}.json`);
  // a run of some scenes keeps the marks of the others
  const before = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  fs.writeFileSync(file, JSON.stringify({ ...before, ...out }, null, 1));
  console.log(JSON.stringify(out));
})();

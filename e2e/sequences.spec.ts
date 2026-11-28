/*
 * Layer 4.4 long mixed use (gc/test-plan.md 4.4, appendix D): seeded random sequences of 40 steps over every
 * action, the same on every run (old and new sites take the same steps). Phones raise and lower the keyboard at every
 * search box, and turn now and then. After every step the appendix D checks run, plus:
 * \uff1c that changes nothing, a panel with no way out, the map moving on a step that must not move it.
 * A sequence that goes wrong is cut down to the fewest steps that still show the problem.
 * SEQ_DESKTOP / SEQ_PHONE: how many sequences (default 60 / 30); SEQ_STEPS: steps each (default 40).
 */
import { test, type Page } from '@playwright/test';
import { ACTIONS, PARK, act, expect, fresh, problems, record, screenOf, stateOf } from './support/site';

const COUNT = { desktop: Number(process.env.SEQ_DESKTOP ?? 60), phone: Number(process.env.SEQ_PHONE ?? 30) };
const STEPS = Number(process.env.SEQ_STEPS ?? 40);
/** Steps that must leave the map where it is */
const NO_MOVE = new Set(['hoverRow', 'removeRecent', 'typeMatch', 'typeNone', 'esc', 'close', 'boxClear', 'dragSheet', 'reload', 'railFold', 'clickBox']);
const TYPING = new Set(['typeMatch', 'typeNone', 'enter']);

const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const mapParam = (page: Page) => new URL(page.url()).searchParams.get('m');

/** One step with the phone's keyboard: up when the box is clicked, down at any other step (a sent search closes it) */
async function step(page: Page, mobile: boolean, name: string, kb: { up: boolean; full: { width: number; height: number } }) {
  if (mobile && kb.up && !TYPING.has(name)) {
    await page.setViewportSize(kb.full);
    kb.up = false;
  }
  if (name === 'rotate') {
    const v = page.viewportSize()!;
    await page.setViewportSize({ width: v.height, height: v.width });
    kb.full = { width: v.height, height: v.width };
    await page.waitForTimeout(300);
    return;
  }
  await act(page, mobile, name);
  if (mobile && name === 'clickBox' && !kb.up) {
    await page.setViewportSize({ width: kb.full.width, height: kb.full.height - 300 });
    kb.up = true;
  }
  if (mobile && name === 'enter' && kb.up) {
    await page.waitForTimeout(200);
    await page.setViewportSize(kb.full);
    kb.up = false;
    await page.waitForTimeout(1600);
  }
}

/** What went wrong at this step (appendix D and the three checks above) */
async function check(page: Page, mobile: boolean, name: string, before: Awaited<ReturnType<typeof stateOf>>, m0: string | null) {
  if (!mobile) await page.mouse.move(PARK.x, PARK.y);
  const out = await problems(page, mobile);
  const s = await stateOf(page);
  if (name === 'back' && s.address === before.address && s.history === before.history && s.panel === before.panel) out.push('\uff1c changed nothing');
  const typing = (await screenOf(page)).startsWith('typing');
  if (s.panel && !typing && !(await ACTIONS.back!.can(page, mobile)) && !(await ACTIONS.close!.can(page, mobile)) && !(await ACTIONS.boxClear!.can(page, mobile))) out.push('a panel with no \uff1c and no ×');
  if (NO_MOVE.has(name) && mapParam(page) !== m0) out.push(`the map moved (${m0} → ${mapParam(page)})`);
  return { out, s };
}

/** Chooses the next action: one that applies here, the ones used least in this sequence first */
async function choose(page: Page, mobile: boolean, rand: () => number, used: Map<string, number>) {
  const names = [...Object.keys(ACTIONS), ...(mobile ? ['rotate'] : [])];
  const can: string[] = [];
  for (const n of names) if (n === 'rotate' || (await ACTIONS[n]!.can(page, mobile))) can.push(n);
  // reloads and turns are rarer than the rest
  const weight = (n: string) => (n === 'reload' || n === 'rotate' ? 0.15 : 1) / (1 + (used.get(n) ?? 0));
  const total = can.reduce((t, n) => t + weight(n), 0);
  let r = rand() * total;
  for (const n of can) if ((r -= weight(n)) <= 0) return n;
  return can[can.length - 1]!;
}

/** Plays the given steps from a fresh visit; returns the problems at the last step */
async function replay(page: Page, mobile: boolean, steps: string[]) {
  const full = page.viewportSize()!;
  const kb = { up: false, full };
  await fresh(page);
  let last: string[] = [];
  for (const n of steps) {
    const before = await stateOf(page);
    const m0 = mapParam(page);
    if (n !== 'rotate' && !(await ACTIONS[n]!.can(page, mobile))) return ['(step not possible)'];
    await step(page, mobile, n, kb);
    last = (await check(page, mobile, n, before, m0)).out;
  }
  await page.setViewportSize(full);
  return last;
}

for (const device of ['desktop', 'phone'] as const)
  for (let i = 0; i < COUNT[device]; i++)
    test(`${device} sequence ${i + 1}`, async ({ page, isMobile }, info) => {
      test.skip((device === 'phone') !== isMobile, 'other device');
      test.setTimeout(10 * 60 * 1000);
      const rand = rng(1000 + i);
      const used = new Map<string, number>();
      const full = page.viewportSize()!;
      const kb = { up: false, full };
      const steps: string[] = [];
      await fresh(page);
      for (let k = 0; k < STEPS; k++) {
        const name = await choose(page, isMobile, rand, used);
        used.set(name, (used.get(name) ?? 0) + 1);
        steps.push(name);
        const from = await screenOf(page);
        const before = await stateOf(page);
        const m0 = mapParam(page);
        await step(page, isMobile, name, kb);
        const { out, s } = await check(page, isMobile, name, before, m0);
        record({ project: info.project.name, test: `${device} sequence ${i + 1}`, step: `${k + 1} ${name}`, from, to: await screenOf(page), ...s });
        if (out.length) {
          // cut down: drop earlier steps while the same problem still shows at the last step
          let short = [...steps];
          for (let d = 0; d < short.length - 1 && d < 25; ) {
            const tryIt = [...short.slice(0, d), ...short.slice(d + 1)];
            const again = await replay(page, isMobile, tryIt);
            if (again.some((x) => out.includes(x))) short = tryIt;
            else d++;
          }
          await page.setViewportSize(full);
          expect(out, `fewest steps: ${short.join(' > ')}`).toEqual([]);
        }
      }
      await page.setViewportSize(full);
    });

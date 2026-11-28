/*
 * Common checks for every screen module's component tests (gc/test-modules.md, the six common points):
 * press feedback, layout (no overlap, nothing outside, no cut text, no "…"), keyboard focus, accessibility.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page } from '@playwright/test';

/** R9: a press shows (colour, shadow or background changes, and the part moves down 1 px); the cursor is a pointer */
export async function expectPressFeedback(page: Page, target: Locator, opts: { move?: boolean } = {}) {
  await target.scrollIntoViewIfNeeded();
  const box = (await target.boundingBox())!;
  const look = () =>
    target.evaluate((e) => {
      const s = getComputedStyle(e);
      return { bg: s.backgroundColor, color: s.color, shadow: s.boxShadow, transform: s.transform, cursor: s.cursor };
    });
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(200);
  const hover = await look();
  await page.mouse.down();
  await page.waitForTimeout(200);
  const pressed = await look();
  // release away from the control so the check itself never presses it
  await page.mouse.move(0, 0);
  await page.mouse.up();
  expect(hover.cursor, 'pointer cursor').toBe('pointer');
  if (opts.move !== false) expect(pressed.transform, 'moves down 1 px').toBe('matrix(1, 0, 0, 1, 0, 1)');
  const changed = pressed.bg !== hover.bg || pressed.color !== hover.color || pressed.shadow !== hover.shadow || pressed.transform !== hover.transform;
  expect(changed, 'looks different while pressed').toBe(true);
}

/** Layout: inside the module, no two controls overlap, nothing sticks out sideways, no text is cut or ends in … */
export async function expectCleanLayout(root: Locator, opts: { inside?: string } = {}) {
  // opts.inside: controls drawn on purpose in another control's padding (the recent ×); they must still miss its text
  const problems = await root.evaluate((el, inside) => {
    const out: string[] = [];
    const r0 = el.getBoundingClientRect();
    const name = (e: Element) => `${e.tagName.toLowerCase()}.${(e.getAttribute('class') ?? '').split(' ')[0]} "${(e.textContent ?? '').trim().slice(0, 30)}"`;
    const all = [el, ...el.querySelectorAll('*')] as HTMLElement[];
    for (const e of all) {
      const r = e.getBoundingClientRect();
      if (!r.width || !r.height || getComputedStyle(e).visibility === 'hidden') continue;
      if (r.left < r0.left - 0.5 || r.right > r0.right + 0.5) out.push(`sticks out: ${name(e)}`);
      const s = getComputedStyle(e);
      if (s.textOverflow === 'ellipsis' && e.scrollWidth > e.clientWidth) out.push(`cut with …: ${name(e)}`);
      if (/…$/.test((e.childNodes.length === 1 && e.firstChild?.nodeType === 3 ? e.textContent : '') ?? '')) out.push(`ends in …: ${name(e)}`);
      if (s.overflowX === 'hidden' && e.scrollWidth > e.clientWidth + 1 && e.children.length === 0) out.push(`text cut: ${name(e)}`);
    }
    const controls = [...el.querySelectorAll('button, input, a')].filter((e) => (e as HTMLElement).getBoundingClientRect().width > 0) as HTMLElement[];
    for (let i = 0; i < controls.length; i++)
      for (let k = i + 1; k < controls.length; k++) {
        const a = controls[i]!.getBoundingClientRect(), b = controls[k]!.getBoundingClientRect();
        if (controls[i]!.contains(controls[k]!) || controls[k]!.contains(controls[i]!)) continue;
        const hit = (p: DOMRect, q: DOMRect) => Math.min(p.right, q.right) - Math.max(p.left, q.left) > 0.5 && Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top) > 0.5;
        const [x, y] = inside && controls[k]!.matches(inside) ? [controls[i]!, controls[k]!] : inside && controls[i]!.matches(inside) ? [controls[k]!, controls[i]!] : [null, null];
        if (x && y) {
          const yr = y.getBoundingClientRect();
          for (const t of x.querySelectorAll('*')) if (t.children.length === 0 && (t.textContent ?? '').trim() && hit(t.getBoundingClientRect(), yr)) out.push(`covers text: ${name(y)} / ${name(t)}`);
          continue;
        }
        if (hit(a, b)) out.push(`overlap: ${name(controls[i]!)} / ${name(controls[k]!)}`);
      }
    return out;
  }, opts.inside);
  expect(problems).toEqual([]);
}

/** Keyboard: Tab reaches the control and its focus ring shows */
export async function expectFocusRing(page: Page, target: Locator) {
  await target.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(target).toBeFocused();
  const outline = await target.evaluate((e) => getComputedStyle(e).outlineStyle);
  expect(outline, 'focus ring').not.toBe('none');
}

/** Accessibility: WCAG 2.2 AA rules (axe) on the mounted module */
export async function expectAccessible(page: Page, selector = '#root', allowed: string[] = []) {
  const r = await new AxeBuilder({ page: page as never }).include(selector).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).disableRules(['region']).analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`).filter((v) => !allowed.some((a) => v.startsWith(a)))).toEqual([]);
}

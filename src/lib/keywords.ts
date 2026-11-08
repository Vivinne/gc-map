import { BUILDINGS, ascii, whoOf, type Building } from './model';
import { valueOf } from './quiz';

/** The style a building is filed under now: the same name the quiz asks for */
export function styleOf(b: Building): string {
  return valueOf(b, 'style');
}

/**
 * Style labels from the old grouping that the handout notes still carry. A keyword that only names a style
 * group is left out: the card already gives the current style on its own line.
 */
const OLD_STYLE = new Set(['歸類 Post-modern', 'Baroque／Rococo', '新古典', '義大利理性主義']);

/** Splits a handout note into its parts at ；、＋, but not inside brackets (（Tuscan → Ionic；…）stays whole) */
function parts(note: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of note) {
    if (ch === '（' || ch === '(') depth++;
    if (ch === '）' || ch === ')') depth = Math.max(0, depth - 1);
    if (depth === 0 && (ch === '；' || ch === '、' || ch === '＋')) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

/** The handout note of a building as keywords, in the handout's own words */
export function keywordsOf(b: Building): string[] {
  const note = b.note.trim();
  if (!note || note === '—') return [];
  const style = styleOf(b).toLowerCase();
  return parts(note).filter((k) => !OLD_STYLE.has(k) && k.toLowerCase() !== style);
}

/** How many buildings each architect has on the site (by the name as written) */
const WORKS = new Map<string, number>();
for (const b of BUILDINGS) {
  const w = whoOf(b);
  if (w) WORKS.set(w, (WORKS.get(w) ?? 0) + 1);
}

/** Whether the architect of `b` has other buildings on the site */
export function hasOtherWorks(b: Building): boolean {
  const w = whoOf(b);
  return !!w && (WORKS.get(w) ?? 0) > 1;
}

/** The architect as shown (ASCII spelling) */
export function architectOf(b: Building): string {
  return ascii(whoOf(b));
}

import { BUILDINGS, byYear, citiesOf, norm, whoOf, type Building } from './model';
import { matchesQuery } from './filter';

/** Why a building matched when its name does not: shown beside it in the results */
export type Why = '' | 'Architect' | 'City' | 'Style' | 'In text';

export type Hit =
  | { kind: 'architect'; who: string; items: Building[] }
  | { kind: 'city'; city: string; items: Building[] }
  | { kind: 'building'; b: Building; why: Why };

export interface Results {
  /** Buildings whose name matches: exact name, then names starting with the text, then names containing it */
  buildings: Hit[];
  architects: Hit[];
  cities: Hit[];
  /** Buildings found through another field (architect, city, style, text), with the reason */
  others: Hit[];
  /** All hits in display order (for keyboard movement) */
  flat: Hit[];
  /** Buildings matched by the text (what Tab keeps as a list filter) */
  matched: Building[];
}

const MAX_BUILDINGS = 40;

/**
 * Rank of a building for the text: 0 exact name, 1 name starts with it (or a word of the name does),
 * 2 name contains it, 3 architect, 4 city, 5 style, 6 anywhere else in its text; -1 no match.
 */
function rank(b: Building, t: string, q: string): number {
  const name = norm(b.name);
  if (name === t) return 0;
  if (name.startsWith(t) || name.split(/[\s\-(/'’]+/).some((w) => w.startsWith(t))) return 1;
  if (name.includes(t)) return 2;
  if (norm(whoOf(b)).includes(t)) return 3;
  if (norm(b.city).includes(t) || norm(b.locLabel).includes(t)) return 4;
  if (norm(b.style).includes(t) || norm(b.styleShown).includes(t)) return 5;
  return matchesQuery(b, q) ? 6 : -1;
}
const WHY: Why[] = ['', '', '', 'Architect', 'City', 'Style', 'In text'];

export function search(q: string, list: Building[] = BUILDINGS): Results {
  const t = norm(q.trim());
  if (!t) return { buildings: [], architects: [], cities: [], others: [], flat: [], matched: [] };
  const byWho = new Map<string, Building[]>();
  for (const b of list) {
    const w = whoOf(b);
    if (!w || !norm(w).includes(t)) continue;
    const arr = byWho.get(w);
    if (arr) arr.push(b);
    else byWho.set(w, [b]);
  }
  const architects: Hit[] = [...byWho.entries()]
    .sort((a, b) => Number(norm(b[0]).startsWith(t)) - Number(norm(a[0]).startsWith(t)) || b[1].length - a[1].length)
    .slice(0, 4)
    .map(([who, items]) => ({ kind: 'architect', who, items: items.sort(byYear) }));
  const cities: Hit[] = citiesOf(list)
    .filter((c) => norm(c.city).includes(t))
    .sort((a, b) => Number(norm(b.city).startsWith(t)) - Number(norm(a.city).startsWith(t)))
    .slice(0, 3)
    .map((c) => ({ kind: 'city', city: c.city, items: c.items }));
  const ranked = list
    .map((b) => ({ b, r: rank(b, t, q) }))
    .filter((x) => x.r >= 0)
    .sort((x, y) => x.r - y.r || byYear(x.b, y.b));
  const matched = ranked.map((x) => x.b);
  const top = ranked.slice(0, MAX_BUILDINGS);
  const buildings: Hit[] = top.filter((x) => x.r <= 2).map((x) => ({ kind: 'building', b: x.b, why: '' }));
  const others: Hit[] = top.filter((x) => x.r > 2).map((x) => ({ kind: 'building', b: x.b, why: WHY[x.r]! }));
  return { buildings, architects, cities, others, flat: [...buildings, ...architects, ...cities, ...others], matched };
}

import { BUILDINGS, byYear, citiesOf, norm, whoOf, type Building } from './model';
import { matchesQuery } from './filter';

export type Hit =
  | { kind: 'architect'; who: string; items: Building[] }
  | { kind: 'city'; city: string; items: Building[] }
  | { kind: 'building'; b: Building };

export interface Results {
  architects: Hit[];
  cities: Hit[];
  buildings: Hit[];
  /** All hits in display order (for keyboard movement) */
  flat: Hit[];
  /** Buildings matched by the text (what Tab keeps as a list filter) */
  matched: Building[];
}

const MAX_BUILDINGS = 40;

export function search(q: string, list: Building[] = BUILDINGS): Results {
  const t = norm(q.trim());
  if (!t) return { architects: [], cities: [], buildings: [], flat: [], matched: [] };
  const byWho = new Map<string, Building[]>();
  for (const b of list) {
    const w = whoOf(b);
    if (!w || !norm(w).includes(t)) continue;
    const arr = byWho.get(w);
    if (arr) arr.push(b);
    else byWho.set(w, [b]);
  }
  const architects: Hit[] = [...byWho.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 4)
    .map(([who, items]) => ({ kind: 'architect', who, items: items.sort(byYear) }));
  const cities: Hit[] = citiesOf(list)
    .filter((c) => norm(c.city).includes(t))
    .slice(0, 3)
    .map((c) => ({ kind: 'city', city: c.city, items: c.items }));
  const matched = list.filter((b) => matchesQuery(b, q));
  // Name matches first, then the rest; each part by year
  const nameHit = (b: Building) => norm(b.name).includes(t);
  const ordered = [...matched.filter(nameHit).sort(byYear), ...matched.filter((b) => !nameHit(b)).sort(byYear)];
  const buildings: Hit[] = ordered.slice(0, MAX_BUILDINGS).map((b) => ({ kind: 'building', b }));
  return { architects, cities, buildings, flat: [...architects, ...cities, ...buildings], matched };
}

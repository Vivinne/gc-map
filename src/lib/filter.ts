import type { Filters, Place } from './types';

/** Strip diacritics and lower-case, so "Panthéon" and "pantheon" match each other */
export const norm = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

const haystack = (p: Place): string =>
  norm([p.name, p.loc, p.year, p.who, p.note, p.summary, p.style, ...p.points.map((x) => x.sub)].join(' '));

/** Every whitespace-separated keyword must match (AND) */
export function matchesQuery(p: Place, q: string): boolean {
  const tokens = norm(q).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const h = haystack(p);
  return tokens.every((t) => h.includes(t));
}

export function filterPlaces(places: readonly Place[], f: Filters): Place[] {
  return places.filter(
    (p) =>
      (f.eras.size === 0 || f.eras.has(p.era)) &&
      (!f.onlyLocated || p.points.length > 0) &&
      matchesQuery(p, f.q),
  );
}

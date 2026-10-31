import type { Era, Place } from './types';

export const YEARS = Array.from({ length: 13 }, (_, i) => 2007 + i);
export const COUNTRIES = ['Italy', 'France', 'Germany', 'United Kingdom', 'United States', 'Others'] as const;

export interface TagDef {
  id: string;
  label: string;
  color?: string;
  test: (p: Place) => boolean;
}
export interface TagGroup {
  id: 'years' | 'country' | 'styles';
  label: string;
  tags: TagDef[];
}

export function buildGroups(eras: readonly Era[]): TagGroup[] {
  return [
    { id: 'country', label: 'Country', tags: COUNTRIES.map((c) => ({ id: `c:${c}`, label: c, test: (p) => p.country === c })) },
    { id: 'styles', label: 'Styles', tags: eras.map((e) => ({ id: `s:${e.id}`, label: e.label, color: e.color, test: (p) => p.eras.includes(e.id) })) },
    { id: 'years', label: 'Previous Years', tags: YEARS.map((y) => ({ id: `y:${y}`, label: String(y), test: (p) => p.exams.includes(y) })) },
  ];
}

/** Tag lookup per groups array, built once (matchesTags runs for every building on every change) */
const DEFS = new WeakMap<readonly TagGroup[], Map<string, TagDef>>();
function defsOf(groups: readonly TagGroup[]): Map<string, TagDef> {
  let m = DEFS.get(groups);
  if (!m) {
    m = new Map(groups.flatMap((g) => g.tags).map((t) => [t.id, t]));
    DEFS.set(groups, m);
  }
  return m;
}

/** Intersection: every checked tag must match */
export function matchesTags(p: Place, tags: ReadonlySet<string>, groups: readonly TagGroup[]): boolean {
  if (tags.size === 0) return true;
  const defs = defsOf(groups);
  for (const id of tags) {
    const t = defs.get(id);
    if (!t || !t.test(p)) return false;
  }
  return true;
}

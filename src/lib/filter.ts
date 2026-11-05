import { BUILDINGS, COUNTRIES, ERA_ORDER, EXAM_YEARS, nationName, norm, type Building } from './model';
import type { EraId } from './types';

export interface Filters {
  styles: EraId[];
  countries: string[];
  /** Only buildings asked in previous years */
  exam: boolean;
  /** Narrow the previous-years filter to these years (empty = any year) */
  examYears: number[];
  starred: boolean;
  /** Start-year range from the period band, inclusive */
  range: [number, number] | null;
  /** Text kept as a list filter (from the search panel) */
  q: string;
  /** Architect kept as a list filter (exact display value) */
  who: string;
  /** One of the user's collections (its ids are kept in step with the collection) */
  col: { id: string; name: string; ids: string[] } | null;
}

export const EMPTY: Filters = { styles: [], countries: [], exam: false, examYears: [], starred: false, range: null, q: '', who: '', col: null };

export type FilterKey = 'styles' | 'countries' | 'exam' | 'range' | 'q' | 'who' | 'starred' | 'col';

export function isEmpty(f: Filters): boolean {
  return !f.styles.length && !f.countries.length && !f.exam && !f.starred && !f.range && !f.q && !f.who && !f.col;
}

export function matchesQuery(b: Building, q: string): boolean {
  const terms = norm(q).split(/\s+/).filter(Boolean);
  return terms.every((t) => b.haystack.includes(t));
}

/**
 * One building against the filters. Inside one group the checked tags are a union (any of them);
 * across groups they intersect. `skip` leaves one group out (used for the "if added" tag counts and the band).
 */
export function matches(b: Building, f: Filters, starred: ReadonlySet<string>, skip?: FilterKey): boolean {
  if (skip !== 'styles' && f.styles.length && !f.styles.some((s) => b.eras.includes(s))) return false;
  // a country is a filter group (Italy ... Others) or, from a building's country tag, one nation
  if (skip !== 'countries' && f.countries.length && !f.countries.includes(b.country) && !f.countries.includes(nationName(b))) return false;
  if (skip !== 'exam' && f.exam) {
    if (!b.exams.length) return false;
    if (f.examYears.length && !f.examYears.some((y) => b.exams.includes(y))) return false;
  }
  if (skip !== 'starred' && f.starred && !starred.has(b.id)) return false;
  if (skip !== 'range' && f.range && (b.y0 == null || b.y0 < f.range[0] || b.y0 > f.range[1])) return false;
  if (skip !== 'q' && f.q && !matchesQuery(b, f.q)) return false;
  if (skip !== 'who' && f.who && b.who !== f.who) return false;
  if (skip !== 'col' && f.col && !f.col.ids.includes(b.id)) return false;
  return true;
}

export function apply(f: Filters, starred: ReadonlySet<string>, list: Building[] = BUILDINGS, skip?: FilterKey): Building[] {
  return list.filter((b) => matches(b, f, starred, skip));
}

export function toggle<T>(arr: readonly T[], v: T): T[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

/** Count shown on each tag: buildings left if this tag were checked too (union inside its own group) */
export function tagCounts(f: Filters, starred: ReadonlySet<string>) {
  const styleBase = apply(f, starred, BUILDINGS, 'styles');
  const countryBase = apply(f, starred, BUILDINGS, 'countries');
  const examBase = apply({ ...f, examYears: [] }, starred, BUILDINGS, 'exam');
  const starBase = apply(f, starred, BUILDINGS, 'starred');
  const styles = Object.fromEntries(
    ERA_ORDER.map((e) => [e, styleBase.filter((b) => (f.styles.includes(e) ? f.styles : [...f.styles, e]).some((s) => b.eras.includes(s))).length]),
  ) as Record<EraId, number>;
  const countries = Object.fromEntries(
    COUNTRIES.map((c) => [c, countryBase.filter((b) => (f.countries.includes(c) ? f.countries : [...f.countries, c]).includes(b.country)).length]),
  ) as Record<string, number>;
  const examYears = Object.fromEntries(
    EXAM_YEARS.map((y) => [y, examBase.filter((b) => b.exams.length && (f.examYears.includes(y) ? f.examYears : [...f.examYears, y]).some((x) => b.exams.includes(x))).length]),
  ) as Record<number, number>;
  return {
    styles,
    countries,
    examYears,
    exam: examBase.filter((b) => b.exams.length > 0).length,
    starred: starBase.filter((b) => starred.has(b.id)).length,
  };
}

/** Short description of the active filters, for the list header and toasts */
export function describe(f: Filters): string {
  const parts: string[] = [];
  if (f.range) parts.push(`${fmt(f.range[0])} to ${fmt(f.range[1])}`);
  if (f.exam) parts.push(f.examYears.length ? `asked in ${f.examYears.join(', ')}` : 'asked in previous years');
  if (f.who) parts.push(f.who);
  if (f.col) parts.push(f.col.name);
  if (f.q) parts.push(`"${f.q}"`);
  return parts.join(', ');
}

function fmt(y: number): string {
  return y < 0 ? `BC ${-y}` : String(y);
}

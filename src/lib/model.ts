import { dataset } from './data';
import type { Era, EraId, Place } from './types';
import { ERA_COLORS } from '../styles/tokens';

/** Category order used everywhere (Category list, number point segments) */
export const ERA_ORDER: EraId[] = ['ancient', 'medieval', 'renaissance', 'mannerism', 'baroque', 'neoclassicism', 'artnouveau', 'beauxarts', 'modern', 'others'];
export interface Building extends Place {
  /** City key used for grouping: the display location without a trailing two-letter country code */
  city: string;
  /** Start year used for sorting (BC negative); null when the source gives none */
  y0: number | null;
  /** Short year shown in lists (first part of the built span, as written) */
  yearShort: string;
  /** Primary marker position */
  lng: number;
  lat: number;
  /** Lower-case, accent-free text of every displayed field, for search */
  haystack: string;
}

// The source writes centuries with a CJK suffix (e.g. "BC 6" + century sign); written as escapes to keep this file ASCII.
const CENTURY = '\u4e16\u7d00';
const centuryRe = new RegExp(`^(BC\\s*)?(\\d{1,2})\\s*(?:${CENTURY}|th|st|nd|rd)`);

/** First year of a built span. Centuries count as their middle (15th -> 1450, BC 6th -> -550). */
export function startYear(raw: string): number | null {
  const s = raw.trim();
  if (!s || s === '\u2014' || s === '-') return null;
  const c = s.match(centuryRe);
  if (c) {
    const mid = Number(c[2]) * 100 - 50;
    return c[1] ? -mid : mid;
  }
  const bc = s.match(/^BC\s*(\d+)/);
  if (bc) return -Number(bc[1]);
  const ad = s.match(/^(?:AD\s*)?(\d{1,4})/);
  if (ad) return Number(ad[1]);
  const any = s.match(/(\d{3,4})/);
  return any ? Number(any[1]) : null;
}

/** First part of a span as written ("1928-1931" -> "1928", "BC 447-BC 432" -> "BC 447") */
export function shortYear(raw: string): string {
  const s = raw.trim();
  if (!s || s === '\u2014') return '';
  return (s.split(/\s*[\u2013\u2014]\s*|-(?=\d)|\uff08/)[0] ?? s).trim();
}

export function norm(s: string): string {
  return s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function cityOf(p: Place): string {
  return (p.locLabel || p.loc || '').replace(/,\s*[A-Z]{2}$/, '').trim();
}

/** Architect / person, or empty when the source has none */
export function whoOf(p: Place): string {
  const w = p.who.trim();
  return w === '\u2014' || w === '-' ? '' : w;
}

export function toBuilding(p: Place): Building {
  const pt = p.points[0]!;
  return {
    ...p,
    city: cityOf(p),
    y0: startYear(p.year),
    yearShort: shortYear(p.year),
    lng: pt.lng,
    lat: pt.lat,
    haystack: norm([p.name, p.locLabel, p.loc, p.who, p.summary, p.note, p.style, p.points.map((x) => x.sub).join(' ')].join(' | ')),
  };
}

/** Style categories; their colours come from the design tokens */
export const ERAS: Record<EraId, Era> = Object.fromEntries(dataset.eras.map((e) => [e.id, { ...e, color: ERA_COLORS[e.id] }])) as Record<EraId, Era>;
export const BUILDINGS: Building[] = dataset.places.filter((p) => p.points.length > 0).map(toBuilding);
export const BY_ID = new Map(BUILDINGS.map((b) => [b.id, b]));

export function byYear(a: Building, b: Building): number {
  const ya = a.y0 ?? Number.POSITIVE_INFINITY;
  const yb = b.y0 ?? Number.POSITIVE_INFINITY;
  return ya - yb || a.name.localeCompare(b.name);
}

/** Full-width punctuation from the notes as plain ASCII, for the English data lines */
export function ascii(s: string): string {
  return s
    .replace(/\uff08/g, ' (')
    .replace(/\uff09/g, ')')
    .replace(/\s*\uff0f\s*/g, ' / ')
    .replace(/\s*\uff0b\s*/g, ' + ')
    .replace(/\uff1b/g, '; ')
    .replace(/\uff0c/g, ', ')
    .replace(/\uff1a/g, ': ')
    .replace(/\(\s+/g, '(')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** English style name: the part in brackets of the handout heading ("Ancient Rome"), without its note */
export function styleName(b: Place): string {
  if (b.styleShown) return b.styleShown;
  const m = b.style.match(/\uff08([^\uff09]+)\uff09/);
  const en = (m ? m[1]! : b.style).split(/[\uff1a:]/)[0]!.trim();
  return en;
}

/** Country name as shown to readers (Natural Earth name, shortened where it is long) */
export function nationName(b: Place): string {
  return b.nation.replace('United States of America', 'United States');
}

/** Supplementary line: years the building was a topic in TEST-ARCHED */
export function examNote(b: Place): string {
  return b.exams.length ? `TEST-ARCHED ${b.exams.join(' / ')}` : '';
}

import { BUILDINGS, ERAS, byYear, nationName, norm, type Building } from '../data';
import { architectOf, shownStyle } from '../data';
import type { EraId } from '../data';

/**
 * Search rules (Project doc gc/search-rules.md, 2026-11-25):
 * 1. Text and query are folded the same way: letter case, full-width / half-width forms, accents and curly quotes
 *    ignored; leading and trailing spaces dropped; a run of spaces counts as one.
 * 2. A word of the query is found when a field contains it. Words split by spaces must all be found, in any order.
 *    Short words such as "and" are words like any other.
 * 3. Order, compared step by step: how exact the hit is (whole field, field start, start of a word in it, inside a
 *    word), then where it is (name, tags, summary), then year, oldest first. With several words, the scores of the
 *    words add up.
 * 4. One letter or one digit: only names and tags that start with it.
 *
 * Fields: name; tags = architect, style, category, city, place, country and keywords (zh and en), each value on its
 * own; summary.
 */

/** How exact a hit is, best last */
const INSIDE = 1;
const WORD_START = 2;
const FIELD_START = 3;
const WHOLE = 4;

/** Where a hit is, best last */
const SUMMARY = 1;
const TAGS = 2;
const NAME = 3;

/** Folded text: case, width and accents folded, spaces trimmed and collapsed */
export function normQuery(s: string): string {
  return norm(s).replace(/\s+/g, ' ').trim();
}

interface Indexed {
  b: Building;
  name: string;
  tags: string[];
  summary: string;
}

const INDEX: Indexed[] = BUILDINGS.map((b) => ({
  b,
  name: normQuery(b.name),
  // The source's chapter name is left out: a chapter such as "Renaissance and Mannerism" would make every
  // Renaissance building a Mannerism hit.
  tags: [
    architectOf(b),
    b.who,
    shownStyle(b),
    b.styleCard,
    ERAS[b.era].label,
    ...b.eras.map((e) => ERAS[e].label),
    b.city,
    b.locLabel,
    b.loc,
    nationName(b),
    ...b.tags.map((t) => t.replace(/~~/g, '')),
    ...b.tagsEn.map((t) => t.replace(/~~/g, '')),
  ]
    .map((v) => normQuery(v ?? ''))
    .filter(Boolean),
  summary: normQuery(b.summary),
}));

/** How exact the word's best hit in one field is (0: not found) */
function exactness(field: string, w: string): number {
  if (!field) return 0;
  if (field === w) return WHOLE;
  if (field.startsWith(w)) return FIELD_START;
  let inside = false;
  for (let i = field.indexOf(w); i >= 0; i = field.indexOf(w, i + 1)) {
    if (/[\s\-_/]/.test(field[i - 1]!)) return WORD_START;
    inside = true;
  }
  return inside ? INSIDE : 0;
}

/** One number per hit: exactness first, then where; a higher number ranks higher */
const hitScore = (exact: number, where: number) => (exact - 1) * 3 + where;

interface Scored {
  b: Building;
  score: number;
  /** Every word is found in the name or a tag (not only in the summary) */
  inData: boolean;
}

function scoreOf(x: Indexed, words: string[], short: boolean): Scored | null {
  // one letter or digit: whole field or field start, in the name or a tag
  const min = short ? FIELD_START : INSIDE;
  let score = 0;
  let inData = true;
  for (const w of words) {
    const en = exactness(x.name, w);
    const et = Math.max(0, ...x.tags.map((t) => exactness(t, w)));
    const es = short ? 0 : exactness(x.summary, w);
    const best = Math.max(en >= min ? hitScore(en, NAME) : 0, et >= min ? hitScore(et, TAGS) : 0, es >= min ? hitScore(es, SUMMARY) : 0);
    if (!best) return null;
    if (en < min && et < min) inData = false;
    score += best;
  }
  return { b: x.b, score, inData };
}

/** Matches of a search, split in two (Polish 13) */
export interface Found {
  /** Every word is found in the name or a tag (architect, style, place, keywords) */
  main: Building[];
  /** The rest: some word is found only in the summary (behind Other Possible Outcomes) */
  more: Building[];
}

export function searchSplit(text: string): Found {
  const q = normQuery(text);
  if (!q) return { main: [], more: [] };
  const words = [...new Set(q.split(' '))];
  const short = /^[a-z0-9]$/.test(q);
  const all: Scored[] = [];
  for (const x of INDEX) {
    const s = scoreOf(x, words, short);
    if (s) all.push(s);
  }
  all.sort((p, r) => r.score - p.score || byYear(p.b, r.b));
  return { main: all.filter((s) => s.inData).map((s) => s.b), more: all.filter((s) => !s.inData).map((s) => s.b) };
}

/** What a search shows first: its main matches, or, when it has none, the rest */
export function search(text: string): Building[] {
  const f = searchSplit(text);
  return f.main.length ? f.main : f.more;
}

/** A Category tag picked in the Category page is not a search: exactly that category's buildings, oldest first */
export function categoryList(label: string): Building[] {
  const era = (Object.keys(ERAS) as EraId[]).find((e) => ERAS[e].label === label);
  return era ? BUILDINGS.filter((b) => b.eras.includes(era)).sort(byYear) : [];
}

/** The buildings a screen lists: a picked Category tag, or a search */
export function listOf(q: string, list: string): Found {
  return list === 'era' ? { main: categoryList(q), more: [] } : searchSplit(q);
}

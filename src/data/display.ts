import { ERAS, ascii, styleName, whoOf, type Building } from './model';

/** Two values joined by a middle dot, leaving out an empty one */
export const joinDot = (...parts: string[]): string => parts.filter(Boolean).join(' · ');

/** One short name per style group (the source writes some groups as lists) */
const SHORT_STYLE: Record<string, string> = {
  'Postwar / Contemporary': 'Modernism',
  'Arts & Crafts / Art Nouveau / Secession': 'Art Nouveau',
  'Baroque / Rococo': 'Baroque',
  'Italian Rationalism / Futurism': 'Italian Rationalism',
  'Early Christian / Byzantine': 'Byzantine',
  'Industrial Revolution / New Materials': 'Modernism',
  Bauhaus: 'Modernism',
  'Neoclassicism / Gothic Revival': 'Neoclassicism',
};

/** Architects whose works are all filed under one style */
const ARCHITECT_STYLE: Record<string, string> = {
  'Giuseppe Piermarini': 'Neoclassicism',
};

/** "Renaissance and Mannerism" -> "Renaissance / Mannerism" (a name before a comma keeps its own "and") */
function slashed(style: string): string {
  const parts = style.split(/,\s*/);
  const last = parts.pop()!;
  return [...parts, ...last.split(/\s+and\s+/)].join(' / ').replace(/\s+and\s+/g, ' & ');
}

/** The style a building is filed under (the same name v1 used everywhere) */
export function styleOf(b: Building): string {
  const st = ARCHITECT_STYLE[ascii(whoOf(b))] ?? slashed(styleName(b));
  return SHORT_STYLE[st] ?? st;
}

/** Style shown on rows and cards: the finer style when there is one (Brutalism, Gothic…), else the category name */
export function shownStyle(b: Building): string {
  const st = styleOf(b) === 'Modernism' && b.styleCard ? b.styleCard : styleOf(b);
  if (!st || st === 'Others') return ERAS[b.era].label;
  return st;
}

/**
 * Architect as shown (ASCII spelling); `-` when the source names none. Several people are always joined the same
 * way (user, 2026-11-25): two with "and", three or more with commas and a last "and"; the source's "A / B" becomes
 * "A and B". A firm stays as written ("Herzog & de Meuron", "Shreve, Lamb & Harmon").
 */
export function architectOf(b: Building): string {
  const who = ascii(whoOf(b));
  if (!who) return '-';
  const people = who.split(' / ');
  return people.length < 2 ? who : `${people.slice(0, -1).join(', ')} and ${people[people.length - 1]}`;
}

/**
 * The architect line split into its people, each searchable on its own: "A and B", "A / B" and "A, B and C"
 * become separate names with the joining words kept as plain text. A firm stays whole ("Herzog & de Meuron",
 * "Shreve, Lamb & Harmon": no " and "). A note in brackets stays on the name but is not searched.
 */
export function architectParts(b: Building): { text: string; search?: string }[] {
  const who = architectOf(b);
  if (who === '-') return [];
  const sep = who.includes(' and ') ? /(, | and )/ : /^$/;
  return who
    .split(sep)
    .filter(Boolean)
    .map((t, i) => (i % 2 ? { text: t } : { text: t, search: t.replace(/\s*\([^)]*\)/g, '').trim() }));
}

/** Built span as shown (start–completion, digits, centuries as "15th"); empty when unknown */
export function builtOf(b: Building): string {
  return b.built && b.built !== '—' ? ascii(b.built) : '';
}

/** A keyword written as "~~x~~": the building lacks x (shown struck through) */
export interface Keyword {
  text: string;
  struck: boolean;
}

/** Chinese keywords of a building, as the user edited them (data/tags-zh.txt) */
export function keywordsOf(b: Building): Keyword[] {
  return b.tags.map((t) => {
    const m = /^~~(.+)~~$/.exec(t);
    return m ? { text: m[1]!, struck: true } : { text: t, struck: false };
  });
}

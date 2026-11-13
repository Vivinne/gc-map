import { ERAS, ascii, styleName, whoOf, type Building } from './model';

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

/** Architect as shown (ASCII spelling); `-` when the source names none */
export function architectOf(b: Building): string {
  return ascii(whoOf(b)) || '-';
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

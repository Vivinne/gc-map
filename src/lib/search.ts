import { BUILDINGS, ERAS, byYear, nationName, norm, type Building } from './model';
import { architectOf, shownStyle, styleOf } from './style';

/** Text of a building's name, and of every other field searched (architect, style, city, country, keywords, summary) */
interface Indexed {
  b: Building;
  name: string;
  words: string[];
  rest: string;
}

const INDEX: Indexed[] = BUILDINGS.map((b) => ({
  b,
  name: norm(b.name),
  words: norm(b.name).split(/[\s\-(/'’]+/).filter(Boolean),
  rest: norm(
    [
      architectOf(b),
      b.who,
      styleOf(b),
      shownStyle(b),
      ERAS[b.era].label,
      ...b.eras.map((e) => ERAS[e].label),
      b.style,
      b.city,
      b.locLabel,
      b.loc,
      nationName(b),
      ...b.tags.map((t) => t.replace(/~~/g, '')),
      ...b.tagsEn.map((t) => t.replace(/~~/g, '')),
      b.summary,
    ].join(' | '),
  ),
}));

/**
 * Plain text search. Every word of the text must appear in the building's name or other fields.
 * Order: exact name, then a name (or a word of it) starting with the text, then a name containing it,
 * then a match in another field; buildings of the same rank oldest first.
 */
export function search(text: string, list: readonly Indexed[] = INDEX): Building[] {
  const t = norm(text.trim());
  if (!t) return [];
  const terms = t.split(/\s+/).filter(Boolean);
  const ranked: { b: Building; r: number }[] = [];
  for (const x of list) {
    if (!terms.every((w) => x.name.includes(w) || x.rest.includes(w))) continue;
    const r = x.name === t ? 0 : x.name.startsWith(t) || x.words.some((w) => w.startsWith(t)) ? 1 : x.name.includes(t) ? 2 : 3;
    ranked.push({ b: x.b, r });
  }
  return ranked.sort((p, q) => p.r - q.r || byYear(p.b, q.b)).map((x) => x.b);
}

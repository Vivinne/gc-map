import { BUILDINGS, ERAS, byYear, nationName, norm, type Building } from './model';
import { architectOf, shownStyle } from './style';

/** Text of a building's name, of its data fields (architect, style, city, country, keywords) and of its summary */
interface Indexed {
  b: Building;
  name: string;
  words: string[];
  fields: string;
  summary: string;
}

const INDEX: Indexed[] = BUILDINGS.map((b) => ({
  b,
  name: norm(b.name),
  words: norm(b.name).split(/[\s\-(/'’]+/).filter(Boolean),
  // Style: the building's own categories and the style shown on it. The source's chapter name is left out:
  // a chapter such as "Renaissance and Mannerism" would make every Renaissance building a Mannerism hit.
  fields: norm(
    [
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
    ].join(' | '),
  ),
  summary: norm(b.summary),
}));

/**
 * Plain text search. Every word of the text must appear in the building's name, data fields or summary.
 * Order: exact name, then a name (or a word of it) starting with the text, then a name containing it,
 * then a match in the data fields, then a match found only in the summary; same rank oldest first.
 * A category name is the exception: that category's buildings oldest first, then the other matches.
 * Matches found only inside another word come after all of these, in the same order.
 */
/** Whether a word of the text begins at a word start in the field (not only inside another word) */
function atWordStart(hay: string, w: string): boolean {
  for (let i = hay.indexOf(w); i >= 0; i = hay.indexOf(w, i + 1)) {
    if (i === 0 || !/[\p{L}\p{N}]/u.test(hay[i - 1]!)) return true;
  }
  return false;
}

export function search(text: string, list: readonly Indexed[] = INDEX): Building[] {
  const t = norm(text.trim());
  if (!t) return [];
  // The text is a category name (from the Category list, or typed): the buildings of that category in
  // year order, then any other match in year order. The same text always gives the same order.
  const era = (Object.keys(ERAS) as (keyof typeof ERAS)[]).find((e) => norm(ERAS[e].label) === t);
  const terms = t.split(/\s+/).filter(Boolean);
  const ranked: { b: Building; r: number }[] = [];
  for (const x of list) {
    if (!terms.every((w) => x.name.includes(w) || x.fields.includes(w) || x.summary.includes(w))) continue;
    const inData = terms.every((w) => x.name.includes(w) || x.fields.includes(w));
    // a word found only inside another word ("tate" in "United States") ranks after every whole-word match
    const inside = !terms.every((w) => atWordStart(x.name, w) || atWordStart(x.fields, w) || atWordStart(x.summary, w));
    const r = era
      ? x.b.eras.includes(era)
        ? 0
        : 1
      : x.name === t
        ? 0
        : x.name.startsWith(t) || x.words.some((w) => w.startsWith(t))
          ? 1
          : x.name.includes(t)
            ? 2
            : inData
              ? 3
              : 4;
    ranked.push({ b: x.b, r: inside ? r + 10 : r });
  }
  return ranked.sort((p, q) => p.r - q.r || byYear(p.b, q.b)).map((x) => x.b);
}

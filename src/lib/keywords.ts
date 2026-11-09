import { BUILDINGS, ascii, whoOf, type Building } from './model';
import { valueOf } from './quiz';

/** The style a building is filed under now: the same name the quiz asks for */
export function styleOf(b: Building): string {
  return valueOf(b, 'style');
}

/** A tag written as "~~x~~": the building lacks x (shown struck through) */
export interface Keyword {
  text: string;
  struck: boolean;
}

/** The feature tags of a building, as the user edited them (data/tags-zh.txt) */
export function keywordsOf(b: Building): Keyword[] {
  return b.tags.map((t) => {
    const m = /^~~(.+)~~$/.exec(t);
    return m ? { text: m[1]!, struck: true } : { text: t, struck: false };
  });
}

/** How many buildings each architect has on the site (by the name as written) */
const WORKS = new Map<string, number>();
for (const b of BUILDINGS) {
  const w = whoOf(b);
  if (w) WORKS.set(w, (WORKS.get(w) ?? 0) + 1);
}

/** Whether the architect of `b` has other buildings on the site */
export function hasOtherWorks(b: Building): boolean {
  const w = whoOf(b);
  return !!w && (WORKS.get(w) ?? 0) > 1;
}

/** The architect as shown (ASCII spelling) */
export function architectOf(b: Building): string {
  return ascii(whoOf(b));
}

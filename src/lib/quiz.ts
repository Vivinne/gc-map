/**
 * Cross quiz: one field of a building is shown, the answer is another field, four choices.
 * Wrong choices never include a value that is also right for the prompt (two buildings in Rome,
 * two works by the same architect).
 */
import { ascii, styleName, whoOf, type Building } from './model';
import { shuffle } from './review';

export type Field = 'name' | 'style' | 'architect' | 'city';
export const FIELDS: Field[] = ['name', 'style', 'architect', 'city'];
export const FIELD_LABEL: Record<Field, string> = { name: 'Building', style: 'Style', architect: 'Architect', city: 'City' };

export type Pair = `${Field}>${Field}`;
export const PAIRS: Pair[] = FIELDS.flatMap((a) => FIELDS.filter((b) => b !== a).map((b) => `${a}>${b}` as Pair));

export function valueOf(b: Building, f: Field): string {
  if (f === 'name') return b.name;
  if (f === 'style') return styleName(b);
  if (f === 'architect') return ascii(whoOf(b));
  return b.city;
}

export function splitPair(p: Pair): [Field, Field] {
  const [a, b] = p.split('>') as [Field, Field];
  return [a, b];
}

export interface Question {
  id: string;
  pair: Pair;
  prompt: string;
  options: string[];
  answer: string;
}

/** Buildings that can be asked with this pair (both fields known) */
export function askable(pool: Building[], pair: Pair): Building[] {
  const [a, b] = splitPair(pair);
  return pool.filter((x) => valueOf(x, a) && valueOf(x, b));
}

/**
 * A question about building `b`. Wrong choices come from `all` (the whole set, so a small scope still gets
 * four choices), same style first so they are not given away. Null when fewer than two choices exist.
 */
export function question(b: Building, pair: Pair, all: Building[], seed: number): Question | null {
  const [ask, ans] = splitPair(pair);
  const prompt = valueOf(b, ask);
  const answer = valueOf(b, ans);
  if (!prompt || !answer) return null;
  const right = new Set(all.filter((x) => valueOf(x, ask) === prompt).map((x) => valueOf(x, ans)));
  right.add(answer);
  const near: string[] = [];
  const far: string[] = [];
  for (const x of all) {
    const v = valueOf(x, ans);
    if (!v || right.has(v) || near.includes(v) || far.includes(v)) continue;
    (x.era === b.era ? near : far).push(v);
  }
  const wrong = [...shuffle(near, seed), ...shuffle(far, seed + 1)].slice(0, 3);
  if (!wrong.length) return null;
  return { id: b.id, pair, prompt, answer, options: shuffle([answer, ...wrong], seed + 2) };
}

export interface Score {
  right: number;
  total: number;
}

export interface QuizStore {
  /** Results per pair */
  score: Partial<Record<Pair, Score>>;
  /** Missed questions as "buildingId|pair", oldest first */
  wrong: string[];
}

export const EMPTY_QUIZ: QuizStore = { score: {}, wrong: [] };

export function record(s: QuizStore, q: Question, ok: boolean): QuizStore {
  const key = `${q.id}|${q.pair}`;
  const cur = s.score[q.pair] ?? { right: 0, total: 0 };
  const wrong = ok ? s.wrong.filter((w) => w !== key) : [...s.wrong.filter((w) => w !== key), key];
  return { score: { ...s.score, [q.pair]: { right: cur.right + (ok ? 1 : 0), total: cur.total + 1 } }, wrong };
}

export function cleanQuiz(raw: unknown, ids: ReadonlySet<string>): QuizStore {
  const r = (raw ?? {}) as Partial<QuizStore>;
  const score: QuizStore['score'] = {};
  for (const p of PAIRS) {
    const v = r.score?.[p];
    if (v && Number.isFinite(v.right) && Number.isFinite(v.total)) score[p] = { right: v.right, total: v.total };
  }
  const wrong = Array.isArray(r.wrong) ? r.wrong.filter((w): w is string => typeof w === 'string' && ids.has(w.split('|')[0]!) && PAIRS.includes(w.split('|')[1] as Pair)) : [];
  return { score, wrong };
}

/**
 * Cross quiz: one field of a building is shown, the answer is another field, four choices.
 * Wrong choices never include a value that is also right for the prompt (two buildings in Rome,
 * two works by the same architect).
 */
import { ascii, styleName, whoOf, type Building } from './model';
/** Deterministic shuffle (xorshift) so a seed gives the same order */
export function shuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  let s = seed >>> 0 || 1;
  const rnd = () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export type Field = 'name' | 'style' | 'architect' | 'city';
export const FIELDS: Field[] = ['name', 'style', 'architect', 'city'];
export const FIELD_LABEL: Record<Field, string> = { name: 'Building', style: 'Style', architect: 'Architect', city: 'City' };

export type Pair = `${Field}>${Field}`;
export const PAIRS: Pair[] = FIELDS.flatMap((a) => FIELDS.filter((b) => b !== a).map((b) => `${a}>${b}` as Pair));

/** A style heading as a list with slashes: "Renaissance and Mannerism" -> "Renaissance / Mannerism",
 *  "Arts and Crafts, Art Nouveau and Secession" -> "Arts and Crafts / Art Nouveau / Secession" (a name
 *  before a comma keeps its own "and") */
export function slashed(style: string): string {
  const parts = style.split(/,\s*/);
  const last = parts.pop()!;
  return [...parts, ...last.split(/\s+and\s+/)].join(' / ').replace(/\s+and\s+/g, ' & ');
}

export function valueOf(b: Building, f: Field): string {
  if (f === 'name') return b.name.replace(/\s+and\s+/g, ' & ');
  if (f === 'style') return slashed(styleName(b));
  if (f === 'architect') {
    const w = ascii(whoOf(b));
    // a list of people ("A, B and C") becomes "A / B / C"; a firm name ("Shreve, Lamb & Harmon") stays
    return /\sand\s/.test(w) ? slashed(w) : w;
  }
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
  return pool.filter((x) => valueOf(x, a) && valueOf(x, b) && !offStyle(x, pair));
}

/**
 * A building in another style than the one its architect is quizzed under (e.g. Vignola: Mannerism, his
 * Church of the Gesu: Baroque) is not asked in the Architect / Style questions: either answer would mislead.
 */
export function offStyle(b: Building, pair: Pair): boolean {
  const [a, c] = splitPair(pair);
  const as = (a === 'architect' && c === 'style') || (a === 'style' && c === 'architect');
  return as && !!b.whoStyle && valueOf(b, 'style') !== b.whoStyle;
}

/**
 * A question about building `b`. Wrong choices come from `all` (the whole set, so a small scope still gets
 * four choices), same style first so they are not given away. Null when fewer than two choices exist.
 */
export function question(b: Building, pair: Pair, all: Building[], seed: number): Question | null {
  const [ask, ans] = splitPair(pair);
  const prompt = valueOf(b, ask);
  const answer = valueOf(b, ans);
  if (!prompt || !answer || offStyle(b, pair)) return null;
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

/** One finished (or ended early) quiz */
export interface Session {
  /** Time it ended, ms */
  t: number;
  /** Pair, or "mixed" */
  type: string;
  /** Scope label as shown when it ran */
  scope: string;
  /** Questions planned */
  n: number;
  /** Questions answered */
  total: number;
  right: number;
}

export interface QuizStore {
  /** Results per pair */
  score: Partial<Record<Pair, Score>>;
  /** Missed questions as "buildingId|pair", oldest first */
  wrong: string[];
  /** Past quizzes, oldest first */
  history: Session[];
  /** Every answer, oldest first: building, pair, right or wrong, time (ms) */
  log: LogEntry[];
}

export interface LogEntry {
  id: string;
  pair: Pair;
  ok: boolean;
  t: number;
}

export const LOG_MAX = 3000;

export const HISTORY_MAX = 200;
export const EMPTY_QUIZ: QuizStore = { score: {}, wrong: [], history: [], log: [] };

export function record(s: QuizStore, q: Question, ok: boolean, t = Date.now()): QuizStore {
  const key = `${q.id}|${q.pair}`;
  const cur = s.score[q.pair] ?? { right: 0, total: 0 };
  const wrong = ok ? s.wrong.filter((w) => w !== key) : [...s.wrong.filter((w) => w !== key), key];
  const log = [...s.log, { id: q.id, pair: q.pair, ok, t }].slice(-LOG_MAX);
  return { ...s, score: { ...s.score, [q.pair]: { right: cur.right + (ok ? 1 : 0), total: cur.total + 1 } }, wrong, log };
}

export function addSession(s: QuizStore, x: Session): QuizStore {
  if (x.total < 1) return s;
  return { ...s, history: [...s.history, x].slice(-HISTORY_MAX) };
}

export type PairChoice = Pair | 'mixed';

/**
 * The questions of one quiz, drawn up front: `count` different buildings where the pool allows.
 * `missed` entries ("id|pair") are asked with their own pair.
 */
export function buildQuiz(pool: Building[], choice: PairChoice, count: number, all: Building[], seed: number, missed?: string[]): Question[] {
  const out: Question[] = [];
  if (missed) {
    for (const [i, w] of shuffle(missed, seed).entries()) {
      if (out.length >= count) break;
      const [id, p] = w.split('|') as [string, Pair];
      const b = all.find((x) => x.id === id);
      const q = b && question(b, p, all, seed + i);
      if (q) out.push(q);
    }
    return out;
  }
  const used = new Set<string>();
  const order = shuffle(pool, seed);
  let k = 0;
  for (const b of order) {
    if (out.length >= count) break;
    const pairs = choice === 'mixed' ? shuffle(PAIRS, seed + k++) : [choice];
    for (const p of pairs) {
      if (used.has(b.id)) break;
      const q = question(b, p, all, seed + k++);
      if (q) {
        out.push(q);
        used.add(b.id);
      }
    }
  }
  return out;
}

/** How many questions a set-up can give */
export function capacity(pool: Building[], choice: PairChoice): number {
  return choice === 'mixed' ? pool.filter((b) => PAIRS.some((p) => askable([b], p).length)).length : askable(pool, choice).length;
}

export function cleanQuiz(raw: unknown, ids: ReadonlySet<string>): QuizStore {
  const r = (raw ?? {}) as Partial<QuizStore>;
  const score: QuizStore['score'] = {};
  for (const p of PAIRS) {
    const v = r.score?.[p];
    if (v && Number.isFinite(v.right) && Number.isFinite(v.total)) score[p] = { right: v.right, total: v.total };
  }
  const wrong = Array.isArray(r.wrong) ? r.wrong.filter((w): w is string => typeof w === 'string' && ids.has(w.split('|')[0]!) && PAIRS.includes(w.split('|')[1] as Pair)) : [];
  const history = Array.isArray(r.history)
    ? r.history
        .filter((x): x is Session => !!x && Number.isFinite(x.t) && Number.isFinite(x.total) && Number.isFinite(x.right) && x.total > 0 && x.right <= x.total)
        .map((x) => ({ t: x.t, type: String(x.type ?? ''), scope: String(x.scope ?? ''), n: Number.isFinite(x.n) ? x.n : x.total, total: x.total, right: x.right }))
        .slice(-HISTORY_MAX)
    : [];
  const log = Array.isArray(r.log)
    ? r.log
        .filter((x): x is LogEntry => !!x && typeof x.id === 'string' && ids.has(x.id) && PAIRS.includes(x.pair) && typeof x.ok === 'boolean' && Number.isFinite(x.t))
        .map((x) => ({ id: x.id, pair: x.pair, ok: x.ok, t: x.t }))
        .slice(-LOG_MAX)
    : [];
  return { score, wrong, history, log };
}

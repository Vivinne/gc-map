/**
 * Cross quiz: one field of a building is shown, the answer is another field, four choices.
 * Wrong choices never include a value that is also right for the prompt (two buildings in Rome,
 * two works by the same architect).
 */
import { ascii, BUILDINGS as EVERY, styleName, whoOf, type Building } from './model';
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
/** A city has no style, so City and Style are never asked together */
const UNPAIRED = new Set(['city>style', 'style>city']);
export const PAIRS: Pair[] = FIELDS.flatMap((a) => FIELDS.filter((b) => b !== a).map((b) => `${a}>${b}` as Pair)).filter((p) => !UNPAIRED.has(p));

/** Quiz style answers: one short name per style group */
const QUIZ_STYLE: Record<string, string> = {
  'Postwar / Contemporary': 'Modernism',
  'Arts & Crafts / Art Nouveau / Secession': 'Art Nouveau',
  'Baroque / Rococo': 'Baroque',
  'Italian Rationalism / Futurism': 'Italian Rationalism',
  'Early Christian / Byzantine': 'Byzantine',
  'Industrial Revolution / New Materials': 'Modernism',
  Bauhaus: 'Modernism',
  'Neoclassicism / Gothic Revival': 'Neoclassicism',
};

/** Architects whose works are all answered under one style in the quiz */
const ARCHITECT_QUIZ_STYLE: Record<string, string> = {
  'Giuseppe Piermarini': 'Neoclassicism',
};

/** Buildings left out of the quiz */
const QUIZ_SKIP = new Set(['Louvre Pyramid']);

/** Buildings asked without an architect (the name given is a patron, a ruler or "multiple architects") */
const NO_ARCHITECT = new Set([
  'Mediolanum',
  'Arc de Triomphe',
  'Castel del Monte',
  'Arch of Constantine',
  'Basilica of Maxentius and Constantine',
  'Tate Modern',
  'Metropolitan Museum of Art',
  'Space Needle',
  'Quirinal Palace',
]);

/** Whether a building is in the quiz at all */
export function inQuiz(b: Building): boolean {
  return !QUIZ_SKIP.has(b.name);
}

/** The buildings the quiz and the progress counts are about */
export const QUIZ_BUILDINGS: Building[] = EVERY.filter(inQuiz);

/** A style heading as a list with slashes: "Renaissance and Mannerism" -> "Renaissance / Mannerism",
 *  "Arts and Crafts, Art Nouveau and Secession" -> "Arts and Crafts / Art Nouveau / Secession" (a name
 *  before a comma keeps its own "and") */
export function slashed(style: string): string {
  const parts = style.split(/,\s*/);
  const last = parts.pop()!;
  return [...parts, ...last.split(/\s+and\s+/)].join(' / ').replace(/\s+and\s+/g, ' & ');
}

/** A name compared without accents or case ("Pantheon" and "Panthéon" are the same to a reader) */
function plainName(n: string): string {
  return n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}
let SAME_NAME: Set<string> | null = null;
/** Whether another building reads the same: such names are asked with their years, e.g. "Pantheon (AD 118-125)" */
function sharesName(b: Building): boolean {
  if (!SAME_NAME) {
    const n = new Map<string, number>();
    for (const x of EVERY) n.set(plainName(x.name), (n.get(plainName(x.name)) ?? 0) + 1);
    SAME_NAME = new Set([...n].filter(([, c]) => c > 1).map(([k]) => k));
  }
  return SAME_NAME.has(plainName(b.name));
}

export function valueOf(b: Building, f: Field): string {
  if (f === 'name') {
    const n = b.name.replace(/\s+and\s+/g, ' & ');
    return sharesName(b) && b.built ? `${n} (${ascii(b.built)})` : n;
  }
  if (f === 'style') {
    const st = ARCHITECT_QUIZ_STYLE[ascii(whoOf(b))] ?? slashed(styleName(b));
    return QUIZ_STYLE[st] ?? st;
  }
  if (f === 'architect') {
    if (NO_ARCHITECT.has(b.name)) return '';
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
  return pool.filter((x) => inQuiz(x) && valueOf(x, a) && valueOf(x, b) && !offStyle(x, pair));
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
  if (!inQuiz(b) || !prompt || !answer || offStyle(b, pair)) return null;
  all = all.filter(inQuiz);
  const right = new Set(all.filter((x) => valueOf(x, ask) === prompt).map((x) => valueOf(x, ans)));
  right.add(answer);
  const near: string[] = [];
  const far: string[] = [];
  for (const x of all) {
    const v = valueOf(x, ans);
    if (!v || right.has(v) || near.includes(v) || far.includes(v)) continue;
    // a building that reads the same as the one asked about is never a choice beside it
    if (x.id !== b.id && plainName(x.name) === plainName(b.name)) continue;
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
  /** Questions answered (skipped ones are not) */
  total: number;
  right: number;
  /** Questions reached but left unanswered */
  skipped?: number;
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
  /** The local calendar day it was answered on, kept as given so a later change of time zone leaves it */
  d?: string;
}

/** Local calendar day key, e.g. 2026-11-03 */
export function dayKey(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const LOG_MAX = 3000;

export const HISTORY_MAX = 200;
export const EMPTY_QUIZ: QuizStore = { score: {}, wrong: [], history: [], log: [] };

export function record(s: QuizStore, q: Question, ok: boolean, t = Date.now()): QuizStore {
  const key = `${q.id}|${q.pair}`;
  const cur = s.score[q.pair] ?? { right: 0, total: 0 };
  const wrong = ok ? s.wrong.filter((w) => w !== key) : [...s.wrong.filter((w) => w !== key), key];
  const log = [...s.log, { id: q.id, pair: q.pair, ok, t, d: dayKey(t) }].slice(-LOG_MAX);
  return { ...s, score: { ...s.score, [q.pair]: { right: cur.right + (ok ? 1 : 0), total: cur.total + 1 } }, wrong, log };
}

export function addSession(s: QuizStore, x: Session): QuizStore {
  if (x.total + (x.skipped ?? 0) < 1) return s;
  return { ...s, history: [...s.history, x].slice(-HISTORY_MAX) };
}

export type PairChoice = Pair | 'mixed';

/**
 * The questions of one quiz, drawn up front: `count` different buildings where the pool allows.
 * `missed` entries ("id|pair") are asked with their own pair.
 */
/** The pairs a choice stands for: one pair, every pair ("mixed"), or a list picked by the user */
export function pairsOf(choice: PairChoice | Pair[]): Pair[] {
  return Array.isArray(choice) ? choice : choice === 'mixed' ? PAIRS : [choice];
}

/** Every valid pair from the fields shown in the question and the fields asked for */
export function pairsFrom(shown: Field[], asked: Field[]): Pair[] {
  return PAIRS.filter((p) => {
    const [a, b] = splitPair(p);
    return shown.includes(a) && asked.includes(b);
  });
}

export function buildQuiz(pool: Building[], choice: PairChoice | Pair[], count: number, all: Building[], seed: number, missed?: string[], avoid?: ReadonlySet<string>): Question[] {
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
  // buildings of the last set go last, so a new set differs where the pool allows
  const order = avoid?.size ? [...shuffle(pool.filter((b) => !avoid.has(b.id)), seed), ...shuffle(pool.filter((b) => avoid.has(b.id)), seed + 3)] : shuffle(pool, seed);
  let k = 0;
  // several types: each question starts from the next type in turn, so the types are asked about evenly
  const base = shuffle(pairsOf(choice), seed + 7);
  for (const b of order) {
    if (out.length >= count) break;
    const r = out.length % base.length;
    const pairs = [...base.slice(r), ...base.slice(0, r)];
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

/** Quick quiz: five questions from the building to its city, architect and style, in turn */
export const QUICK_PAIRS: Pair[] = ['name>city', 'name>architect', 'name>style'];
export const QUICK_COUNT = 5;

/** The quick quiz: question k asks QUICK_PAIRS[k % 3], each about another building (the last set's go last) */
export function buildQuick(pool: Building[], all: Building[], seed: number, avoid?: ReadonlySet<string>): Question[] {
  const order = avoid?.size ? [...shuffle(pool.filter((b) => !avoid.has(b.id)), seed), ...shuffle(pool.filter((b) => avoid.has(b.id)), seed + 3)] : shuffle(pool, seed);
  const used = new Set<string>();
  const out: Question[] = [];
  let k = 0;
  for (let i = 0; i < QUICK_COUNT; i++) {
    const p = QUICK_PAIRS[i % QUICK_PAIRS.length]!;
    for (const b of order) {
      if (used.has(b.id)) continue;
      const q = question(b, p, all, seed + k++);
      if (q) {
        out.push(q);
        used.add(b.id);
        break;
      }
    }
  }
  return out;
}

/** A question as a sentence around its prompt: the prompt itself is shown apart (bold) */
export function questionText(pair: Pair): [string, string] {
  switch (pair) {
    case 'name>city':
      return ['Which city is ', ' in?'];
    case 'name>architect':
      return ['Who designed ', '?'];
    case 'name>style':
      return ['What is the style of ', '?'];
    case 'city>name':
      return ['Which of these buildings is in ', '?'];
    case 'architect>name':
      return ['Which of these buildings did ', ' design?'];
    case 'style>name':
      return ['Which of these buildings is ', '?'];
    case 'architect>city':
      return ['Which city has a building by ', '?'];
    case 'city>architect':
      return ['Which architect has a building in ', '?'];
    case 'architect>style':
      return ['Which style did ', ' work in?'];
    case 'style>architect':
      return ['Which architect worked in ', '?'];
    default:
      return ['', ''];
  }
}

/** How many questions a set-up can give */
export function capacity(pool: Building[], choice: PairChoice | Pair[]): number {
  const list = pairsOf(choice);
  return pool.filter((b) => list.some((p) => askable([b], p).length)).length;
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
        .filter((x): x is Session => !!x && Number.isFinite(x.t) && Number.isFinite(x.total) && Number.isFinite(x.right) && x.total >= 0 && x.right <= x.total && (x.total > 0 || (Number.isFinite(x.skipped) && x.skipped! > 0)))
        .map((x) => ({ t: x.t, type: String(x.type ?? ''), scope: String(x.scope ?? ''), n: Number.isFinite(x.n) ? x.n : x.total, total: x.total, right: x.right, ...(Number.isFinite(x.skipped) && x.skipped! > 0 ? { skipped: x.skipped } : {}) }))
        .slice(-HISTORY_MAX)
    : [];
  const log = Array.isArray(r.log)
    ? r.log
        .filter((x): x is LogEntry => !!x && typeof x.id === 'string' && ids.has(x.id) && PAIRS.includes(x.pair) && typeof x.ok === 'boolean' && Number.isFinite(x.t))
        // answers kept before the day was stored get it from their time once, here, and keep it from then on
        .map((x) => ({ id: x.id, pair: x.pair, ok: x.ok, t: x.t, d: typeof x.d === 'string' && /^\d{4}-\d\d-\d\d$/.test(x.d) ? x.d : dayKey(x.t) }))
        .slice(-LOG_MAX)
    : [];
  return { score, wrong, history, log };
}

/**
 * Personal statistics from the answer log (the raw answers are kept; everything here is worked out from
 * them each time, so a rule can change and the numbers follow without touching the record).
 *
 * Mastery is kept per building and fact (its city, architect, style). Each question type says which fact
 * of which building it tests (PAIR_FACT): the building the question was made from, i.e. the one asked
 * about or the right option. The four types between an architect and a city or a style test no single
 * building and count for the quiz score only. A wrong pick never marks the building that was picked.
 */
import { type Building } from './model';
import { QUIZ_BUILDINGS as BUILDINGS, dayKey, valueOf, type LogEntry, type Pair } from './quiz';

export type Fact = 'city' | 'architect' | 'style';
export const FACTS: Fact[] = ['city', 'architect', 'style'];

/** The fact of one building each question type tests; null = no single building */
export const PAIR_FACT: Partial<Record<Pair, Fact | null>> = {
  'name>city': 'city',
  'city>name': 'city',
  'name>architect': 'architect',
  'architect>name': 'architect',
  'name>style': 'style',
  'style>name': 'style',
  'architect>city': null,
  'city>architect': null,
  'architect>style': null,
  'style>architect': null,
};

export type Status = 'weak' | 'learning' | 'mastered' | 'untested';
export const STATUSES: Status[] = ['weak', 'learning', 'mastered', 'untested'];
export const STATUS_LABEL: Record<Status, string> = { weak: 'Needs work', learning: 'Learning', mastered: 'Mastered', untested: 'Not tested' };
/** How each state is reached, as shown next to it */
export const STATUS_RULE: Record<Status, string> = {
  weak: 'The last answer on one of its facts was wrong',
  learning: 'Answered, nothing to fix, not every fact mastered yet',
  mastered: 'City, architect and style each right on 2 different days since the last mistake',
  untested: 'Never asked',
};

/** The day an answer was given: stored with it (the day where it was answered), else from its time */
export function dayOf(e: LogEntry): string {
  return e.d ?? dayKey(e.t);
}

/** The facts of a building that can be asked (it has the value): only these decide whether it is mastered */
export function factsOf(b: Building): Fact[] {
  return FACTS.filter((f) => !!valueOf(b, f) && !!valueOf(b, 'name'));
}

/** Answers per building and fact ("id|fact"), newest first; answers that test no single building are left out */
export function byFact(log: LogEntry[]): Map<string, LogEntry[]> {
  const m = new Map<string, LogEntry[]>();
  for (let i = log.length - 1; i >= 0; i--) {
    const e = log[i]!;
    const f = PAIR_FACT[e.pair] ?? null;
    if (!f) continue;
    const k = `${e.id}|${f}`;
    const a = m.get(k);
    if (a) a.push(e);
    else m.set(k, [e]);
  }
  return m;
}

/**
 * One fact: not tested, wrong (its last answer wrong), mastered (right on at least 2 different days since
 * its last wrong answer), else learning
 */
export function factStatus(answers: LogEntry[] | undefined): Status {
  if (!answers?.length) return 'untested';
  if (!answers[0]!.ok) return 'weak';
  const days = new Set<string>();
  for (const a of answers) {
    if (!a.ok) break;
    days.add(dayOf(a));
    if (days.size >= 2) return 'mastered';
  }
  return 'learning';
}

/**
 * A building from its facts: not tested (none asked), needs work (a fact whose last answer is wrong),
 * mastered (every fact it has mastered), else learning
 */
export function statusOf(b: Building, by: Map<string, LogEntry[]>): Status {
  const st = factsOf(b).map((f) => factStatus(by.get(`${b.id}|${f}`)));
  if (!st.length || st.every((s) => s === 'untested')) return 'untested';
  if (st.includes('weak')) return 'weak';
  if (st.every((s) => s === 'mastered')) return 'mastered';
  return 'learning';
}

export type Counts = Record<Status, number>;

export function countStatus(list: Building[], by: Map<string, LogEntry[]>): Counts {
  const c: Counts = { weak: 0, learning: 0, mastered: 0, untested: 0 };
  for (const b of list) c[statusOf(b, by)]++;
  return c;
}

/** The buildings in each state, by name */
export function groupStatus(log: LogEntry[], list: Building[] = BUILDINGS): Record<Status, Building[]> {
  const by = byFact(log);
  const g: Record<Status, Building[]> = { weak: [], learning: [], mastered: [], untested: [] };
  for (const b of list) g[statusOf(b, by)].push(b);
  for (const k of STATUSES) g[k].sort((a, b) => a.name.localeCompare(b.name));
  return g;
}

/** Right answers over answers in the last `ms` (every question type; skipped questions are not answers) */
export function recent(log: LogEntry[], now: number, ms: number): { right: number; total: number } {
  let right = 0;
  let total = 0;
  for (const e of log)
    if (now - e.t <= ms) {
      total++;
      if (e.ok) right++;
    }
  return { right, total };
}

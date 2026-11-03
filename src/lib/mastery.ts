/**
 * Personal statistics from the answer log: mastery per building, groups for the Me page,
 * correct share per day, buildings to practise next.
 */
import { BUILDINGS, type Building } from './model';
import { splitPair, type LogEntry, type Pair } from './quiz';

export type Status = 'mastered' | 'learning' | 'weak' | 'untested';
export const STATUSES: Status[] = ['mastered', 'learning', 'weak', 'untested'];
export const STATUS_LABEL: Record<Status, string> = { mastered: 'Mastered', learning: 'Learning', weak: 'Weak', untested: 'Not tested' };

/** Answers per building, newest first */
export function byBuilding(log: LogEntry[]): Map<string, LogEntry[]> {
  const m = new Map<string, LogEntry[]>();
  for (let i = log.length - 1; i >= 0; i--) {
    const e = log[i]!;
    const a = m.get(e.id);
    if (a) a.push(e);
    else m.set(e.id, [e]);
  }
  return m;
}

/** Mastered = the last two answers right; weak = the last answer wrong; learning = otherwise answered */
export function statusOf(answers: LogEntry[] | undefined): Status {
  if (!answers?.length) return 'untested';
  if (!answers[0]!.ok) return 'weak';
  return answers.length >= 2 && answers[1]!.ok ? 'mastered' : 'learning';
}

export type Counts = Record<Status, number>;

export function countStatus(list: Building[], by: Map<string, LogEntry[]>): Counts {
  const c: Counts = { mastered: 0, learning: 0, weak: 0, untested: 0 };
  for (const b of list) c[statusOf(by.get(b.id))]++;
  return c;
}

/** Local calendar day key, e.g. 2026-11-03 */
export function dayKey(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Share right per day for the last `days` days that have answers */
export function perDay(log: LogEntry[], days = 14): { day: string; right: number; total: number }[] {
  const m = new Map<string, { right: number; total: number }>();
  for (const e of log) {
    const k = dayKey(e.t);
    const c = m.get(k) ?? { right: 0, total: 0 };
    m.set(k, { right: c.right + (e.ok ? 1 : 0), total: c.total + 1 });
  }
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-days).map(([day, c]) => ({ day, ...c }));
}

export function recent(log: LogEntry[], now: number, ms: number): { right: number; total: number } {
  let right = 0;
  let total = 0;
  for (const e of log) if (now - e.t <= ms) {
    total++;
    if (e.ok) right++;
  }
  return { right, total };
}

/** Buildings whose last answer is wrong, most misses first; with the field asked when it was last missed */
export function practiseNext(log: LogEntry[], n = 6): { b: Building; pair: Pair; misses: number }[] {
  const by = byBuilding(log);
  const out: { b: Building; pair: Pair; misses: number; t: number }[] = [];
  for (const b of BUILDINGS) {
    const a = by.get(b.id);
    if (statusOf(a) !== 'weak') continue;
    out.push({ b, pair: a![0]!.pair, misses: a!.filter((e) => !e.ok).length, t: a![0]!.t });
  }
  return out.sort((x, y) => y.misses - x.misses || y.t - x.t).slice(0, n);
}

/** Right / total per pair from the log */
export function perPair(log: LogEntry[]): Map<Pair, { right: number; total: number }> {
  const m = new Map<Pair, { right: number; total: number }>();
  for (const e of log) {
    const c = m.get(e.pair) ?? { right: 0, total: 0 };
    m.set(e.pair, { right: c.right + (e.ok ? 1 : 0), total: c.total + 1 });
  }
  return m;
}

export function askedField(p: Pair): string {
  return splitPair(p)[1];
}

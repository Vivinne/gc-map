import { EMPTY, type Filters } from './filter';
import { COUNTRIES, ERA_ORDER } from './model';
import type { EraId } from './types';

export type Mode = 'map' | 'quiz' | 'me';

export interface UrlState {
  mode: Mode;
  /** Selected building id */
  b: string;
  /** City in focus */
  city: string;
  filters: Filters;
}

export const DEFAULT_STATE: UrlState = { mode: 'map', b: '', city: '', filters: EMPTY };

/** URL hash: m=me&b=pantheon-rome&c=Rome&s=ancient,modern&k=Italy&e=1&y=2016&r=1850~2026&q=corb&w=Le%20Corbusier&st=1 */
export function formatHash(s: UrlState): string {
  const p = new URLSearchParams();
  if (s.mode !== 'map') p.set('m', s.mode);
  if (s.b) p.set('b', s.b);
  if (s.city) p.set('c', s.city);
  const f = s.filters;
  if (f.styles.length) p.set('s', f.styles.join(','));
  if (f.countries.length) p.set('k', f.countries.join(','));
  if (f.exam) p.set('e', '1');
  if (f.examYears.length) p.set('y', f.examYears.join(','));
  if (f.starred) p.set('st', '1');
  if (f.range) p.set('r', `${f.range[0]}~${f.range[1]}`);
  if (f.q) p.set('q', f.q);
  if (f.who) p.set('w', f.who);
  const out = p.toString();
  return out ? `#${out}` : '';
}

export function parseHash(hash: string): UrlState {
  const p = new URLSearchParams(hash.replace(/^#/, ''));
  const list = (k: string) => (p.get(k) ?? '').split(',').filter(Boolean);
  const m = p.get('m');
  const mode: Mode = m === 'me' || m === 'quiz' ? m : 'map';
  const r = (p.get('r') ?? '').match(/^(-?\d+)~(-?\d+)$/);
  const filters: Filters = {
    styles: list('s').filter((x): x is EraId => (ERA_ORDER as string[]).includes(x)),
    countries: list('k').filter((x) => (COUNTRIES as readonly string[]).includes(x)),
    exam: p.get('e') === '1',
    examYears: list('y').map(Number).filter((y) => y >= 2007 && y <= 2019),
    starred: p.get('st') === '1',
    range: r ? [Number(r[1]), Number(r[2])] : null,
    q: p.get('q') ?? '',
    who: p.get('w') ?? '',
    col: null,
  };
  return { mode, b: p.get('b') ?? '', city: p.get('c') ?? '', filters };
}

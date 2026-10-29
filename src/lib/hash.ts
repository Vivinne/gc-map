import type { EraId } from './types';

export interface UrlState {
  /** Selected building id */
  p: string;
  e: EraId[];
  q: string;
  /** Show located entries only */
  loc: boolean;
}

const ERA_IDS: readonly EraId[] = ['ancient', 'medieval', 'renbar', 'c19', 'modern'];

export function parseHash(hash: string): UrlState {
  const sp = new URLSearchParams(hash.replace(/^#/, ''));
  const e = (sp.get('e') ?? '')
    .split(',')
    .filter((x): x is EraId => (ERA_IDS as readonly string[]).includes(x));
  return { p: sp.get('p') ?? '', e, q: sp.get('q') ?? '', loc: sp.get('loc') === '1' };
}

export function formatHash(s: UrlState): string {
  const sp = new URLSearchParams();
  if (s.p) sp.set('p', s.p);
  if (s.e.length) sp.set('e', s.e.join(','));
  if (s.q) sp.set('q', s.q);
  if (s.loc) sp.set('loc', '1');
  const out = sp.toString();
  return out ? `#${out}` : '';
}

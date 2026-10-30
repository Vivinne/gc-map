export interface UrlState {
  /** Selected building id */
  p: string;
  /** Checked tag ids (y:2016, c:Italy, s:ancient) */
  t: string[];
  q: string;
}

const TAG_RE = /^(y:\d{4}|c:[A-Za-z ]+|s:[a-z0-9]+)$/;

export function parseHash(hash: string): UrlState {
  const sp = new URLSearchParams(hash.replace(/^#/, ''));
  const t = (sp.get('t') ?? '').split(',').filter((x) => TAG_RE.test(x));
  return { p: sp.get('p') ?? '', t, q: sp.get('q') ?? '' };
}

export function formatHash(s: UrlState): string {
  const sp = new URLSearchParams();
  if (s.p) sp.set('p', s.p);
  if (s.t.length) sp.set('t', s.t.join(','));
  if (s.q) sp.set('q', s.q);
  const out = sp.toString();
  return out ? `#${out}` : '';
}

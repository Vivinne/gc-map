import { BY_ID } from './model';

/** Which list is open (a building card, when open, sits over it and the list is folded away) */
export type ListKind = '' | 'preview' | 'category' | 'results' | 'group';

/** One screen state: what the history behind ＜ holds, and what the address names */
export interface Screen {
  /** Submitted search text ('' = none) */
  q: string;
  list: ListKind;
  /** Number point list: the buildings of the point */
  group: string[];
  /** Open building card ('' = none) */
  b: string;
  /** Map view when the next screen opened: ＜ brings the map back to it */
  view?: View;
}

export const EMPTY_SCREEN: Screen = { q: '', list: '', group: [], b: '' };

export const isEmptyScreen = (s: Screen): boolean => !s.q && !s.list && !s.b;

/** Map view: centre and zoom */
export interface View {
  lng: number;
  lat: number;
  zoom: number;
}

const round = (n: number, d: number) => Number(n.toFixed(d));

/**
 * Address of a screen (query string, so a link opens the same screen):
 * q = submitted search, p = open list that is not a result (search preview, category), g = number point
 * buildings (ids joined by "~"), b = building card, m = map view (lng,lat,zoom).
 * "v" is left alone: the page uses it to load a fresh copy after a deploy.
 */
export function toQuery(s: Screen, v: View | null): string {
  const p = new URLSearchParams();
  if (s.q) p.set('q', s.q);
  if (s.list === 'preview') p.set('p', 'search');
  if (s.list === 'category') p.set('p', 'category');
  if (s.list === 'group' && s.group.length) p.set('g', s.group.join('~'));
  if (s.b) p.set('b', s.b);
  if (v) p.set('m', `${round(v.lng, 4)},${round(v.lat, 4)},${round(v.zoom, 2)}`);
  const out = p.toString().replace(/%2C/g, ',').replace(/%7E/g, '~');
  return out ? `?${out}` : '';
}

/** Screen and map view named by an address; unknown buildings are dropped */
export function fromQuery(search: string): { screen: Screen; view: View | null } {
  const p = new URLSearchParams(search);
  const q = (p.get('q') ?? '').trim();
  const group = (p.get('g') ?? '').split('~').filter((id) => BY_ID.has(id));
  const b = BY_ID.has(p.get('b') ?? '') ? p.get('b')! : '';
  const pl = p.get('p');
  let list: ListKind = '';
  if (pl === 'search') list = 'preview';
  else if (pl === 'category') list = 'category';
  else if (group.length) list = 'group';
  else if (q) list = 'results';
  const m = (p.get('m') ?? '').split(',').map(Number);
  const view = m.length === 3 && m.every((n) => Number.isFinite(n)) ? { lng: m[0]!, lat: m[1]!, zoom: m[2]! } : null;
  return { screen: { q, list, group: list === 'group' ? group : [], b }, view };
}

export const sameScreen = (a: Screen, b: Screen): boolean => a.q === b.q && a.list === b.list && a.b === b.b && a.group.join('~') === b.group.join('~');

const STACK_KEY = 'gc-map:history';

/** The history behind ＜, kept for this tab so a reload restores it */
export function loadStack(): Screen[] | null {
  try {
    const raw = sessionStorage.getItem(STACK_KEY);
    const list = raw ? (JSON.parse(raw) as Screen[]) : null;
    return Array.isArray(list) && list.length ? list : null;
  } catch {
    return null;
  }
}

export function saveStack(stack: Screen[]): void {
  try {
    sessionStorage.setItem(STACK_KEY, JSON.stringify(stack.slice(-50)));
  } catch {
    /* storage blocked: the history lives in memory only */
  }
}

/**
 * Stack to start from: the saved one when its top is the screen the address names (a reload),
 * else the address alone (a shared link: no history, ＜ hidden).
 */
export function startStack(fromAddress: Screen): Screen[] {
  const saved = loadStack();
  if (saved && sameScreen(saved[saved.length - 1]!, fromAddress)) return saved;
  return isEmptyScreen(fromAddress) ? [EMPTY_SCREEN] : [fromAddress];
}

/**
 * Whether ＜ shows: there is an earlier screen. A card opened straight from the plain map has nothing
 * to go back to but the plain map, so it shows only ×.
 */
export function canGoBack(stack: Screen[]): boolean {
  if (stack.length < 2) return false;
  const top = stack[stack.length - 1]!;
  const prev = stack[stack.length - 2]!;
  return !(top.b && isEmptyScreen(prev));
}

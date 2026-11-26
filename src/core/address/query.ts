/* C2 address: the screen and map view written in the query string, so a link opens the same screen (SPEC §11). */
import { BY_ID } from '../../data';
import type { ListKind, Screen, View } from '../history';

/** Farthest latitude the web map draws */
const MAX_LAT = 85.0511;

const round = (n: number, d: number) => Number(n.toFixed(d));

/**
 * Address of a screen (query string, so a link opens the same screen):
 * q = submitted search (or the picked Category tag), p = open list that is not a result (search preview, category, era = a picked Category tag), g = number point
 * buildings (ids joined by "~"), b = building card, m = map view (lng,lat,zoom).
 * "v" is left alone: the page uses it to load a fresh copy after a deploy.
 */
export function toQuery(s: Screen, v: View | null): string {
  const p = new URLSearchParams();
  if (s.q) p.set('q', s.q);
  if (s.list === 'preview') p.set('p', 'search');
  if (s.list === 'category') p.set('p', 'category');
  if (s.list === 'era') p.set('p', 'era');
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
  else if (pl === 'era' && q) list = 'era';
  else if (group.length) list = 'group';
  else if (q) list = 'results';
  // a map view the map can show: three numbers, latitude inside the map (±85°), longitude ±180°, zoom 0–24;
  // anything else is ignored and the map opens on its usual view (B3)
  const raw = (p.get('m') ?? '').split(',');
  const m = raw.map((t) => (t.trim() === '' ? NaN : Number(t)));
  const ok = m.length === 3 && m.every((n) => Number.isFinite(n)) && Math.abs(m[0]!) <= 180 && Math.abs(m[1]!) <= MAX_LAT && m[2]! >= 0 && m[2]! <= 24;
  const view = ok ? { lng: m[0]!, lat: m[1]!, zoom: m[2]! } : null;
  return { screen: { q, list, group: list === 'group' ? group : [], b }, view };
}


export type Bounds = [[number, number], [number, number]];

export function boundsOf(list: { lng: number; lat: number }[]): Bounds | null {
  if (!list.length) return null;
  let w = 180, s = 90, e = -180, n = -90;
  for (const p of list) {
    w = Math.min(w, p.lng); e = Math.max(e, p.lng);
    s = Math.min(s, p.lat); n = Math.max(n, p.lat);
  }
  return [[w, s], [e, n]];
}

/**
 * Middle of a box as the map draws it: halfway across, and halfway up on the (Mercator) map, which lies
 * north of the middle latitude. Framing on the middle latitude put the northern buildings of a spread
 * search (Finland with France and Italy) under the search box on short maps (N21).
 */
export function boundsCenter(b: Bounds): [number, number] {
  const y = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  const mid = (y(b[0][1]) + y(b[1][1])) / 2;
  return [(b[0][0] + b[1][0]) / 2, (360 / Math.PI) * Math.atan(Math.exp(mid)) - 90];
}

/** Radius of a number point by its count */
export function pointRadius(n: number): number {
  return n >= 15 ? 19 : n >= 7 ? 16 : 13.5;
}

/** Marker radius of a single building */
export const DOT_R = 7;

export interface Placed<T> {
  item: T;
  x: number;
  y: number;
}

export interface Group<T> {
  items: T[];
  x: number;
  y: number;
}

/**
 * Markers that would overlap on screen merge into one group, until no two groups overlap.
 * Works on screen positions only, so a pan keeps the same groups and a zoom regroups them.
 * `size(n)` is the radius drawn for a group of n.
 */
export function groupOnScreen<T>(points: Placed<T>[], size: (n: number) => number, gap = 2): Group<T>[] {
  let groups: Group<T>[] = points.map((p) => ({ items: [p.item], x: p.x, y: p.y }));
  for (let pass = 0; pass < 20; pass++) {
    let merged = false;
    const out: Group<T>[] = [];
    for (const g of groups) {
      const hit = out.find((o) => Math.hypot(o.x - g.x, o.y - g.y) < size(o.items.length) + size(g.items.length) + gap);
      if (!hit) {
        out.push({ ...g, items: [...g.items] });
        continue;
      }
      const n = hit.items.length + g.items.length;
      hit.x = (hit.x * hit.items.length + g.x * g.items.length) / n;
      hit.y = (hit.y * hit.items.length + g.y * g.items.length) / n;
      hit.items.push(...g.items);
      merged = true;
    }
    groups = out;
    if (!merged) break;
  }
  return groups;
}

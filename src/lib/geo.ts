import type { Building } from './model';

export type LngLat = [number, number];

export function distance(a: LngLat, b: LngLat): number {
  const R = 6371000;
  const r = Math.PI / 180;
  const dLat = (b[1] - a[1]) * r;
  const dLng = (b[0] - a[0]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.max(10, Math.round(m / 10) * 10)} m`;
  if (m < 100000) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.round(m / 1000)} km`;
}

export function nearest(target: Building, list: Building[], n: number): { b: Building; d: number }[] {
  return list
    .filter((b) => b.id !== target.id)
    .map((b) => ({ b, d: distance([target.lng, target.lat], [b.lng, b.lat]) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, n);
}

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

/** Web-mercator world pixel coordinates at zoom z (512 px tiles, as MapLibre) */
export function worldPx(lng: number, lat: number, z: number): [number, number] {
  const size = 512 * 2 ** z;
  const x = ((lng + 180) / 360) * size;
  const s = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * size;
  return [x, y];
}

export interface Cluster {
  key: string;
  items: Building[];
  /** Dominant city (most buildings) */
  name: string;
  cities: Map<string, number>;
  lng: number;
  lat: number;
}

export function donutRadius(n: number): number {
  return n >= 15 ? 19 : n >= 7 ? 16 : 13.5;
}
const DOT_R = 6;
/** Below this many buildings a group is drawn as single dots */
export const MIN_DONUT = 3;

/**
 * Screen-space grouping at zoom z: buildings of one city are seeded together (largest city first),
 * then any two groups whose circles would overlap are merged until none do.
 */
export function clusterAt(list: Building[], z: number): Cluster[] {
  const byCity = new Map<string, Building[]>();
  for (const b of list) {
    const arr = byCity.get(b.city);
    if (arr) arr.push(b);
    else byCity.set(b.city, [b]);
  }
  type C = { items: Building[]; x: number; y: number; cities: Map<string, number> };
  const cl: C[] = [];
  const order = [...byCity.entries()].sort((a, b) => b[1].length - a[1].length);
  for (const [city, items] of order) {
    for (const b of items) {
      const [x, y] = worldPx(b.lng, b.lat, z);
      let c = cl.find((k) => Math.hypot(k.x - x, k.y - y) < 22);
      if (!c) {
        c = { items: [], x, y, cities: new Map() };
        cl.push(c);
      }
      c.items.push(b);
      c.cities.set(city, (c.cities.get(city) ?? 0) + 1);
    }
  }
  const r = (n: number) => (n >= MIN_DONUT ? donutRadius(n) : DOT_R);
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < cl.length; i++) {
      for (let j = i + 1; j < cl.length; j++) {
        const a = cl[i]!;
        const b = cl[j]!;
        if (a.items.length < MIN_DONUT && b.items.length < MIN_DONUT) continue;
        if (Math.hypot(a.x - b.x, a.y - b.y) < r(a.items.length) + r(b.items.length) + 3) {
          const big = a.items.length >= b.items.length ? a : b;
          const small = big === a ? b : a;
          big.items.push(...small.items);
          for (const [k, v] of small.cities) big.cities.set(k, (big.cities.get(k) ?? 0) + v);
          cl.splice(cl.indexOf(small), 1);
          merged = true;
          break outer;
        }
      }
    }
  }
  return cl.map((c) => {
    const name = [...c.cities.entries()].sort((a, b) => b[1] - a[1])[0]![0];
    // Circle sits on the dominant city's own centre so it does not drift as cities merge in
    const own = c.items.filter((b) => b.city === name);
    const lng = own.reduce((s, b) => s + b.lng, 0) / own.length;
    const lat = own.reduce((s, b) => s + b.lat, 0) / own.length;
    // Key from the member ids: two groups of one city can coexist, so the city name alone is not unique
    return { key: c.items.map((b) => b.id).sort().join('|'), items: c.items, name, cities: c.cities, lng, lat };
  });
}

/** Groups of buildings at the same coordinate (rounded to about 10 m) */
export function stacks(list: Building[]): { lng: number; lat: number; items: Building[] }[] {
  const m = new Map<string, Building[]>();
  for (const b of list) {
    const k = `${b.lng.toFixed(4)},${b.lat.toFixed(4)}`;
    const arr = m.get(k);
    if (arr) arr.push(b);
    else m.set(k, [b]);
  }
  return [...m.values()].map((items) => ({ lng: items[0]!.lng, lat: items[0]!.lat, items }));
}

/** Region name for buildings outside the view: the country tag, with "Others" split by area */
export function regionOf(b: Building): string {
  if (b.country !== 'Others') return b.country;
  if (b.nation) return b.nation;
  if (b.lng < -25) return 'Americas';
  if (b.lng > 35 || b.lat < 30) return 'Asia and Middle East';
  return 'Elsewhere in Europe';
}

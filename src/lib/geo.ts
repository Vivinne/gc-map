import type { Era, EraId, Place } from './types';

export interface PointFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: { pid: string; id: string; name: string; sub: string; color: string; era: EraId; est: boolean };
}

export interface PointCollection {
  type: 'FeatureCollection';
  features: PointFeature[];
}

export function toFeatureCollection(places: readonly Place[], eras: readonly Era[]): PointCollection {
  const color = new Map(eras.map((e) => [e.id, e.color]));
  const features: PointFeature[] = [];
  for (const p of places) {
    for (const pt of p.points) {
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [pt.lng, pt.lat] },
        properties: { pid: p.id, id: pt.id, name: p.name, sub: pt.sub, color: color.get(p.era) ?? '#111827', era: p.era, est: pt.precision === 'estimate' },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}

/** Default view when no filter is applied (Spain to Istanbul, UK to Sicily) */
export const HOME_BOUNDS: [[number, number], [number, number]] = [[-8, 36], [29.5, 55]];

/** Full map on a phone: top = half of the Scandinavian peninsula, bottom = Algeria, left = Spain and a little open sea, right = the middle of Ukraine; Europe stays centred */
export const PHONE_FULL_BOUNDS: [[number, number], [number, number]] = [[-12, 30], [32, 63]];

/** The map never shows the polar regions: latitude is limited to the polar circles */
export const POLAR_LAT = 66.5;

/** Desktop Full map: metres per pixel at which the scale bar (max 120 px) reads 500 km (a 500 km bar spans 104 px) */
export const FULL_MAP_MPP = 4800;
/** Desktop Full map is centred on Switzerland (lng, lat) */
export const FULL_MAP_CENTER: [number, number] = [8.2, 46.8];
/** Metres per CSS pixel at which the scale bar (100 px wide at most) reads exactly 1 km */
export const SCALE_1KM_MPP = 9.8;

/** Zoom level (512 px tiles) that shows `mpp` metres per CSS pixel at the given latitude */
export function zoomForMetersPerPixel(lat: number, mpp: number): number {
  return Math.log2((78271.517 * Math.cos((lat * Math.PI) / 180)) / mpp);
}

/**
 * Centre of the most crowded group of points: for every point the points within `radiusM` metres are counted; the point with the most neighbours wins
 * (ties: the tighter group), and the centre is the mean of that group. null when there are no points.
 */
export function densestCenter(pts: readonly { lng: number; lat: number }[], radiusM = 500): { lng: number; lat: number } | null {
  if (!pts.length) return null;
  const R = 6371008.8;
  const dist = (a: { lng: number; lat: number }, b: { lng: number; lat: number }) => {
    const x = ((b.lng - a.lng) * Math.PI) / 180 * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
    const y = ((b.lat - a.lat) * Math.PI) / 180;
    return Math.hypot(x, y) * R;
  };
  let best: { lng: number; lat: number }[] = [];
  let bestSum = Infinity;
  for (const p of pts) {
    const near = pts.filter((q) => dist(p, q) <= radiusM);
    const sum = near.reduce((n, q) => n + dist(p, q), 0);
    if (near.length > best.length || (near.length === best.length && sum < bestSum)) {
      best = near;
      bestSum = sum;
    }
  }
  return { lng: best.reduce((n, q) => n + q.lng, 0) / best.length, lat: best.reduce((n, q) => n + q.lat, 0) / best.length };
}

/** [[west, south], [east, north]]; returns null when there are no points */
export function boundsOf(places: readonly Place[]): [[number, number], [number, number]] | null {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const p of places) {
    for (const pt of p.points) {
      w = Math.min(w, pt.lng);
      e = Math.max(e, pt.lng);
      s = Math.min(s, pt.lat);
      n = Math.max(n, pt.lat);
    }
  }
  return Number.isFinite(w) ? [[w, s], [e, n]] : null;
}

/** Fixed width of the Back view for a building whose country tag is "Others" (no single country to fit), in metres */
export const OTHERS_VIEW_M = 1_000_000;

/** Bounds of every building tagged with one country; null for "Others" or an unknown tag (it is a mixed group) */
export function countryBounds(places: readonly Place[], country: string): [[number, number], [number, number]] | null {
  if (!country || country === 'Others') return null;
  return boundsOf(places.filter((p) => p.country === country));
}

/** The building (and the point) closest to a position; null when no building has a coordinate */
export function nearestPlace(places: readonly Place[], lng: number, lat: number): { place: Place; lng: number; lat: number } | null {
  let best: { place: Place; lng: number; lat: number } | null = null;
  let bd = Infinity;
  for (const p of places) {
    for (const pt of p.points) {
      const d = distanceM({ lng, lat }, { lng: pt.lng, lat: pt.lat });
      if (d < bd) { bd = d; best = { place: p, lng: pt.lng, lat: pt.lat }; }
    }
  }
  return best;
}

/** Points at the same location (rounded to 4 decimals, about 10 m) stack together */
export function coordKey(lng: number, lat: number): string {
  return `${lng.toFixed(4)},${lat.toFixed(4)}`;
}

export type LngLatBounds = [[number, number], [number, number]];

/** [[west, south], [east, north]] of a coordinate list; null when empty */
export function boundsOfCoords(coords: readonly (readonly [number, number])[]): LngLatBounds | null {
  if (!coords.length) return null;
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const [lng, lat] of coords) {
    w = Math.min(w, lng);
    e = Math.max(e, lng);
    s = Math.min(s, lat);
    n = Math.max(n, lat);
  }
  return [[w, s], [e, n]];
}

/** About 1 m: a box this small cannot be separated by zooming, so one of the buildings at that spot is shown */
export const SAME_SPOT_DEG = 1e-5;
export const SAME_SPOT_ZOOM = 18;

export function isSameSpot(b: LngLatBounds): boolean {
  return b[1][0] - b[0][0] < SAME_SPOT_DEG && b[1][1] - b[0][1] < SAME_SPOT_DEG;
}

/** Below this zoom each city is one numbered circle; from here up every marker is drawn on its own */
export const CITY_TOP_ZOOM = 10.5;
/** A place whose own markers span more than this (degrees) is a region (the Veneto villas): it gets no city circle of its own; each of its markers joins the nearest city circle's union bounds (count unchanged) */
export const WIDE_SPAN_DEG = 0.25;
/** After a city click the zoom ends this far above the switch zoom, so the markers are already drawn one by one */
export const CITY_ZOOM_MARGIN = 0.5;

export function isWidePlace(p: Place): boolean {
  const b = boundsOf([p]);
  return !!b && Math.max(b[1][0] - b[0][0], b[1][1] - b[0][1]) > WIDE_SPAN_DEG;
}

export function cityClickZoom(fitZoom: number): number {
  return Math.max(fitZoom, CITY_TOP_ZOOM + CITY_ZOOM_MARGIN);
}

/**
 * City of a building: the handout location with any bracketed detail removed ("Rome（Piazza Navona）" -> "Rome",
 * "Madrid (Spain)" -> "Madrid"); rows with no handout location use the supplementary location of their coordinate note.
 */
export function cityOf(p: Place): string {
  let raw = p.loc;
  if (!raw) {
    const m = /^Supplementary location: ([^;]+)/.exec(p.points[0]?.note ?? '');
    raw = m?.[1] ?? '';
  }
  return raw.replace(/[（(].*?[）)]/g, '').replace(/附近/g, '').trim();
}

/** Below this zoom (the phone's Full map) the circles are regions, not cities: Italy north / centre / south, France, the United Kingdom ... each get one number */
export const REGION_TOP_ZOOM = 3;

export interface RegionFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: { region: string; n: number; w: number; s: number; e: number; nn: number; pids: string };
}
export interface RegionCollection {
  type: 'FeatureCollection';
  features: RegionFeature[];
  /** Buildings far from the middle of their region: not counted in it, drawn as small coloured dots on the Full map instead */
  outliers: string[];
}

/** A building farther than this (m) from the mean position of the rest of its region is drawn as its own dot */
export const REGION_FAR_M = 300_000;

/** Region of a building: Italy is split by latitude, France / UK / Germany / US by country tag; the rest (tag Others) is grouped by distance in toRegionCollection */
export function regionKey(p: Place): string {
  const lat = p.points[0]?.lat ?? 0;
  if (p.country === 'Italy') return lat >= 44 ? 'Italy North' : lat >= 41.5 ? 'Italy Centre' : 'Italy South';
  return p.country === 'Others' ? '' : p.country;
}

/** Others (Spain, Greece, Belgium ...): buildings joined into one region when a chain of them is never more than this far apart (m) */
export const OTHERS_LINK_M = 400_000;

/** One feature per region at the mean position of its buildings; n = buildings, w/s/e/nn = bounds */
export function toRegionCollection(places: readonly Place[]): RegionCollection {
  const groups = new Map<string, Place[]>();
  const others: Place[] = [];
  for (const p of places) {
    if (!p.points.length) continue;
    const k = regionKey(p);
    if (k) groups.set(k, [...(groups.get(k) ?? []), p]);
    else others.push(p);
  }
  // Single-link grouping of the "Others"
  const parent = others.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i] as number)));
  for (let i = 0; i < others.length; i++) {
    for (let j = i + 1; j < others.length; j++) {
      const a = (others[i] as Place).points[0]!;
      const b = (others[j] as Place).points[0]!;
      if (distanceM({ lng: a.lng, lat: a.lat }, { lng: b.lng, lat: b.lat }) <= OTHERS_LINK_M) parent[find(i)] = find(j);
    }
  }
  const chains = new Map<number, Place[]>();
  others.forEach((p, i) => chains.set(find(i), [...(chains.get(find(i)) ?? []), p]));
  let k = 0;
  for (const ps of chains.values()) groups.set(`Others ${(ps[0] as Place).name} #${++k}`, ps);
  const features: RegionFeature[] = [];
  const outliers: string[] = [];
  const meanOf = (xs: readonly Place[]) => ({ lng: xs.reduce((n, p) => n + p.points[0]!.lng, 0) / xs.length, lat: xs.reduce((n, p) => n + p.points[0]!.lat, 0) / xs.length });
  for (const [region, all] of groups) {
    let ps = all;
    if (!region.startsWith('Others ')) {
      const m = meanOf(all);
      const near = all.filter((p) => distanceM(m, p.points[0]!) <= REGION_FAR_M);
      if (near.length && near.length < all.length) {
        ps = near;
        for (const p of all) if (!near.includes(p)) outliers.push(p.id);
      }
    }
    const b = boundsOf(ps) as LngLatBounds;
    const pts = ps.map((p) => p.points[0]!);
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [pts.reduce((n, q) => n + q.lng, 0) / pts.length, pts.reduce((n, q) => n + q.lat, 0) / pts.length] },
      properties: { region, n: ps.length, w: b[0][0], s: b[0][1], e: b[1][0], nn: b[1][1], pids: JSON.stringify(ps.map((p) => p.id)) },
    });
  }
  return { type: 'FeatureCollection', features, outliers };
}

export interface CityFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: { city: string; n: number; w: number; s: number; e: number; nn: number; xw: number; xs: number; xe: number; xn: number; pids: string; vpids: string };
}

export interface CityCollection {
  type: 'FeatureCollection';
  features: CityFeature[];
}

/** One feature per city: at the centre of its markers' bounds, n = number of buildings, bounds in w/s/e/nn (nn = north) */
export function toCityCollection(places: readonly Place[]): CityCollection {
  const by = new Map<string, Place[]>();
  for (const p of places) {
    if (!p.points.length || isWidePlace(p)) continue;
    const c = cityOf(p);
    if (!c) continue;
    by.set(c, [...(by.get(c) ?? []), p]);
  }
  const features: CityFeature[] = [];
  for (const [city, ps] of by) {
    const b = boundsOf(ps) as LngLatBounds;
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2] },
      properties: {
        city,
        n: ps.length,
        w: b[0][0],
        s: b[0][1],
        e: b[1][0],
        nn: b[1][1],
        xw: b[0][0],
        xs: b[0][1],
        xe: b[1][0],
        xn: b[1][1],
        pids: JSON.stringify(ps.map((p) => p.id)),
        vpids: '[]',
      },
    });
  }
  // Markers of region places join the nearest city: only the union bounds (x*) grow, the number and the circle position stay
  const attached = new Map<CityFeature, string[]>();
  for (const p of places) {
    if (!isWidePlace(p) || !features.length) continue;
    for (const pt of p.points) {
      let best = features[0]!;
      let bd = Infinity;
      for (const f of features) {
        const dx = (f.geometry.coordinates[0] - pt.lng) * Math.cos((pt.lat * Math.PI) / 180);
        const dy = f.geometry.coordinates[1] - pt.lat;
        if (dx * dx + dy * dy < bd) {
          bd = dx * dx + dy * dy;
          best = f;
        }
      }
      attached.set(best, [...new Set([...(attached.get(best) ?? []), p.id])]);
      const q = best.properties;
      q.xw = Math.min(q.xw, pt.lng);
      q.xe = Math.max(q.xe, pt.lng);
      q.xs = Math.min(q.xs, pt.lat);
      q.xn = Math.max(q.xn, pt.lat);
    }
  }
  for (const [f, ids] of attached) f.properties.vpids = JSON.stringify(ids);
  return { type: 'FeatureCollection', features };
}

export interface EdgeItem {
  key: string;
  n: number;
  /** Screen position of the city centre in px */
  x: number;
  y: number;
}
export interface EdgeMarker {
  /** Key of the nearest city of the group */
  key: string;
  /** Keys of all cities merged into this direction (the nearest first) */
  keys: string[];
  /** Number of buildings in the group */
  n: number;
  /** Position on the viewport edge in px */
  x: number;
  y: number;
}

/**
 * Markers for cities outside the view: only the nearest `max` directions. Cities are taken nearest first; a city whose bearing from the view centre is within
 * `mergeDeg` of an existing direction joins it: the direction becomes the middle (mean) of the bearings and the numbers add up, while the click target stays
 * the nearest city of the group. Each marker sits on the viewport edge (inset px inside it) at its direction. There is no distance limit here (the caller limits it).
 */
export function edgeMarkers(items: readonly EdgeItem[], w: number, h: number, inset = 24, max = 2, mergeDeg = 20): EdgeMarker[] {
  const cx = w / 2;
  const cy = h / 2;
  const outside = items
    .filter((it) => !(it.x >= 0 && it.x <= w && it.y >= 0 && it.y <= h))
    .map((it) => ({ it, a: Math.atan2(it.y - cy, it.x - cx), d: Math.hypot(it.x - cx, it.y - cy) }))
    .filter((o) => Number.isFinite(o.d) && o.d > 0)
    .sort((p, q) => p.d - q.d);
  const groups: { key: string; keys: string[]; n: number; sx: number; sy: number }[] = [];
  const limit = (mergeDeg * Math.PI) / 180;
  for (const { it, a } of outside) {
    const g = groups.find((q) => Math.abs(((a - Math.atan2(q.sy, q.sx) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) < limit);
    if (g) {
      g.n += it.n;
      g.keys.push(it.key);
      g.sx += Math.cos(a);
      g.sy += Math.sin(a);
    } else if (groups.length < max) groups.push({ key: it.key, keys: [it.key], n: it.n, sx: Math.cos(a), sy: Math.sin(a) });
  }
  return groups.map((g) => {
    const dx = g.sx;
    const dy = g.sy;
    const k = Math.min((cx - inset) / Math.abs(dx || 1e-9), (cy - inset) / Math.abs(dy || 1e-9));
    return { key: g.key, keys: g.keys, n: g.n, x: cx + dx * k, y: cy + dy * k };
  });
}

/** Edge markers show cities within this distance (m) of the view centre first */
export const EDGE_RANGE_M = 150_000;

/** Straight-line distance in metres between two lng/lat points (haversine) */
export function distanceM(a: { lng: number; lat: number }, b: { lng: number; lat: number }): number {
  const R = 6371008.8;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Edge markers limited to `base` metres from the view centre; when that leaves no marker at all, the limit doubles (300, 600, 1200 km ...)
 * until there is one (or no city is left out).
 */
export function edgeMarkersExpanding(items: readonly (EdgeItem & { dist: number })[], w: number, h: number, base = EDGE_RANGE_M): EdgeMarker[] {
  const maxDist = items.reduce((m, i) => Math.max(m, i.dist), 0);
  for (let r = base; ; r *= 2) {
    const m = edgeMarkers(items.filter((i) => i.dist <= r), w, h);
    if (m.length || r >= maxDist) return m;
  }
}

/** The points that lie outside the view with this centre and zoom (w x h px) */
export function pointsOutside<T extends { lng: number; lat: number }>(pts: readonly T[], center: { lng: number; lat: number }, zoom: number, w: number, h: number): T[] {
  return pts.filter((p) => !viewContainsPoint(center, zoom, w, h, p));
}

/** True when the point lies inside the view that has this centre and zoom in a w x h px map (Web Mercator, 512 px tiles as in MapLibre) */
export function viewContainsPoint(center: { lng: number; lat: number }, zoom: number, w: number, h: number, pt: { lng: number; lat: number }): boolean {
  const world = 512 * 2 ** zoom;
  const my = (lat: number) => (0.5 - Math.log(Math.tan(Math.PI / 4 + (Math.max(-85, Math.min(85, lat)) * Math.PI) / 360)) / (2 * Math.PI)) * world;
  let dLng = pt.lng - center.lng;
  dLng = ((((dLng + 180) % 360) + 360) % 360) - 180;
  const dx = (dLng / 360) * world;
  const dy = my(pt.lat) - my(center.lat);
  return Math.abs(dx) <= w / 2 && Math.abs(dy) <= h / 2;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Slides each marker along the viewport edge (the rectangle `inset` px inside a w x h view) until a `size` px circle at its centre no longer
 * overlaps any of the `obstacles` (page buttons) or an earlier marker. The nearest free spot along the edge wins; with none free the marker stays.
 */
export function avoidObstacles<T extends { x: number; y: number }>(markers: readonly T[], obstacles: readonly Rect[], w: number, h: number, inset = 24, size = 32, step = 4): T[] {
  const W = Math.max(w - 2 * inset, 1);
  const H = Math.max(h - 2 * inset, 1);
  const total = 2 * (W + H);
  const at = (t: number): { x: number; y: number } => {
    let u = ((t % total) + total) % total;
    if (u <= W) return { x: inset + u, y: inset };
    u -= W;
    if (u <= H) return { x: inset + W, y: inset + u };
    u -= H;
    if (u <= W) return { x: inset + W - u, y: inset + H };
    u -= W;
    return { x: inset, y: inset + H - u };
  };
  const param = (x: number, y: number): number => {
    const dTop = Math.abs(y - inset);
    const dRight = Math.abs(x - (inset + W));
    const dBottom = Math.abs(y - (inset + H));
    const dLeft = Math.abs(x - inset);
    const m = Math.min(dTop, dRight, dBottom, dLeft);
    if (m === dTop) return Math.min(Math.max(x - inset, 0), W);
    if (m === dRight) return W + Math.min(Math.max(y - inset, 0), H);
    if (m === dBottom) return W + H + Math.min(Math.max(inset + W - x, 0), W);
    return 2 * W + H + Math.min(Math.max(inset + H - y, 0), H);
  };
  const r = size / 2 + 3;
  const hits = (x: number, y: number, rects: readonly Rect[]) => rects.some((o) => x + r > o.x && x - r < o.x + o.w && y + r > o.y && y - r < o.y + o.h);
  const placed: Rect[] = [];
  return markers.map((m) => {
    const rects = [...obstacles, ...placed];
    let best = { x: m.x, y: m.y };
    if (hits(m.x, m.y, rects)) {
      const t0 = param(m.x, m.y);
      for (let d = step; d <= total / 2; d += step) {
        const a = at(t0 + d);
        const b = at(t0 - d);
        if (!hits(a.x, a.y, rects)) {
          best = a;
          break;
        }
        if (!hits(b.x, b.y, rects)) {
          best = b;
          break;
        }
      }
    }
    placed.push({ x: best.x - size / 2, y: best.y - size / 2, w: size, h: size });
    return { ...m, x: best.x, y: best.y };
  });
}

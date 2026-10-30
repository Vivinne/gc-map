import type { Era, EraId, Place } from './types';

export interface PointFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: { pid: string; id: string; name: string; sub: string; color: string; era: EraId; est: boolean; wide: boolean };
}

export interface PointCollection {
  type: 'FeatureCollection';
  features: PointFeature[];
}

export function toFeatureCollection(places: readonly Place[], eras: readonly Era[]): PointCollection {
  const color = new Map(eras.map((e) => [e.id, e.color]));
  const features: PointFeature[] = [];
  // A marker belongs to the wide group when its city is wide (see toCityCollection)
  const wideCity = new Map(toCityCollection(places).features.map((f) => [f.properties.city, f.properties.wide]));
  for (const p of places) {
    const wide = wideCity.get(cityOf(p)) ?? false;
    for (const pt of p.points) {
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [pt.lng, pt.lat] },
        properties: { pid: p.id, id: pt.id, name: p.name, sub: pt.sub, color: color.get(p.era) ?? '#111827', era: p.era, est: pt.precision === 'estimate', wide },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}

/** Default view when no filter is applied (Spain to Istanbul, UK to Sicily) */
export const HOME_BOUNDS: [[number, number], [number, number]] = [[-8, 36], [29.5, 55]];

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

/** About 1 m: a box this small cannot be separated by zooming, so the chooser list has to take over */
export const SAME_SPOT_DEG = 1e-5;
export const SAME_SPOT_ZOOM = 18;

export function isSameSpot(b: LngLatBounds): boolean {
  return b[1][0] - b[0][0] < SAME_SPOT_DEG && b[1][1] - b[0][1] < SAME_SPOT_DEG;
}

/** Below this zoom each city is one numbered circle; from here up every marker is drawn on its own */
export const CITY_TOP_ZOOM = 10.5;
/** A city whose markers span more than this (degrees) does not fit one screen at CITY_TOP_ZOOM, so it switches earlier */
export const WIDE_SPAN_DEG = 0.25;
export const WIDE_CITY_TOP_ZOOM = 7.5;
/** After a city click the zoom ends this far above the switch zoom, so the markers are already drawn one by one */
export const CITY_ZOOM_MARGIN = 0.5;

export function cityTopZoom(wide: boolean): number {
  return wide ? WIDE_CITY_TOP_ZOOM : CITY_TOP_ZOOM;
}

export function cityClickZoom(fitZoom: number, wide: boolean): number {
  return Math.max(fitZoom, cityTopZoom(wide) + CITY_ZOOM_MARGIN);
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

export interface CityFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: { city: string; n: number; wide: boolean; w: number; s: number; e: number; nn: number; pids: string };
}

export interface CityCollection {
  type: 'FeatureCollection';
  features: CityFeature[];
}

/** One feature per city: at the centre of its markers' bounds, n = number of buildings, bounds in w/s/e/nn (nn = north) */
export function toCityCollection(places: readonly Place[]): CityCollection {
  const by = new Map<string, Place[]>();
  for (const p of places) {
    if (!p.points.length) continue;
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
        wide: Math.max(b[1][0] - b[0][0], b[1][1] - b[0][1]) > WIDE_SPAN_DEG,
        w: b[0][0],
        s: b[0][1],
        e: b[1][0],
        nn: b[1][1],
        pids: JSON.stringify(ps.map((p) => p.id)),
      },
    });
  }
  return { type: 'FeatureCollection', features };
}

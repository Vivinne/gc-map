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
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const [lng, lat] of coords) {
    w = Math.min(w, lng);
    e = Math.max(e, lng);
    s = Math.min(s, lat);
    n = Math.max(n, lat);
  }
  return Number.isFinite(w) ? [[w, s], [e, n]] : null;
}

/** About 1 m: a box this small cannot be separated by zooming, so the chooser list has to take over */
export const SAME_SPOT_DEG = 1e-5;
export const SAME_SPOT_ZOOM = 18;

export function isSameSpot(b: LngLatBounds): boolean {
  return b[1][0] - b[0][0] < SAME_SPOT_DEG && b[1][1] - b[0][1] < SAME_SPOT_DEG;
}

/** Clusters exist only at or below this zoom; the zoom after a cluster click must be above it so the points are drawn one by one */
export const CLUSTER_ZOOM_MARGIN = 0.5;
export function clusterClickZoom(fitZoom: number, clusterTopZoom: number): number {
  return Math.max(fitZoom, clusterTopZoom + CLUSTER_ZOOM_MARGIN);
}

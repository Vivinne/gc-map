import type { Map as MlMap } from 'maplibre-gl';
import type { MutableRefObject } from 'react';
import { BY_COUNTRY_MIN, byCountry } from '../../lib/country';
import { DOT_R, boundsCenter, boundsOf } from '../../lib/geo';
import type { Building } from '../../lib/model';
import type { View } from '../../lib/nav';
import { MOTION } from '../../styles/tokens';

/* M8 camera: every map move (frame results, focus a card, split a number point, ＜). No drawing here. */

/** Camera moves: one length and one curve, the same as the panels (fast start, soft landing) */
export const MAP_MS = MOTION.slow;
export const EASE = (t: number) => 1 - (1 - t) ** 4;
/**
 * Long camera moves (a jump of several zoom levels: card focus, ＜, framing results) take longer and start
 * and end softly, so the eye can follow where the map goes. Short moves keep the panel timing.
 */
const EASE_LONG = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
const LONG_FROM = 1.5;
const camMs = (dz: number) => Math.min(1600, MAP_MS + 150 * Math.abs(dz));
const camEase = (dz: number) => (Math.abs(dz) >= LONG_FROM ? EASE_LONG : EASE);
export const EUROPE: [[number, number], [number, number]] = [[-9.5, 36.5], [24.5, 57.5]];
/** Space kept round the buildings when the map frames them */
export const FRAME = 40;
export const MAX_ZOOM = 18;
/** Closest zoom when a number point is opened (buildings at the same spot never split) */
const SPLIT_MAX = 17;

export interface Padding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface MapHandle {
  /** Frame a set of buildings in the free part of the map, zooming in no further than needed for each to stand alone */
  fitTo(list: Building[]): void;
  /**
   * Show the building of an open card. If it is merged into a number point, zoom in just enough for it to
   * stand alone and bring it into the free part of the map; otherwise the map only moves as far as needed
   * to show it in the free part (the zoom stays).
   */
  focus(b: Building, centre?: boolean): void;
  /**
   * A number point opened: zoom in only as far as needed for each of its buildings to stand alone as a single
   * marker (no number point left among them), centred on them in the free part of the map; never past the
   * view that still shows them all.
   */
  split(list: Building[]): void;
  /**
   * Whether the map already shows a set of buildings as framing would: every one inside the free part of the
   * map and standing alone (no two merged). A list line that frames them is then not clickable.
   */
  framed(list: Building[]): boolean;
  /** Go back to a view saved earlier (＜) */
  moveTo(v: View): void;
  view(): View | null;
}

interface CameraDeps {
  padRef: MutableRefObject<Padding>;
  /** Buildings drawn as markers at this moment (focus() checks whether the open one is merged) */
  markersShown: MutableRefObject<Building[]>;
  motion: (ms: number) => number;
}

/** The camera methods the app calls through the map's ref */
export function cameraApi(mapRef: MutableRefObject<MlMap | null>, deps: CameraDeps): MapHandle {
  const { padRef, markersShown, motion } = deps;
  /** Move the map only as far as needed to show a point in the free part; the zoom stays */
  const reveal = (map: MlMap, b: { lng: number; lat: number }) => {
    const p = padRef.current;
    const { clientWidth: W, clientHeight: H } = map.getContainer();
    const pt = map.project([b.lng, b.lat]);
    const x1 = p.left + FRAME;
    const x2 = W - p.right - FRAME;
    const y1 = p.top + FRAME;
    const y2 = H - p.bottom - FRAME;
    const dx = pt.x < x1 ? pt.x - x1 : pt.x > x2 ? pt.x - x2 : 0;
    const dy = pt.y < y1 ? pt.y - y1 : pt.y > y2 ? pt.y - y2 : 0;
    if (!dx && !dy) return;
    map.panBy([dx, dy], { duration: motion(MAP_MS), easing: EASE });
  };

  /**
   * Where framing a set of buildings takes the map: their centre, at the closest zoom holding them all but no
   * closer than needed for every one to stand alone; when they already stand alone at the present zoom the zoom
   * does not grow (the map only moves, or zooms out to take them all in)
   */
  const frameTarget = (map: MlMap, list: Building[]): { center: [number, number]; zoom: number } | null => {
    const b = boundsOf(list);
    if (!b) return null;
    const p = padRef.current;
    const padding = { top: p.top + FRAME, right: p.right + FRAME, bottom: p.bottom + FRAME, left: p.left + FRAME };
    const zoom = map.getZoom();
    const fitZ = Math.min(map.cameraForBounds(b, { padding })?.zoom ?? zoom, MAX_ZOOM);
    // zoom at which every one of them stands alone (no number point among them); one building has no limit
    const pts = list.map((x) => map.project([x.lng, x.lat]));
    let near = Infinity;
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) near = Math.min(near, Math.hypot(pts[i]!.x - pts[j]!.x, pts[i]!.y - pts[j]!.y));
    const splitAt = Number.isFinite(near) ? (near > 0 ? zoom + Math.log2((2 * DOT_R + 2) / near) + 0.1 : SPLIT_MAX) : -Infinity;
    return { center: boundsCenter(b), zoom: Math.min(fitZ, Math.max(splitAt, Math.min(zoom, fitZ))) };
  };

  return {
    fitTo: (all) => {
      const map = mapRef.current;
      if (!map) return;
      // Too spread to fit even fully zoomed out (a phone cannot hold America and Europe together): frame the
      // buildings at the top of the list instead — the first country of a list split by country, else the
      // country of the first row — so the map shows what the list shows first
      let list = all;
      const b = boundsOf(all);
      const p0 = padRef.current;
      const raw = b && map.cameraForBounds(b, { padding: { top: p0.top + FRAME, right: p0.right + FRAME, bottom: p0.bottom + FRAME, left: p0.left + FRAME } })?.zoom;
      if (raw != null && raw < map.getMinZoom() - 0.01 && all.length > 1) {
        const groups = byCountry(all);
        list = all.length >= BY_COUNTRY_MIN ? groups[0]!.items : groups.find((g) => g.items.includes(all[0]!))!.items;
      }
      const t = frameTarget(map, list);
      if (!map || !t) return;
      const p = padRef.current;
      const dz = t.zoom - map.getZoom();
      map.easeTo({
        center: t.center,
        zoom: t.zoom,
        offset: [(p.left - p.right) / 2, (p.top - p.bottom) / 2],
        duration: motion(camMs(dz)),
        easing: camEase(dz),
      });
    },
    focus: (b, centre) => {
      const map = mapRef.current;
      if (!map) return;
      const zoom = map.getZoom();
      const p0 = padRef.current;
      // a marker clicked on the map: the building comes to the middle of the free part of the map
      const toMiddle = () =>
        map.easeTo({ center: [b.lng, b.lat], offset: [(p0.left - p0.right) / 2, (p0.top - p0.bottom) / 2], duration: motion(MAP_MS), easing: EASE });
      const shown = markersShown.current;
      const here = map.project([b.lng, b.lat]);
      let near = Infinity;
      for (const o of shown) {
        if (o.id === b.id) continue;
        const q = map.project([o.lng, o.lat]);
        near = Math.min(near, Math.hypot(q.x - here.x, q.y - here.y));
      }
      // Far enough for the selection halo (r 18) to clear a neighbouring dot or small number point
      const need = 32;
      if (!shown.length || near >= need) {
        if (centre) toMiddle();
        else reveal(map, b);
        return;
      }
      const to = Math.min(MAX_ZOOM, zoom + (near > 0 ? Math.log2(need / near) + 0.15 : MAX_ZOOM));
      const p = padRef.current;
      // offset, not padding: map padding would stay on the map and shift every saved centre after it
      map.easeTo({
        center: [b.lng, b.lat],
        zoom: to,
        offset: [(p.left - p.right) / 2, (p.top - p.bottom) / 2],
        duration: motion(camMs(to - zoom)),
        easing: camEase(to - zoom),
      });
    },
    split: (list) => {
      const map = mapRef.current;
      const b = boundsOf(list);
      if (!map || !b || !list.length) return;
      const zoom = map.getZoom();
      // closest pair on screen now: two dots stand apart once their centres are two radii and the gap apart
      const pts = list.map((x) => map.project([x.lng, x.lat]));
      let near = Infinity;
      for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) near = Math.min(near, Math.hypot(pts[i]!.x - pts[j]!.x, pts[i]!.y - pts[j]!.y));
      const need = 2 * DOT_R + 2;
      const splitAt = near > 0 && Number.isFinite(near) ? zoom + Math.max(0, Math.log2(need / near)) + 0.1 : SPLIT_MAX;
      // never closer than the view that still holds all of them: buildings that cannot split there stay in a
      // smaller number point, which splits on its own click
      const p = padRef.current;
      const fit = map.cameraForBounds(b, { padding: { top: p.top + FRAME, right: p.right + FRAME, bottom: p.bottom + FRAME, left: p.left + FRAME } });
      const to = Math.min(splitAt, fit?.zoom ?? SPLIT_MAX, SPLIT_MAX);
      const dz = to - zoom;
      map.easeTo({
        center: boundsCenter(b),
        zoom: to,
        offset: [(p.left - p.right) / 2, (p.top - p.bottom) / 2],
        duration: motion(camMs(dz)),
        easing: camEase(dz),
      });
    },
    // Framed: every one of them is in the free part of the map, and framing would not zoom in any further
    // (it would only move the map a little, or zoom out). Number points that framing cannot split may stay.
    framed: (list) => {
      const map = mapRef.current;
      const t = map && frameTarget(map, list);
      if (!map || !t) return false;
      const p = padRef.current;
      const { clientWidth: W, clientHeight: H } = map.getContainer();
      const pts = list.map((x) => map.project([x.lng, x.lat]));
      if (pts.some((q) => q.x < p.left || q.x > W - p.right || q.y < p.top || q.y > H - p.bottom)) return false;
      return map.getZoom() >= t.zoom - 0.05;
    },
    moveTo: (v) => {
      const map = mapRef.current;
      if (!map) return;
      const dz = v.zoom - map.getZoom();
      map.easeTo({ center: [v.lng, v.lat], zoom: v.zoom, duration: motion(camMs(dz)), easing: camEase(dz) });
    },
    view: () => {
      const m = mapRef.current;
      if (!m) return null;
      const c = m.getCenter();
      return { lng: c.lng, lat: c.lat, zoom: m.getZoom() };
    },
  };
}

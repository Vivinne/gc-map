/**
 * The map's view before the map library has arrived (P2): the same Web Mercator projection MapLibre uses
 * (512 px tiles), so the markers can be drawn where the map will put them while the map is still loading.
 */
export interface ViewLike {
  project(p: [number, number]): { x: number; y: number };
  unproject(p: [number, number]): { lng: number; lat: number };
  getContainer(): HTMLElement;
  getZoom(): number;
  getCenter(): { lng: number; lat: number };
}

const TILE = 512;
const mercX = (lng: number) => (lng + 180) / 360;
const mercY = (lat: number) => (1 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / Math.PI) / 2;
const lngOf = (x: number) => x * 360 - 180;
const latOf = (y: number) => (360 / Math.PI) * Math.atan(Math.exp(Math.PI * (1 - 2 * y))) - 90;

/** A view at a centre and zoom, or one that fits a box with a margin (as MapLibre's `bounds` option) */
export function flatView(el: HTMLElement, at: { lng: number; lat: number; zoom: number } | { bounds: [[number, number], [number, number]]; padding: number; minZoom: number; maxZoom: number }): ViewLike {
  const W = el.clientWidth, H = el.clientHeight;
  let cx: number, cy: number, zoom: number;
  if ('bounds' in at) {
    const [[w, s], [e, n]] = at.bounds;
    cx = (mercX(w) + mercX(e)) / 2;
    cy = (mercY(n) + mercY(s)) / 2;
    const fit = Math.min((W - 2 * at.padding) / ((mercX(e) - mercX(w)) * TILE), (H - 2 * at.padding) / ((mercY(s) - mercY(n)) * TILE));
    zoom = Math.min(at.maxZoom, Math.max(at.minZoom, Math.log2(Math.max(fit, 1e-9))));
  } else {
    cx = mercX(at.lng);
    cy = mercY(at.lat);
    zoom = at.zoom;
  }
  const size = TILE * 2 ** zoom;
  return {
    project: ([lng, lat]) => ({ x: (mercX(lng) - cx) * size + W / 2, y: (mercY(lat) - cy) * size + H / 2 }),
    unproject: ([x, y]) => ({ lng: lngOf(cx + (x - W / 2) / size), lat: latOf(cy + (y - H / 2) / size) }),
    getContainer: () => el,
    getZoom: () => zoom,
    getCenter: () => ({ lng: lngOf(cx), lat: latOf(cy) }),
  };
}

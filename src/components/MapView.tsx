'use client';

import maplibregl, { type Map as MlMap, type StyleSpecification } from 'maplibre-gl';
import { flushSync } from 'react-dom';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { basemap } from '../lib/basemap';
import { MIN_DONUT, boundsOf, clusterAt, donutRadius, nearest, regionOf, type Cluster } from '../lib/geo';
import { BUILDINGS, CITY_BUILDINGS, CITY_NO, ERAS, ERA_ORDER, nationName, type Building } from '../lib/model';
import { geoMercator, geoPath } from 'd3-geo';
import { Icon } from './Icons';

export const DETAIL_ZOOM = 11.5;
const EUROPE: [[number, number], [number, number]] = [[-9.5, 36.5], [24.5, 57.5]];
const SEA = '#EEF1F4';
const LAND = '#D6DBE1';

export interface Padding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface MapHandle {
  fitAll(list: Building[]): void;
  fitTo(list: Building[], maxZoom?: number): void;
  /** Open a building: the whole city comes into view (a lone building: its nearest neighbour too) */
  showBuilding(b: Building): void;
  /** Fit every building of a city */
  showCity(city: string): void;
  home(): void;
  /** The camera now, to come back to it later */
  view(): { center: [number, number]; zoom: number } | null;
  restore(v: { center: [number, number]; zoom: number }): void;
  /** A building picked on the map: bring it to the middle of the visible area, keeping the zoom */
  focus(b: Building): void;
}

interface Props {
  buildings: Building[];
  selected: Building | null;
  hoverCity: string;
  /** Building highlighted from a list (pointer over its row) */
  hoverId: string;
  /** City shown in the overview inset while zoomed in (the open building's city) */
  insetCity: string;
  padding: Padding;
  reducedMotion: boolean;
  /** Phone layout: side widgets give way to the building sheet */
  compact?: boolean;
  /** Phone held sideways: the card is a column at the left of the map */
  sideways?: boolean;
  onSelect(id: string): void;
  onCity(city: string): void;
  onReady?(): void;
  /** Full map button: the parent clears selection and filters, then the map shows Europe */
  onHome?(): void;
  /** The user zoomed out to the panorama (scale bar at 500 km or more): the parent clears the view */
  onPanorama?(): void;
  /** Active filter chips: after the scale bar (desktop) or along the top of the map (phone) */
  foot?: React.ReactNode;
}

/** Locator size (desktop / phone) */
const LOC = { d: { w: 280, h: 200 }, m: { w: 132, h: 96 } };
/**
 * Where the locator sits, in map pixels. It never moves when a panel opens or closes: desktop, the lower
 * right corner beside the zoom buttons; phone, the upper left corner under the row of filter chips (the
 * lower part of a phone map is covered by the sheet while a building is open); a phone held sideways, the
 * upper right corner beside the map buttons (the card covers the left part of the map there).
 */
function locBox(W: number, H: number, compact: boolean, sideways = false): Box {
  if (compact && sideways) return { x1: W - 56 - LOC.m.w, y1: 8, x2: W - 56, y2: 8 + LOC.m.h };
  if (compact) return { x1: 12, y1: 52, x2: 12 + LOC.m.w, y2: 52 + LOC.m.h };
  return { x1: W - 56 - LOC.d.w, y1: H - 16 - LOC.d.h, x2: W - 56, y2: H - 16 };
}
/** The locator shows from this zoom on (past country scale) */
const LOC_ZOOM = 7;

/** A building alone in its city, with the nearest landmarks when they are close enough to show together */
function alone(b: Building): Building[] {
  const near = nearest(b, BUILDINGS.filter((x) => x.city !== b.city), 2).filter((x) => x.d <= 150000).map((x) => x.b);
  // mirrored around the building, so the fit keeps the building itself in the middle
  const out: Building[] = [b, ...near];
  for (const n of near) out.push({ ...n, id: `${n.id}~m`, lng: 2 * b.lng - n.lng, lat: 2 * b.lat - n.lat });
  return out;
}

const LOCATORS = new Map<string, { pr: (p: [number, number]) => [number, number] | null; land: string; raw: Parameters<typeof geoPath>[0]; key: string }>();
/** Small projection of Europe (or the world) and its land outline, made once per size */
function locator(world: boolean, w: number, h: number) {
  const key = `${world}-${w}`;
  let l = LOCATORS.get(key);
  if (!l) {
    const extent = world ? [[-165, -50], [178, 72]] : [[-11, 35], [42, 63]];
    const pr = geoMercator().fitExtent([[2, 2], [w - 2, h - 2]], { type: 'MultiPoint', coordinates: extent });
    const land = geoPath(pr).digits(1)(basemap().land as never) ?? '';
    l = { pr: (p) => pr(p) as [number, number] | null, land, raw: pr, key };
    LOCATORS.set(key, l);
  }
  return l;
}

type Ring = number[][];
/** Plain point-in-ring test on longitude / latitude (either winding) */
function inRing(r: Ring, x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi = 0, yi = 0] = r[i]!;
    const [xj = 0, yj = 0] = r[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const NATION_PATHS = new Map<string, string>();
/** Outline of the country a building stands in, drawn on the locator (filled darker) */
function nationPath(b: Building, key: string, pr: Parameters<typeof geoPath>[0]): string {
  const k = `${key}|${b.id}`;
  const hit = NATION_PATHS.get(k);
  if (hit != null) return hit;
  let out = '';
  for (const f of basemap().land.features) {
    const g = f.geometry as { type: string; coordinates: Ring[][] | Ring[] };
    const polys = (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []) as Ring[][];
    if (polys.some((poly) => poly[0] && (inRing(poly[0], b.lng, b.lat) || inRing(poly[0], b.lng + 360, b.lat)))) {
      // d3 draws spherical polygons wound clockwise; the basemap rings follow RFC 7946 (counter-clockwise)
      const flip = (poly: Ring[]) => poly.map((r) => [...r].reverse());
      const geom = g.type === 'Polygon' ? { type: 'Polygon', coordinates: flip(g.coordinates as Ring[]) } : { type: 'MultiPolygon', coordinates: (g.coordinates as Ring[][]).map(flip) };
      out = geoPath(pr).digits(1)({ type: 'Feature', properties: {}, geometry: geom } as never) ?? '';
      break;
    }
  }
  NATION_PATHS.set(k, out);
  return out;
}

const NATION_ICONS = new Map<string, string>();
/** The outline of a building's country (the part of it the building stands on) drawn into an 18 px icon */
function nationIcon(b: Building): string {
  const hit = NATION_ICONS.get(b.id);
  if (hit != null) return hit;
  let out = '';
  for (const f of basemap().land.features) {
    const g = f.geometry as { type: string; coordinates: Ring[][] | Ring[] };
    const polys = (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []) as Ring[][];
    const poly = polys.find((pl) => pl[0] && (inRing(pl[0], b.lng, b.lat) || inRing(pl[0], b.lng + 360, b.lat)));
    if (!poly) continue;
    const geom = { type: 'Polygon', coordinates: [[...poly[0]!].reverse()] };
    const pr = geoMercator().fitExtent([[1.5, 1.5], [16.5, 16.5]], geom as never);
    out = geoPath(pr).digits(1)(geom as never) ?? '';
    break;
  }
  NATION_ICONS.set(b.id, out);
  return out;
}

function styleSpec(): StyleSpecification {
  const { land, borders } = basemap();
  return {
    version: 8,
    sources: {
      land: { type: 'geojson', data: land },
      borders: { type: 'geojson', data: borders },
      // Streets for the city scale. Optional: if the tile server cannot be reached the offline layers above still draw the map.
      ofm: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' },
    },
    layers: [
      { id: 'sea', type: 'background', paint: { 'background-color': SEA } },
      { id: 'land', type: 'fill', source: 'land', paint: { 'fill-color': LAND } },
      { id: 'ofm-water', type: 'fill', source: 'ofm', 'source-layer': 'water', minzoom: 6, paint: { 'fill-color': SEA } },
      {
        id: 'ofm-river', type: 'line', source: 'ofm', 'source-layer': 'waterway', minzoom: 9,
        paint: { 'line-color': SEA, 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.8, 15, 4] },
      },
      {
        id: 'ofm-roads', type: 'line', source: 'ofm', 'source-layer': 'transportation', minzoom: 10,
        filter: ['match', ['get', 'class'], ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service'], true, false],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#F4F6F8',
          'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 10, ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], 1.4, 0.4], 16, ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], 12, ['secondary', 'tertiary'], 9, 5]],
        },
      },
      { id: 'ofm-buildings', type: 'fill', source: 'ofm', 'source-layer': 'building', minzoom: 14, paint: { 'fill-color': '#CBD1D8' } },
      { id: 'borders', type: 'line', source: 'borders', maxzoom: 10, paint: { 'line-color': '#FFFFFF', 'line-width': 1 } },
    ],
  };
}

const MapView = forwardRef<MapHandle, Props>(function MapView(props, ref) {
  const { buildings, selected, hoverCity, hoverId, insetCity, padding, reducedMotion, compact, sideways, onSelect, onCity, onReady, onHome, onPanorama, foot } = props;
  const panoRef = useRef(onPanorama);
  const btnZoom = useRef(false);
  panoRef.current = onPanorama;
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const [layer, setLayer] = useState<HTMLElement | null>(null);
  const [frame, setFrame] = useState(0);
  const [tip, setTip] = useState<Cluster | null>(null);
  const [pinHover, setPinHover] = useState('');
  const [awayOpen, setAwayOpen] = useState(false);
  // WebGL missing or blocked: the map cannot start; the rest of the app (list, quiz, me) keeps working
  const [noMap, setNoMap] = useState(false);
  const padRef = useRef(padding);
  padRef.current = padding;
  const compactRef = useRef(!!compact);
  compactRef.current = !!compact;
  const sidewaysRef = useRef(!!sideways);
  sidewaysRef.current = !!sideways;
  const motion = useCallback((ms: number) => (reducedMotion ? 0 : ms), [reducedMotion]);

  useEffect(() => {
    if (!box.current) return;
    let map: MlMap;
    try {
      map = new maplibregl.Map({
        container: box.current,
        style: styleSpec(),
        bounds: EUROPE,
        fitBoundsOptions: { padding: 30 },
        attributionControl: false,
        renderWorldCopies: false,
        maxZoom: 18,
        minZoom: 1.2,
        dragRotate: false,
        pitchWithRotate: false,
      });
    } catch {
      setNoMap(true);
      return;
    }
    map.touchZoomRotate.disableRotation();
    map.on('error', () => {
      /* tile server unreachable: the offline layers keep working */
    });
    let raf = 0;
    const bump = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        setFrame((f) => f + 1);
      });
    };
    // The overlay is redrawn in the same frame as the map: a redraw one frame later makes the marks
    // lag behind the canvas and shake while the map is dragged (most visible on phones)
    // (a microtask still runs before that frame is painted, and never inside a React render)
    let queued = false;
    map.on('move', () => {
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      if (queued) return;
      queued = true;
      queueMicrotask(() => {
        queued = false;
        flushSync(() => setFrame((f) => f + 1));
      });
    });
    map.on('resize', bump);
    // A zoom out by the user (wheel, pinch, drag or the zoom buttons) to a 500 km scale bar means
    // "show me everything"; the camera moves the site makes itself (Country, fitting a city) do not count
    // Map events do not say who moved the camera, so input on the map canvas itself (wheel, drag, pinch)
    // and on the marks drawn over it is noted; the panels and map buttons sit outside it and do not count
    let lastInput = 0;
    const noteInput = () => {
      lastInput = Date.now();
    };
    const surface = map.getCanvasContainer();
    for (const t of ['wheel', 'pointerdown', 'touchstart'] as const) surface.addEventListener(t, noteInput, { passive: true, capture: true });
    let startZoom = 0;
    let byUser = false;
    map.on('movestart', () => {
      startZoom = map.getZoom();
      byUser = Date.now() - lastInput < 1200 || btnZoom.current;
      btnZoom.current = false;
    });
    const atPanorama = () => (40075016.686 * Math.cos((map.getCenter().lat * Math.PI) / 180)) / (512 * 2 ** map.getZoom()) * 110 >= 500000;
    // Noted during the move too: a long wheel or pinch gesture can end in a small last step
    let crossed = false;
    map.on('zoom', () => {
      if ((byUser || Date.now() - lastInput < 1200) && map.getZoom() < startZoom - 0.01 && atPanorama()) crossed = true;
    });
    map.on('moveend', () => {
      const user = byUser || Date.now() - lastInput < 1200;
      byUser = false;
      const hit = crossed || (user && map.getZoom() < startZoom - 0.01 && atPanorama());
      crossed = false;
      if (hit && atPanorama()) panoRef.current?.();
    });
    map.on('load', () => {
      bump();
      onReady?.();
    });
    // Once street tiles arrive, their water layer draws the coasts from zoom 6. The 1:50m offline land
    // would otherwise show its coarse outline through (sea colour on real land near coasts), so from
    // zoom 6 the background becomes land and the offline land layer stops.
    let tilesOk = false;
    map.on('data', (e) => {
      if (tilesOk || (e as { sourceId?: string }).sourceId !== 'ofm' || !(e as { tile?: unknown }).tile) return;
      tilesOk = true;
      map.setPaintProperty('sea', 'background-color', ['step', ['zoom'], SEA, 6, LAND]);
      map.setLayerZoomRange('land', 0, 6);
    });
    mapRef.current = map;
    // Read by the browser checks (tests/e2e) to compare the view with a country's outline
    (window as unknown as { __gcAtlasMap?: unknown }).__gcAtlasMap = map;
    setLayer(map.getCanvasContainer());
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(box.current);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fitTo = useCallback(
    (list: Building[], maxZoom = 15.5) => {
      const map = mapRef.current;
      const b = boundsOf(list);
      if (!map || !b) return;
      const p = padRef.current;
      const extra = compactRef.current ? 24 : 40;
      const pad = { top: p.top + extra, right: p.right + extra, bottom: p.bottom + extra, left: p.left + extra };
      // Past country scale the locator shows in the lower right corner: keep the buildings clear of it,
      // either above it or left of it, whichever leaves them larger
      let use = pad;
      const first = map.cameraForBounds(b, { padding: pad, maxZoom });
      if (first && (first.zoom ?? 0) >= LOC_ZOOM) {
        const W = map.getContainer().clientWidth;
        const H = map.getContainer().clientHeight;
        const c = compactRef.current;
        const sw = c && sidewaysRef.current;
        const lb = locBox(W, H, c, sw);
        const g = 12 + extra / 2;
        // desktop: above the locator or left of it; phone: below it or right of it; sideways phone: below it or left of it
        const a = c ? { ...pad, top: Math.max(pad.top, lb.y2 + g) } : { ...pad, bottom: Math.max(pad.bottom, H - lb.y1 + g) };
        const o = sw ? { ...pad, right: Math.max(pad.right, W - lb.x1 + g) } : c ? { ...pad, left: Math.max(pad.left, lb.x2 + g) } : { ...pad, right: Math.max(pad.right, W - lb.x1 + g) };
        const za = map.cameraForBounds(b, { padding: a, maxZoom })?.zoom ?? -1;
        const zb = map.cameraForBounds(b, { padding: o, maxZoom })?.zoom ?? -1;
        use = za >= zb ? a : o;
      }
      map.fitBounds(b, { padding: use, maxZoom, duration: motion(650) });
    },
    [motion],
  );

  const showCity = useCallback(
    (city: string) => {
      const items = CITY_BUILDINGS.get(city) ?? [];
      if (items.length) fitTo(items, 15);
    },
    [fitTo],
  );

  useImperativeHandle(
    ref,
    () => ({
      fitAll: (list) => (list.length ? fitTo(list, 6) : undefined),
      fitTo,
      showCity,
      home: () => homeView(),
      view: () => {
        const m = mapRef.current;
        if (!m) return null;
        const c = m.getCenter();
        return { center: [c.lng, c.lat], zoom: m.getZoom() };
      },
      restore: (v) => mapRef.current?.easeTo({ center: v.center, zoom: v.zoom, duration: motion(500) }),
      focus: (b) => {
        const p = padRef.current;
        // offset, not padding: easeTo keeps a padding for later camera moves
        const bottom = compactRef.current ? p.bottom : p.bottom + 44;
        mapRef.current?.easeTo({ center: [b.lng, b.lat], offset: [(p.left - p.right) / 2, (p.top - bottom) / 2], duration: motion(450) });
      },
      showBuilding: (b) => {
        const city = CITY_BUILDINGS.get(b.city) ?? [b];
        if (city.length > 1) {
          // Whole city, at least city scale so the numbered pins show
          fitTo(city, 15);
          return;
        }
        // A one-building city: the building and its two nearest landmarks (listed in the card)
        fitTo(alone(b), 14);
      },
    }),
    [fitTo, showCity, motion],
  );

  const homeView = useCallback(() => {
    const p = padRef.current;
    mapRef.current?.fitBounds(EUROPE, { padding: { top: p.top + 20, right: p.right + 20, bottom: p.bottom + 20, left: p.left + 20 }, duration: motion(650) });
  }, [motion]);

  const map = mapRef.current;
  const zoom = map ? map.getZoom() : 4;
  // Country of the open building or city (else of the building nearest the view centre): its whole land,
  // from the Natural Earth outline (data: nationBox), not just the box of the buildings filed under it
  const countryBox = useMemo(() => {
    let ref: Building | undefined = selected ?? (insetCity ? CITY_BUILDINGS.get(insetCity)?.[0] : undefined);
    if (!ref && map) {
      const c = map.getCenter();
      ref = nearest({ ...BUILDINGS[0]!, id: '', lng: c.lng, lat: c.lat }, BUILDINGS, 1)[0]?.b;
    }
    return ref?.nationBox ? { box: ref.nationBox, ref } : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, insetCity, map, frame]);
  const fitCountry = useCallback(
    (box: [number, number, number, number]) => {
      const p = padRef.current;
      const extra = compactRef.current ? 16 : 40;
      mapRef.current?.fitBounds(
        [
          [box[0], box[1]],
          [box[2], box[3]],
        ],
        { padding: { top: p.top + extra, right: p.right + extra, bottom: p.bottom + extra, left: p.left + extra }, maxZoom: 9, duration: motion(650) },
      );
    },
    [motion],
  );
  // A city in focus (open building) switches to numbered pins earlier, so its whole extent can show as pins
  const detail = zoom >= DETAIL_ZOOM || (!!insetCity && zoom >= 10);
  const zBucket = Math.floor(zoom * 2) / 2;

  const clusters = useMemo(() => (detail ? [] : clusterAt(buildings, zBucket)), [buildings, zBucket, detail]);

  useEffect(() => {
    setTip(null);
    setAwayOpen(false);
  }, [buildings, detail]);

  // Buildings outside the current view, grouped by region
  const outside = useMemo(() => {
    if (!map) return { total: 0, groups: [] as [string, Building[]][] };
    const bb = map.getBounds();
    const groups = new Map<string, Building[]>();
    let total = 0;
    for (const b of buildings) {
      if (bb.contains([b.lng, b.lat])) continue;
      total++;
      const k = regionOf(b);
      const arr = groups.get(k);
      if (arr) arr.push(b);
      else groups.set(k, [b]);
    }
    return { total, groups: [...groups.entries()].sort((a, b) => b[1].length - a[1].length) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, buildings, frame]);

  const down = useRef<[number, number] | null>(null);
  const onDown = (e: React.PointerEvent) => {
    down.current = [e.clientX, e.clientY];
  };
  // A finger moves a little during a tap: allow more on phones before a tap counts as a drag
  const isClick = (e: React.MouseEvent) => !down.current || Math.hypot(e.clientX - down.current[0], e.clientY - down.current[1]) < (compact ? 14 : 5);
  const hot = hoverId || pinHover;

  // Where the fixed parts sit over the map (container pixels): names are never placed under them
  const sheetH = (compact ? padding.bottom - 36 : 0);
  const showLoc = !!map && zoom >= LOC_ZOOM;
  const L = compact ? LOC.m : LOC.d;
  const mapW = map ? map.getContainer().clientWidth : 0;
  const mapH = map ? map.getContainer().clientHeight : 0;
  const lb = locBox(mapW, mapH, !!compact, !!sideways);
  let overlay: React.ReactNode = null;
  if (map && layer) {
    const W = map.getContainer().clientWidth;
    const H = map.getContainer().clientHeight;
    const blocked: Box[] = [];
    if (showLoc) blocked.push({ x1: lb.x1 - 6, y1: lb.y1 - 6, x2: lb.x2 + 6, y2: lb.y2 + 6 });
    // scale bar and filter chips: one row along the bottom (phone: scale lower left, chips along the top)
    blocked.push(compact ? { x1: 0, y1: H - 52, x2: 140, y2: H } : { x1: 0, y1: H - 48, x2: W - 56, y2: H });
    if (compact && padding.top > 8) blocked.push({ x1: 0, y1: 0, x2: W, y2: 46 });
    // phone: the map credit line along the bottom right (desktop: inside the bottom row above)
    if (compact) blocked.push({ x1: Math.max(0, W - 12 - 345), y1: H - 18, x2: W - 12, y2: H });
    // zoom and country buttons (desktop: lower right; phone: upper right)
    blocked.push(compact ? { x1: W - 52, y1: 0, x2: W, y2: 84 } : { x1: W - 56, y1: H - 160, x2: W, y2: H });
    const proj = (lng: number, lat: number) => {
      const p = map.project([lng, lat]);
      return [p.x, p.y] as const;
    };
    const inView = (x: number, y: number, m = 40) => x > -m && y > -m && x < W + m && y < H + m;
    const marks: React.ReactNode[] = [];
    const leaders: React.ReactNode[] = [];
    // Phones: a finger-sized invisible target over every dot and pin (drawn last, so it is on top)
    const hits: React.ReactNode[] = [];
    const hit = (key: string, x: number, y: number, id: string) => {
      if (!compact) return;
      hits.push(<circle key={`h-${key}`} className="mk hit" cx={x} cy={y} r={20} onPointerDown={onDown} onClick={(e) => isClick(e) && onSelect(id)} />);
    };
    const labels: React.ReactNode[] = [];

    if (!detail) {
      const cityLabels: { key: string; x: number; y: number; r: number; text: string; hot: boolean }[] = [];
      for (const c of clusters) {
        if (c.items.length < MIN_DONUT) {
          for (const b of c.items) {
            const [x, y] = proj(b.lng, b.lat);
            if (!inView(x, y)) continue;
            hit(b.id, x, y, b.id);
            marks.push(
              <circle key={b.id} className="mk dot" cx={x} cy={y} r={5.5} fill={ERAS[b.era].color} onPointerDown={onDown} onClick={(e) => isClick(e) && onSelect(b.id)}>
                <title>{b.name}</title>
              </circle>,
            );
          }
          continue;
        }
        const [x, y] = proj(c.lng, c.lat);
        if (!inView(x, y)) continue;
        const r = donutRadius(c.items.length);
        const isHot = hoverCity === c.name || tip === c;
        marks.push(
          <g
            key={c.key}
            className="mk donut"
            transform={`translate(${x.toFixed(1)},${y.toFixed(1)})`}
            onPointerDown={onDown}
            onPointerEnter={() => setTip(c)}
            onPointerLeave={() => setTip((t) => (t === c ? null : t))}
            onClick={(e) => {
              if (!isClick(e)) return;
              setTip(null);
              // One click opens the city the circle is named after (the largest one of a merged circle)
              onCity(c.name);
            }}
          >
            {isHot && <circle r={r + 6} className="donut-hot" />}
            <Donut items={c.items} r={r} />
            <text className="donut-n" y={4.3} textAnchor="middle">
              {c.items.length}
            </text>
          </g>,
        );
        if (c.items.length >= 5 || isHot) cityLabels.push({ key: c.key, x, y, r, text: clusterName(c), hot: isHot });
      }
      // City names: right of the circle first, then left, below, above; never over another circle or name
      const occupied: Box[] = [...blocked];
      for (const c of clusters) {
        if (c.items.length < MIN_DONUT) continue;
        const [x, y] = proj(c.lng, c.lat);
        const r = donutRadius(c.items.length);
        occupied.push({ x1: x - r, x2: x + r, y1: y - r, y2: y + r });
      }
      cityLabels.sort((a, b) => Number(b.hot) - Number(a.hot) || b.r - a.r);
      for (const l of cityLabels) {
        const tw = textWidth(l.text, false) + 2;
        const cands: [number, number][] = [
          [l.x + l.r + 5, l.y + 4.5],
          [l.x - l.r - 5 - tw, l.y + 4.5],
          [l.x - tw / 2, l.y + l.r + 15],
          [l.x - tw / 2, l.y - l.r - 6],
        ];
        for (const [tx, ty] of cands) {
          const b = { x1: tx - 2, x2: tx + tw + 2, y1: ty - 12, y2: ty + 3 };
          if (occupied.some((o) => !(b.x2 < o.x1 || b.x1 > o.x2 || b.y2 < o.y1 || b.y1 > o.y2))) continue;
          occupied.push(b);
          labels.push(<CityLabel key={`l-${l.key}`} x={tx} y={ty} text={l.text} />);
          break;
        }
      }
    } else {
      // Numbered pins (number = place in its city, 1 = oldest). Entries at one spot fan out in a small ring;
      // pins closer than one pin width are pushed apart so every number stays readable.
      type Pin = { b: Building; x: number; y: number; x0: number; y0: number };
      const pins: Pin[] = [];
      const spots = new Map<string, Pin[]>();
      for (const b of buildings) {
        const [x, y] = proj(b.lng, b.lat);
        if (!inView(x, y, 60)) continue;
        const k = `${b.lng.toFixed(4)},${b.lat.toFixed(4)}`;
        const pin = { b, x, y, x0: x, y0: y };
        pins.push(pin);
        const arr = spots.get(k);
        if (arr) arr.push(pin);
        else spots.set(k, [pin]);
      }
      for (const group of spots.values()) {
        if (group.length < 2) continue;
        group.forEach((p, i) => {
          const a = (i / group.length) * Math.PI * 2 - Math.PI / 2;
          p.x += Math.cos(a) * 13;
          p.y += Math.sin(a) * 13;
        });
      }
      const MIN = 21;
      if (pins.length <= 120) {
        for (let it = 0; it < 12; it++) {
          let moved = false;
          for (let i = 0; i < pins.length; i++) {
            for (let j = i + 1; j < pins.length; j++) {
              const a = pins[i]!;
              const c = pins[j]!;
              const dx = c.x - a.x;
              const dy = c.y - a.y;
              const d = Math.hypot(dx, dy) || 0.01;
              if (d >= MIN) continue;
              const push = (MIN - d) / 2;
              a.x -= (dx / d) * push;
              a.y -= (dy / d) * push;
              c.x += (dx / d) * push;
              c.y += (dy / d) * push;
              moved = true;
            }
          }
          if (!moved) break;
        }
      }
      // Numbers belong to one city at a time (the open building's or the focused one; else the city with the
      // most pins in view). Buildings of other cities stay small plain dots, so no number appears twice.
      let focus = insetCity;
      if (!focus) {
        const n = new Map<string, number>();
        for (const p of pins) n.set(p.b.city, (n.get(p.b.city) ?? 0) + 1);
        focus = [...n.entries()].sort((a, c) => c[1] - a[1])[0]?.[0] ?? '';
      }
      const isFocus = (p: Pin) => p.b.city === focus;
      const placed: Box[] = [...blocked, ...pins.map((p) => (isFocus(p) ? { x1: p.x - 11, x2: p.x + 11, y1: p.y - 11, y2: p.y + 11 } : { x1: p.x - 6, x2: p.x + 6, y1: p.y - 6, y2: p.y + 6 }))];
      // Names: the open and the pointed building in a black tag; every other building of the city in small
      // grey type wherever it fits, so the surroundings read without competing with the open building.
      // Names never run under the side panel or the band.
      const area = { x1: padding.left + 2, y1: compact ? padding.top - 4 : 2, x2: W - 2, y2: H - (compact ? sheetH : 2) };
      const rank = (p: Pin) => (selected && p.b.id === selected.id ? 0 : p.b.id === hot ? 1 : 2);
      for (const p of [...pins].sort((a, c) => rank(a) - rank(c))) {
        const strong = (!!selected && p.b.id === selected.id) || p.b.id === hot;
        if (!strong && !isFocus(p)) continue;
        // the open building always gets its name, even where the city is crowded
        const pos = placeLabel(p.x, p.y, p.b.name, strong ? 'strong' : 'soft', placed, area, 15) ?? (rank(p) === 0 ? forceLabel(p.x, p.y, p.b.name, area, placed) : null);
        if (pos) labels.push(<PlaceLabel key={`t-${p.b.id}`} {...pos} text={p.b.name} strong={strong} />);
      }
      // Buildings of another city shown as plain dots: that city's name once beside them (e.g. Vatican next to Rome)
      const others = new Map<string, Pin[]>();
      for (const p of pins) {
        if (isFocus(p) || (selected && p.b.id === selected.id)) continue;
        const arr = others.get(p.b.city);
        if (arr) arr.push(p);
        else others.set(p.b.city, [p]);
      }
      for (const [name, ps] of others) {
        const cx = ps.reduce((n, p) => n + p.x, 0) / ps.length;
        const cy = ps.reduce((n, p) => n + p.y, 0) / ps.length;
        const r = Math.max(...ps.map((p) => Math.hypot(p.x - cx, p.y - cy))) + 8;
        const pos = placeLabel(cx, cy, name, 'city', placed, area, r);
        if (pos) labels.push(<CityLabel key={`oc-${name}`} x={pos.x} y={pos.y} text={name} />);
      }
      // A pin moved off its spot (shared spot or crowding) keeps a thin line to the true position
      for (const p of pins) {
        if (Math.hypot(p.x - p.x0, p.y - p.y0) < 4) continue;
        leaders.push(
          <g key={`l-${p.b.id}`} className="leader">
            <line x1={p.x0} y1={p.y0} x2={p.x} y2={p.y} />
            <circle cx={p.x0} cy={p.y0} r={2} />
          </g>,
        );
      }
      for (const p of pins) {
        const isSel = !!selected && p.b.id === selected.id;
        const isHot = p.b.id === hot;
        hit(p.b.id, p.x, p.y, p.b.id);
        if (!isFocus(p) && !isSel) {
          marks.push(
            <circle
              key={p.b.id}
              className={`mk dot other${isHot ? ' hot' : ''}`}
              cx={p.x}
              cy={p.y}
              r={6}
              fill={ERAS[p.b.era].color}
              onPointerDown={onDown}
              onPointerEnter={() => setPinHover(p.b.id)}
              onPointerLeave={() => setPinHover((h) => (h === p.b.id ? '' : h))}
              onClick={(e) => isClick(e) && onSelect(p.b.id)}
            >
              <title>{`${p.b.name} (${p.b.city})`}</title>
            </circle>,
          );
          continue;
        }
        const r = isSel ? 12.5 : 10;
        marks.push(
          <g
            key={p.b.id}
            className={`mk pin${isSel ? ' sel' : ''}${isHot ? ' hot' : ''}${p.b.exams.length ? ' asked' : ''}`}
            transform={`translate(${p.x.toFixed(1)},${p.y.toFixed(1)})`}
            onPointerDown={onDown}
            onPointerEnter={() => setPinHover(p.b.id)}
            onPointerLeave={() => setPinHover((h) => (h === p.b.id ? '' : h))}
            onClick={(e) => isClick(e) && onSelect(p.b.id)}
          >
            {isSel && <circle r={21} fill={ERAS[p.b.era].color} opacity={0.22} />}
            <circle r={r} fill={ERAS[p.b.era].color} />
            <text y={4} textAnchor="middle">
              {CITY_NO.get(p.b.id) ?? ''}
            </text>
            <title>{p.b.name}</title>
          </g>,
        );
      }
    }
    // Buildings of the focused city that are off screen (or under a panel): a numbered marker on the edge of
    // the visible area, its point aimed at the building, so the direction of every other building stays clear
    const edgeCity = insetCity;
    if (edgeCity && detail) {
      const pad = padRef.current;
      // inner frame: clear of the panels, the band, the scale and the zoom buttons
      const r0 = { x1: pad.left + 22, y1: pad.top + 22, x2: W - pad.right - 22, y2: H - pad.bottom - 22 };
      const cx = (r0.x1 + r0.x2) / 2;
      const cy = (r0.y1 + r0.y2) / 2;
      const edge: { b: Building; x: number; y: number; a: number }[] = [];
      for (const b of buildings) {
        if (b.city !== edgeCity) continue;
        const [x, y] = proj(b.lng, b.lat);
        if (x >= r0.x1 - 12 && x <= r0.x2 + 12 && y >= r0.y1 - 12 && y <= r0.y2 + 12) continue;
        const dx = x - cx;
        const dy = y - cy;
        const tx = dx > 0 ? (r0.x2 - cx) / dx : dx < 0 ? (r0.x1 - cx) / dx : Infinity;
        const ty = dy > 0 ? (r0.y2 - cy) / dy : dy < 0 ? (r0.y1 - cy) / dy : Infinity;
        const t = Math.min(tx, ty);
        edge.push({ b, x: cx + dx * t, y: cy + dy * t, a: Math.atan2(dy, dx) });
      }
      // the locator covers a corner (desktop lower right, phone upper left, sideways phone upper right): markers there move just past it
      if (showLoc) {
        for (const e of edge) {
          if (compact && sideways) {
            // upper right corner
            if (e.x <= lb.x1 - 14 || e.y >= lb.y2 + 14) continue;
            if (Math.abs(e.y - r0.y1) < 1) e.x = lb.x1 - 14;
            else e.y = lb.y2 + 14;
          } else if (compact) {
            if (e.x >= lb.x2 + 14 || e.y >= lb.y2 + 14) continue;
            if (Math.abs(e.y - r0.y1) < 1) e.x = lb.x2 + 14;
            else e.y = lb.y2 + 14;
          } else {
            if (e.x <= lb.x1 - 14 || e.y <= lb.y1 - 14) continue;
            if (Math.abs(e.y - r0.y2) < 1) e.x = lb.x1 - 14;
            else e.y = lb.y1 - 14;
          }
        }
      }
      // keep markers on one edge apart
      edge.sort((p, q) => p.a - q.a);
      for (let i = 1; i < edge.length; i++) {
        const p = edge[i - 1]!;
        const q = edge[i]!;
        if (Math.hypot(q.x - p.x, q.y - p.y) < 24) {
          const alongX = Math.abs(q.y - r0.y1) < 1 || Math.abs(q.y - r0.y2) < 1;
          if (alongX) q.x = Math.min(r0.x2, p.x + 24);
          else q.y = Math.min(r0.y2, p.y + 24);
        }
      }
      for (const e of edge) {
        e.x = Math.min(r0.x2, Math.max(r0.x1, e.x));
        e.y = Math.min(r0.y2, Math.max(r0.y1, e.y));
        const deg = (e.a * 180) / Math.PI + 90;
        const isHot = e.b.id === hot;
        marks.push(
          <g
            key={`edge-${e.b.id}`}
            className={`mk edge${isHot ? ' hot' : ''}`}
            transform={`translate(${e.x.toFixed(1)},${e.y.toFixed(1)})`}
            onPointerDown={onDown}
            onPointerEnter={() => setPinHover(e.b.id)}
            onPointerLeave={() => setPinHover((h) => (h === e.b.id ? '' : h))}
            onClick={(ev) => isClick(ev) && onSelect(e.b.id)}
          >
            <path d="M0,-19 L6,-10 L-6,-10 Z" transform={`rotate(${deg})`} fill={ERAS[e.b.era].color} />
            <circle r={10} fill={ERAS[e.b.era].color} />
            <text y={4} textAnchor="middle">
              {CITY_NO.get(e.b.id) ?? ''}
            </text>
            <title>{e.b.name}</title>
          </g>,
        );
      }
    }
    if (selected && !detail) {
      const [x, y] = proj(selected.lng, selected.lat);
      if (inView(x, y)) {
        marks.push(
          <g key="sel" className="sel-mark" transform={`translate(${x},${y})`}>
            <circle r={18} fill={ERAS[selected.era].color} opacity={0.2} />
            <circle r={10} fill="#fff" stroke="#000" strokeWidth={3} />
            <circle r={5.5} fill={ERAS[selected.era].color} />
          </g>,
        );
      }
    }

    let tipEl: React.ReactNode = null;
    if (tip && !detail) {
      const [x, y] = proj(tip.lng, tip.lat);
      const r = donutRadius(tip.items.length);
      const parts = [...tip.cities.entries()].sort((a, b) => b[1] - a[1]);
      tipEl = (
        <div className="map-tip" style={{ left: Math.min(x + r + 10, W - 250), top: y + r + 4 }}>
          {parts.slice(0, 3).map(([k, v]) => (
            <span key={k}>
              <b>{k}</b> {v}
            </span>
          ))}
          {parts.length > 3 && <span>+{parts.slice(3).reduce((n, [, v]) => n + v, 0)}</span>}
        </div>
      );
    }

    overlay = createPortal(
      <>
        <svg className="overlay" width={W} height={H}>
          {leaders}
          {marks}
          {hits}
          {labels}
        </svg>
        {tipEl}
      </>,
      layer,
    );
  }

  // Scale bar: the longest round length that fits in 110 px
  let scale: { label: string; px: number } | null = null;
  if (map) {
    const lat = map.getCenter().lat;
    const mpp = (40075016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** zoom);
    const nice = [5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000, 1000000, 2000000];
    const m = [...nice].reverse().find((n) => n / mpp <= 110) ?? 5;
    scale = { label: m >= 1000 ? `${m / 1000} km` : `${m} m`, px: m / mpp };
  }

  // Locator, always shown: where the view (and the open building) sits on the map of Europe, or of the
  // world when the view is outside Europe
  let inset: React.ReactNode = null;
  // Only while zoomed in past country scale: at the full map or a whole country it adds nothing
  if (map && showLoc) {
    const ctr = map.getCenter();
    const world = !(ctr.lng > -25 && ctr.lng < 45 && ctr.lat > 30 && ctr.lat < 72);
    const lw = L.w;
    const lh = L.h;
    const loc = locator(world, lw, lh);
    const bb = map.getBounds();
    const a = loc.pr([Math.max(-179, bb.getWest()), Math.min(84, bb.getNorth())]);
    const c = loc.pr([Math.min(179, bb.getEast()), Math.max(-84, bb.getSouth())]);
    const placeRef = selected ?? (insetCity ? CITY_BUILDINGS.get(insetCity)?.[0] : undefined);
    const here = placeRef ? loc.pr([placeRef.lng, placeRef.lat]) : null;
    const rw = a && c ? c[0] - a[0] : 0;
    const rh = a && c ? c[1] - a[1] : 0;
    const cc = loc.pr([ctr.lng, ctr.lat]);
    inset = (
      <div className={`locator${compact ? ' m' : ''}`} style={{ left: lb.x1, top: lb.y1 }} aria-hidden="true">
        <svg width={lw} height={lh}>
          <rect width={lw} height={lh} className="lc-sea" />
          <path d={loc.land} className="lc-land" />
          {placeRef && <path d={nationPath(placeRef, loc.key, loc.raw)} className="lc-nat" />}
          {a && c && rw >= 8 && rh >= 8 ? (
            <rect x={a[0]} y={a[1]} width={rw} height={rh} className="lc-view" />
          ) : (
            cc && <circle cx={cc[0]} cy={cc[1]} r={6} className="lc-view" />
          )}
          {here && <circle cx={here[0]} cy={here[1]} r={4} className="lc-here" />}
          {(here ?? cc) && placeRef && (
            <text x={Math.min(lw - 6, Math.max(6, (here ?? cc)![0] + 8))} y={Math.max(14, (here ?? cc)![1] - 8)} className="lc-name" textAnchor={(here ?? cc)![0] > lw * 0.6 ? 'end' : 'start'}>
              {placeRef.city}, {placeRef.nation.replace('United States of America', 'United States')}
            </text>
          )}
        </svg>
      </div>
    );
  }

  return (
    <div className="map-box">
      <div ref={box} className="map-canvas" />
      {noMap && (
        <p className="map-fail" role="alert">
          The map needs WebGL, which this browser has turned off. The list, Quiz and Me still work.
        </p>
      )}
      {overlay}
      {inset}
      {compact ? (
        <>
          {scale && (
            // fixed in the lower left corner: an open sheet covers it, it never moves
            <div className="scale" style={{ left: 16, bottom: 24 }}>
              {scale.label}
              <i style={{ width: scale.px }} />
            </div>
          )}
          {foot && <div className="foot m">{foot}</div>}
        </>
      ) : (
        <div className="foot" style={{ left: 16, right: 56 + LOC.d.w + 16 }}>
          {scale && (
            <div className="scale">
              {scale.label}
              <i style={{ width: scale.px }} />
            </div>
          )}
          {foot}
        </div>
      )}
      <div className="ctrls" style={compact ? { right: 12, top: 8 } : { right: 16, bottom: 16 }}>
        {!compact && (
          <>
            <button type="button" aria-label="Zoom in" onClick={() => { btnZoom.current = true; map?.zoomIn({ duration: motion(250) }); }}>
              <Icon name="plus" />
            </button>
            <button type="button" aria-label="Zoom out" onClick={() => { btnZoom.current = true; map?.zoomOut({ duration: motion(250) }); }}>
              <Icon name="minus" />
            </button>
          </>
        )}
        <button type="button" aria-label="Country" title={countryBox ? `Whole country: ${nationName(countryBox.ref)}` : 'Country'} disabled={!countryBox} onClick={() => countryBox && fitCountry(countryBox.box)}>
          {countryBox && nationIcon(countryBox.ref) ? (
            <svg width={18} height={18} viewBox="0 0 18 18" aria-hidden="true" className="nat-ic">
              <path d={nationIcon(countryBox.ref)} />
            </svg>
          ) : (
            <Icon name="flag" />
          )}
        </button>
        <button type="button" aria-label="Full map" title="Full map" onClick={() => (onHome ? onHome() : homeView())}>
          <Icon name="fit" />
        </button>
      </div>
      <div className="credit" style={{ right: compact ? 12 : 64, bottom: 2 }}>
        Natural Earth, OpenFreeMap, OpenMapTiles, OpenStreetMap contributors
      </div>
    </div>
  );
});

export default MapView;

/** Name for a circle: the city, or "<largest city> area" when it holds several cities */
function clusterName(c: Cluster): string {
  return c.cities.size === 1 ? c.name : `${c.name} area`;
}

function Donut({ items, r }: { items: Building[]; r: number }) {
  const ring = 6;
  const parts = ERA_ORDER.map((e) => [e, items.filter((b) => b.era === e).length] as const).filter(([, n]) => n > 0);
  const total = items.length;
  if (parts.length === 1) {
    return (
      <>
        <circle r={r - ring / 2} fill="none" stroke={ERAS[parts[0]![0]].color} strokeWidth={ring} />
        <circle r={r - ring} fill="#fff" />
      </>
    );
  }
  let a0 = -Math.PI / 2;
  const P = (a: number, rr: number) => `${(Math.cos(a) * rr).toFixed(2)},${(Math.sin(a) * rr).toFixed(2)}`;
  return (
    <>
      {parts.map(([e, n]) => {
        const a1 = a0 + (n / total) * Math.PI * 2;
        const large = a1 - a0 > Math.PI ? 1 : 0;
        const d = `M${P(a0, r)} A${r},${r} 0 ${large} 1 ${P(a1, r)} L${P(a1, r - ring)} A${r - ring},${r - ring} 0 ${large} 0 ${P(a0, r - ring)} Z`;
        a0 = a1;
        return <path key={e} d={d} fill={ERAS[e].color} stroke="#fff" strokeWidth={1} />;
      })}
      <circle r={r - ring} fill="#fff" />
    </>
  );
}

function CityLabel({ x, y, text }: { x: number; y: number; text: string }) {
  return (
    <g className="city-lbl">
      <text x={x} y={y} className="halo">
        {text}
      </text>
      <text x={x} y={y}>
        {text}
      </text>
    </g>
  );
}

interface Box {
  x1: number;
  x2: number;
  y1: number;
  y2: number;
}

let measureCtx: CanvasRenderingContext2D | null = null;
type LabelKind = 'strong' | 'soft' | 'city';
const FONT: Record<LabelKind, [number, number]> = { strong: [750, 13.5], soft: [500, 11], city: [600, 12] };

function textWidth(text: string, kind: LabelKind | boolean): number {
  const k: LabelKind = kind === true ? 'strong' : kind === false ? 'city' : kind;
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
  if (!measureCtx) return text.length * 7;
  measureCtx.font = `${FONT[k][0]} ${FONT[k][1]}px "Archivo Variable", "Noto Sans TC", sans-serif`;
  return measureCtx.measureText(text).width;
}

function placeLabel(x: number, y: number, text: string, kind: LabelKind, placed: Box[], area: Box, gap = 12) {
  const fs = FONT[kind][1];
  const tw = textWidth(text, kind);
  const cands: [number, number, 'start' | 'end' | 'middle'][] = [
    [gap, 4, 'start'], [-gap, 4, 'end'], [0, -gap - 2, 'middle'], [0, gap + 10, 'middle'], [gap - 2, -gap + 3, 'start'], [-gap + 2, -gap + 3, 'end'], [gap - 2, gap + 4, 'start'], [-gap + 2, gap + 4, 'end'],
  ];
  for (const [dx, dy, anchor] of cands) {
    const x1 = anchor === 'start' ? x + dx : anchor === 'end' ? x + dx - tw : x - tw / 2;
    const b = { x1: x1 - 3, x2: x1 + tw + 3, y1: y + dy - fs, y2: y + dy + 4 };
    if (b.x1 < area.x1 || b.x2 > area.x2 || b.y1 < area.y1 || b.y2 > area.y2) continue;
    if (placed.some((o) => !(b.x2 < o.x1 || b.x1 > o.x2 || b.y2 < o.y1 || b.y1 > o.y2))) continue;
    placed.push(b);
    return { x: x1, y: y + dy, w: tw };
  }
  return null;
}

/** Name of the open building where no free spot is left: right of the pin, kept inside the area */
function forceLabel(x: number, y: number, text: string, area: Box, placed: Box[]) {
  const tw = textWidth(text, 'strong');
  const x1 = Math.max(area.x1 + 3, x + 15 + tw + 3 > area.x2 ? x - 15 - tw : x + 15);
  placed.push({ x1: x1 - 6, x2: x1 + tw + 6, y1: y - 11, y2: y + 10 });
  return { x: x1, y: y + 4, w: tw };
}

function PlaceLabel({ x, y, w, text, strong }: { x: number; y: number; w: number; text: string; strong: boolean }) {
  if (strong) {
    return (
      <g className="place-lbl strong">
        <rect x={x - 6} y={y - 15} width={w + 12} height={21} />
        <text x={x} y={y}>
          {text}
        </text>
      </g>
    );
  }
  return (
    <g className="place-lbl soft">
      <text x={x} y={y} className="halo">
        {text}
      </text>
      <text x={x} y={y}>
        {text}
      </text>
    </g>
  );
}


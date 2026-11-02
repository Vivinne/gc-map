'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import maplibregl, { type CircleLayerSpecification, type GeoJSONSource, type Map as MLMap, type SymbolLayerSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { CITY_TOP_ZOOM, POLAR_LAT, SAME_SPOT_ZOOM, FULL_MAP_CENTER, FULL_MAP_MPP, SCALE_1KM_MPP, densestCenter, avoidObstacles, distanceM, edgeMarkersExpanding, isSameSpot, viewContainsPoint, zoomForMetersPerPixel, type CityCollection, type EdgeMarker, type LngLatBounds, type PointCollection } from '../lib/geo';

// OpenFreeMap: no API key or sign-up needed; keep the attribution at the bottom-right of the basemap
/** Zoom levels the map zooms out when the building panel is closed */
/** Zoom levels per click on the + / - buttons (2 = four times the scale) */
const ZOOM_BUTTON_STEP = 2;
const CLOSE_ZOOM_OUT = 0.7;
const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
const SOURCE = 'places';
/** One numbered point per city; drawn below the city zoom, the single markers above it */
const CITY_SOURCE = 'cities';
/** City circle radius (px, fixed); circles whose centres are closer than the diameter overlap, so they are merged (counts summed) */
const CITY_RADIUS = 15;
/** Circles stand for at least this many buildings; fewer are drawn as their own coloured dots (overlapping is fine) */
const MIN_NUMBER = 5;
/** Earlier views kept for the back button */
const HISTORY_MAX = 30;
/** Margin kept around the union of a merged circle, as a share of the shorter map side (about 20%, like the Veneto view the user pointed at) */
const UNION_PAD = 0.2;
const CITY_MERGE_PX = CITY_RADIUS * 2 + 4;

const INK = '#111827';
type GeoData = Parameters<GeoJSONSource['setData']>[0];


export type FocusTarget =
  | { kind: 'point'; lng: number; lat: number; /** The view shows this many km around the point (along the shorter map side) */ radiusKm: number; nonce: number }
  | { kind: 'bounds'; bounds: [[number, number], [number, number]]; blendWith?: [[number, number], [number, number]]; /** Fit exactly these bounds with almost no margin */ exact?: boolean; /** The building panel was open and is closing: end CLOSE_ZOOM_OUT levels farther out */ shrink?: boolean; /** First view after loading the page: jump there, no animation, not a Back step */ initial?: boolean; nonce: number };

interface Props {
  /** Hide the direction buttons for buildings outside the view */
  hideEdges?: boolean;
  fc: PointCollection;
  /** Currently selected building id; empty string = none */
  selectedPid: string;
  /** One feature per city with the number of visible buildings in it */
  cities: CityCollection;
  /** Bounding box of the currently visible buildings; null = no points */
  bounds: [[number, number], [number, number]] | null;
  focus: FocusTarget | null;
  /** The container must be re-measured when the mobile tab switches */
  active: boolean;
  /** Marker clicked: returns all building ids at that spot (several can share a coordinate) */
  onPick: (pids: string[]) => void;
  /** The Back button was used: the parent closes the building panel */
  onBack?: () => void;
  /** A number click moved the view away from the selected building: the parent closes its panel */
  onDeselect?: () => void;
}

export default function MapView({ hideEdges = false, fc, cities, selectedPid, bounds, focus, active, onPick, onBack, onDeselect }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState('');
  const history = useRef<{ center: [number, number]; zoom: number }[]>([]);
  const [canBack, setCanBack] = useState(false);
  const [edges, setEdges] = useState<EdgeMarker[]>([]);

  // Event handlers must read the latest values; use refs to avoid rebinding
  const latest = useRef({ fc, cities, selectedPid, onPick, onDeselect });
  useEffect(() => {
    latest.current = { fc, cities, selectedPid, onPick, onDeselect };
  });

  // Back button history: the view as it was before each click that moves the map (a map click, a list selection, Full map); wheel zooming and panning are not recorded
  const pushView = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const c = map.getCenter();
    const v = { center: [c.lng, c.lat] as [number, number], zoom: map.getZoom() };
    const last = history.current.at(-1);
    if (last && Math.abs(last.zoom - v.zoom) < 0.01 && Math.abs(last.center[0] - v.center[0]) < 1e-6 && Math.abs(last.center[1] - v.center[1]) < 1e-6) return;
    history.current.push(v);
    if (history.current.length > HISTORY_MAX) history.current.shift();
    setCanBack(true);
  }, []);
  const pushRef = useRef(pushView);
  pushRef.current = pushView;

  // A number (city circle or direction button) moves the view to centre/zoom: when the new view no longer shows the selected building, its panel closes
  // (without the extra zoom-out of a plain close)
  const easeAway = (center: [number, number], zoom: number) => {
    const map = mapRef.current;
    if (!map) return;
    const sel = latest.current.selectedPid;
    if (sel) {
      const el = map.getContainer();
      const pts = latest.current.fc.features.filter((f) => f.properties.pid === sel);
      const visible = pts.some((f) => viewContainsPoint({ lng: center[0], lat: center[1] }, zoom, el.clientWidth, el.clientHeight, { lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }));
      if (pts.length && !visible) {
        keepView.current = true;
        latest.current.onDeselect?.();
      }
    }
    map.easeTo({ center, zoom, duration: 600 });
  };
  const easeAwayRef = useRef(easeAway);
  easeAwayRef.current = easeAway;

  // Create the map (once only)
  useEffect(() => {
    if (!box.current) return;
    const map = new maplibregl.Map({
      container: box.current,
      style: STYLE_URL,
      center: [12.5, 43.5],
      zoom: 4.2,
      attributionControl: false, // the credit line below the map carries the attribution
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    // The + / - buttons move ZOOM_BUTTON_STEP levels per click (the built-in control moves one)
    map.getContainer()?.addEventListener?.('click', (ev) => {
      const t = ev.target as Element | null;
      const dir = t?.closest?.('.maplibregl-ctrl-zoom-in') ? 1 : t?.closest?.('.maplibregl-ctrl-zoom-out') ? -1 : 0;
      if (!dir) return;
      ev.stopPropagation();
      map.easeTo({ zoom: map.getZoom() + dir * ZOOM_BUTTON_STEP, duration: 350 });
    }, true);
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: 'metric' }), 'bottom-left');

    map.on('error', (e) => {
      const msg = e.error?.message ?? '';
      // A single tile or font failure is not fatal; only warn when the style itself fails to load
      if (/style|tiles\.openfreemap|Failed to fetch|NetworkError/i.test(msg)) setErr('Basemap failed to load; check your network connection (marker data is unaffected).');
    });

    // Cities outside the view (while city numbers are hidden, i.e. zoomed in): one marker per direction on the view edge with its building count
    let raf = 0;
    const updateEdges = () => {
      raf = 0;
      if (map.getZoom() < CITY_TOP_ZOOM) return setEdges((e) => (e.length ? [] : e));
      const el = map.getContainer();
      const w = el.clientWidth;
      const h = el.clientHeight;
      const mc = map.getCenter();
      const items = latest.current.cities.features.map((f) => {
        const p = map.project(f.geometry.coordinates);
        const dist = distanceM({ lng: mc.lng, lat: mc.lat }, { lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] });
        return { key: f.properties.city, n: f.properties.n, x: p.x, y: p.y, dist };
      });
      // Cities within 150 km first; when none is outside the view, the limit doubles (300, 600 km ...) until one is found
      // Direction buttons stay clear of the page buttons (menu, Full map, Back) and of the tag panel
      const o = el.getBoundingClientRect();
      const obstacles = Array.from(document.querySelectorAll('.menu-btn, .fullmap, .map-back, .side')).map((n) => {
        const r = n.getBoundingClientRect();
        return { x: r.left - o.left, y: r.top - o.top, w: r.width, h: r.height };
      });
      setEdges(avoidObstacles(edgeMarkersExpanding(items, w, h), obstacles, w, h));
    };
    const scheduleEdges = () => {
      if (!raf) raf = requestAnimationFrame(updateEdges);
    };
    map.on('move', scheduleEdges);
    map.on('load', scheduleEdges);

    map.on('load', () => {
      // No polar regions. Set after load, with longitude just inside ±180: MapLibre 5.6 crashes (null centre) when maxBounds is in the constructor or is exactly ±180
      try { map.setMaxBounds([[-179.9, -POLAR_LAT], [179.9, POLAR_LAT]]); } catch { /* keep the map usable without the limit */ }
      map.addSource(SOURCE, { type: 'geojson', data: latest.current.fc as unknown as GeoData });
      const dot: NonNullable<CircleLayerSpecification['paint']> = {
        'circle-color': ['get', 'color'],
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 5, 10, 7, 15, 10],
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff',
        // Memory estimates (unverified) are semi-transparent
        'circle-opacity': ['case', ['get', 'est'], 0.5, 1],
        'circle-stroke-opacity': ['case', ['get', 'est'], 0.5, 1],
      };
      const cityPaint: NonNullable<CircleLayerSpecification['paint']> = {
        'circle-color': INK,
        'circle-radius': CITY_RADIUS,
        'circle-stroke-width': 3,
        'circle-stroke-color': '#ffffff',
      };
      const countLayout: NonNullable<SymbolLayerSpecification['layout']> = { 'text-field': ['to-string', ['get', 'n']], 'text-font': ['Noto Sans Bold'], 'text-size': 13, 'text-allow-overlap': true };
      map.addLayer({ id: 'points', type: 'circle', source: SOURCE, minzoom: CITY_TOP_ZOOM, paint: dot });
      // Below the switch zoom: markers of the circles with fewer than MIN_NUMBER buildings (list kept up to date by refreshFew)
      map.addLayer({ id: 'points-few', type: 'circle', source: SOURCE, maxzoom: CITY_TOP_ZOOM, filter: ['in', ['get', 'pid'], ['literal', []]], paint: dot });
      // Nearby cities merge into one circle (count summed, bounds united) so circles never overlap
      map.addSource(CITY_SOURCE, {
        type: 'geojson',
        data: latest.current.cities as unknown as GeoData,
        cluster: true,
        clusterRadius: CITY_MERGE_PX,
        clusterMaxZoom: Math.ceil(CITY_TOP_ZOOM),
        clusterProperties: {
          n: ['+', ['get', 'n']],
          w: ['min', ['get', 'w']], s: ['min', ['get', 's']], e: ['max', ['get', 'e']], nn: ['max', ['get', 'nn']],
          xw: ['min', ['get', 'xw']], xs: ['min', ['get', 'xs']], xe: ['max', ['get', 'xe']], xn: ['max', ['get', 'xn']],
        },
      });
      map.addLayer({ id: 'cities', type: 'circle', source: CITY_SOURCE, maxzoom: CITY_TOP_ZOOM, filter: ['>=', ['get', 'n'], MIN_NUMBER], layout: { 'circle-sort-key': ['-', 0, ['get', 'n']] }, paint: cityPaint });
      map.addLayer({ id: 'city-count', type: 'symbol', source: CITY_SOURCE, maxzoom: CITY_TOP_ZOOM, filter: ['>=', ['get', 'n'], MIN_NUMBER], layout: countLayout, paint: { 'text-color': '#ffffff' } });
      map.addLayer({
        id: 'selected',
        type: 'circle',
        source: SOURCE,
        filter: ['==', ['get', 'pid'], latest.current.selectedPid],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 10, 15, 18],
          'circle-color': 'rgba(0,0,0,0)',
          'circle-stroke-width': 3,
          'circle-stroke-color': INK,
        },
      });

      const pickAt = (e: { point: { x: number; y: number } }) => {
        const { x, y } = e.point;
        const hits = map.queryRenderedFeatures(
          [
            [x - 10, y - 10],
            [x + 10, y + 10],
          ],
          { layers: ['points', 'points-few'] },
        );
        if (!hits.length) return;
        // A click on a marker shows that building; when markers overlap, the one nearest to the click is picked (the first listed when they share a spot)
        let best = hits[0];
        let bestD = Infinity;
        for (const h of hits) {
          const c = (h.geometry as { coordinates?: [number, number] } | undefined)?.coordinates;
          if (!c) continue;
          const px = map.project(c);
          const d = Math.hypot(px.x - x, px.y - y);
          if (d < bestD) {
            bestD = d;
            best = h;
          }
        }
        latest.current.onPick([String(best?.properties?.pid)]);
      };
      map.on('click', 'points', pickAt);
      map.on('click', 'points-few', pickAt);

      // City click: zoom so that every building of the city is in view and drawn on its own
      const cityClick = (e: { point: { x: number; y: number } }) => {
        const moveTo = (center: [number, number], zoom: number) => easeAwayRef.current(center, zoom);
        const hit = map.queryRenderedFeatures([e.point.x, e.point.y] as unknown as [number, number], { layers: ['cities'] })[0];
        const pr = hit?.properties;
        if (!pr) return;
        const merged = pr.cluster === true || pr.cluster === 'true';
        // A merged circle shows the union of its cities plus the region-place markers attached to them; a single city only its buildings
        const b: LngLatBounds = merged ? [[Number(pr.xw), Number(pr.xs)], [Number(pr.xe), Number(pr.xn)]] : [[Number(pr.w), Number(pr.s)], [Number(pr.e), Number(pr.nn)]];
        pushRef.current();
        if (isSameSpot(b)) {
          // Identical coordinates cannot be told apart by zooming: several buildings -> one of them (the first) is shown; a single building -> the deepest zoom
          const pids = pr.pids ? (JSON.parse(String(pr.pids)) as string[]) : [];
          if (pids.length > 1) latest.current.onPick([pids[0] as string]);
          else moveTo([b[0][0], b[0][1]], SAME_SPOT_ZOOM);
          return;
        }
        // A number was clicked: go to the middle of the most crowded group of its buildings, at a scale of 1 km on the scale bar
        const goDensest = (pids: string[]) => {
          const set = new Set(pids);
          const pts = latest.current.fc.features.filter((f) => set.has(f.properties.pid)).map((f) => ({ lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }));
          const c = densestCenter(pts) ?? { lng: (b[0][0] + b[1][0]) / 2, lat: (b[0][1] + b[1][1]) / 2 };
          moveTo([c.lng, c.lat], Math.min(17, zoomForMetersPerPixel(c.lat, SCALE_1KM_MPP)));
        };
        const pidsOf = (v: unknown): string[] => {
          try {
            return JSON.parse(String(v ?? '[]')) as string[];
          } catch {
            return [];
          }
        };
        if (!merged) return goDensest(pidsOf(pr.pids));
        const src = map.getSource(CITY_SOURCE) as GeoJSONSource | undefined;
        if (!src) return goDensest([]);
        src.getClusterLeaves(Number(pr.cluster_id), 1000, 0).then((ls) => goDensest(ls.flatMap((l) => pidsOf((l.properties as Record<string, unknown> | null)?.pids)))).catch(() => goDensest([]));
      };
      map.on('click', 'cities', cityClick);
      for (const id of ['cities', 'points', 'points-few']) {
        map.on('mouseenter', id, () => (map.getCanvas().style.cursor = 'pointer'));
        map.on('mouseleave', id, () => (map.getCanvas().style.cursor = ''));
      }
      // Circles that would show fewer than MIN_NUMBER buildings are not drawn: their buildings appear as coloured dots instead
      let fewKey = '';
      const refreshFew = async () => {
        const src = map.getSource(CITY_SOURCE) as GeoJSONSource | undefined;
        if (!src) return;
        const feats = map.querySourceFeatures(CITY_SOURCE, { filter: ['<', ['get', 'n'], MIN_NUMBER] });
        const pids = new Set<string>();
        const add = (pr: Record<string, unknown> | null | undefined) => {
          for (const k of ['pids', 'vpids']) for (const id of JSON.parse(String(pr?.[k] ?? '[]')) as string[]) pids.add(id);
        };
        const jobs: Promise<void>[] = [];
        for (const f of feats) {
          const pr = f.properties as Record<string, unknown>;
          if (pr.cluster === true || pr.cluster === 'true') jobs.push(src.getClusterLeaves(Number(pr.cluster_id), 50, 0).then((ls) => ls.forEach((l) => add(l.properties as Record<string, unknown>))));
          else add(pr);
        }
        await Promise.all(jobs).catch(() => undefined);
        const list = [...pids].sort();
        const key = list.join('|');
        if (key === fewKey) return;
        fewKey = key;
        map.setFilter('points-few', ['in', ['get', 'pid'], ['literal', list]]);
      };
      map.on('idle', () => {
        void refreshFew();
      });
      setReady(true);
    });

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(box.current);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, []);

  // Data update
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    (map.getSource(SOURCE) as GeoJSONSource | undefined)?.setData(fc as unknown as GeoData);
    (map.getSource(CITY_SOURCE) as GeoJSONSource | undefined)?.setData(cities as unknown as GeoData);
  }, [fc, cities, ready]);

  // Selection ring
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.setFilter('selected', ['==', ['get', 'pid'], selectedPid]);
  }, [selectedPid, ready]);

  // After filtering, zoom to the visible extent
  const boundsKey = JSON.stringify(bounds);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !bounds) return;
    map.fitBounds(bounds, { padding: 70, maxZoom: 14, duration: 600 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundsKey, ready]);

  // Fly to the given building
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !focus) return;
    const opts = focus as { initial?: boolean; shrink?: boolean };
    if (!opts.initial) pushView();
    const dz = opts.shrink ? CLOSE_ZOOM_OUT : 0;
    const dur = (ms: number) => (opts.initial ? 0 : ms);
    if (focus.kind === 'point') {
      // Zoom so that the view reaches radiusKm from the point along the shorter map side
      const el = map.getContainer();
      const px = Math.max(100, Math.min(el.clientWidth, el.clientHeight));
      const mpp = (focus.radiusKm * 2000) / px;
      const zoom = Math.log2((78271.517 * Math.cos((focus.lat * Math.PI) / 180)) / mpp);
      map.flyTo({ center: [focus.lng, focus.lat], zoom: Math.min(Math.max(zoom, 1), 19), essential: true });
    }
    else if (focus.exact) {
      const cam = map.cameraForBounds(focus.bounds, { padding: 4, maxZoom: 16 });
      if (cam?.center && cam.zoom != null) map.easeTo({ center: cam.center, zoom: Math.max(cam.zoom - dz, 1), duration: dur(700) });
      else map.fitBounds(focus.bounds, { padding: 4, maxZoom: 16, duration: dur(700) });
    }
    else if (focus.blendWith) {
      // Centred on Switzerland, zoomed so that the scale bar reads 500 km
      map.flyTo({ center: FULL_MAP_CENTER, zoom: Math.max(zoomForMetersPerPixel(FULL_MAP_CENTER[1], FULL_MAP_MPP) - dz, 1), essential: true, duration: dur(700) });
    } else map.fitBounds(focus.bounds, { padding: 120, maxZoom: 16, duration: 700 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.nonce, ready]);

  useEffect(() => {
    if (active) mapRef.current?.resize();
  }, [active]);

  // The building panel was closed (X, Escape, ...): the map zooms out a little. Back and Full map move the map themselves and end CLOSE_ZOOM_OUT levels farther out
  const prevSel = useRef(selectedPid);
  const seenNonce = useRef<number | undefined>(focus?.nonce);
  const keepView = useRef(false);
  useEffect(() => {
    const was = prevSel.current;
    prevSel.current = selectedPid;
    const moved = focus?.nonce !== seenNonce.current;
    seenNonce.current = focus?.nonce;
    const map = mapRef.current;
    const skip = keepView.current || moved;
    keepView.current = false;
    if (!map || !ready || !was || selectedPid || skip) return;
    map.easeTo({ zoom: Math.max(map.getZoom() - CLOSE_ZOOM_OUT, 1), duration: 400 });
  }, [selectedPid, focus?.nonce, ready]);

  // Back to the view before the last zoom
  const goBack = () => {
    const map = mapRef.current;
    const prev = history.current.pop();
    if (!map || !prev) return;
    keepView.current = !!latest.current.selectedPid; // Back restores its own view, a little farther out when it closes the panel
    map.easeTo({ center: prev.center, zoom: Math.max(prev.zoom - (keepView.current ? CLOSE_ZOOM_OUT : 0), 1), duration: 500 });
    setCanBack(history.current.length > 0);
    onBack?.();
  };

  // A direction button: move (zoom unchanged) to the middle of the most crowded group of the city with the most buildings among those merged into that direction
  const goEdge = (keys: string[]) => {
    const map = mapRef.current;
    if (!map) return;
    // When several cities are merged into this direction (18 = 16 + 2), the city with the most buildings wins, even if another one is nearer
    const mine = latest.current.cities.features.filter((f) => keys.includes(f.properties.city));
    const top = mine.reduce<(typeof mine)[number] | undefined>((t, f) => (!t || f.properties.n > t.properties.n ? f : t), undefined);
    if (!top) return;
    const set = new Set<string>(JSON.parse(top.properties.pids) as string[]);
    const pts = latest.current.fc.features.filter((f) => set.has(f.properties.pid)).map((f) => ({ lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }));
    const c = densestCenter(pts);
    if (!c) return;
    pushRef.current();
    easeAway([c.lng, c.lat], map.getZoom());
  };

  return (
    <>
      <div ref={box} className="map" data-testid="map" />
      {!hideEdges && edges.map((m) => (
        <button key={m.key} type="button" className="edge-dot" data-testid="edge-dot" style={{ left: m.x, top: m.y }} aria-label={`${m.n} buildings in this direction`} onClick={() => goEdge(m.keys)}>
          {m.n}
        </button>
      ))}
      <button type="button" className="map-back" data-testid="map-back" aria-label="Back to the previous view" title="Previous view" disabled={!canBack} onClick={goBack}>
        &lt; Back
      </button>
      {err && <div className="map-note" role="status">{err}</div>}
    </>
  );
}

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import maplibregl, { type CircleLayerSpecification, type GeoJSONSource, type Map as MLMap, type SymbolLayerSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { CITY_TOP_ZOOM, POLAR_LAT, SAME_SPOT_ZOOM, FULL_MAP_CENTER, FULL_MAP_MPP, SCALE_1KM_MPP, densestCenter, distanceM, edgeMarkersExpanding, isSameSpot, zoomForMetersPerPixel, type CityCollection, type EdgeMarker, type LngLatBounds, type PointCollection } from '../lib/geo';

// OpenFreeMap: no API key or sign-up needed; keep the attribution at the bottom-right of the basemap
/** Zoom levels the map zooms out when the building panel is closed */
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
const FOOTPRINT_SOURCE = 'footprint';
type GeoData = Parameters<GeoJSONSource['setData']>[0];
const EMPTY_FC = { type: 'FeatureCollection', features: [] } as const;

type Ring = number[][];
type Geom = { type: string; coordinates: unknown };
/** Polygons of a (Multi)Polygon as [outer ring, ...holes] */
const polygonsOf = (g: Geom): Ring[][] => (g.type === 'Polygon' ? [g.coordinates as Ring[]] : g.type === 'MultiPolygon' ? (g.coordinates as Ring[][]) : []);
const ringHas = (ring: Ring, x: number, y: number): boolean => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i] as [number, number];
    const [xj, yj] = ring[j] as [number, number];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
/** The point is inside a polygon's outer ring and not inside one of its holes (courtyards) */
const coversPoint = (g: Geom, x: number, y: number): boolean => polygonsOf(g).some(([outer, ...holes]) => !!outer && ringHas(outer, x, y) && !holes.some((h) => ringHas(h, x, y)));
const ringArea = (ring: Ring, lat: number): number => {
  const kx = 111320 * Math.cos((lat * Math.PI) / 180);
  const ky = 110574;
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ((ring[j]![0]! * kx) * (ring[i]![1]! * ky)) - ((ring[i]![0]! * kx) * (ring[j]![1]! * ky));
  return Math.abs(a) / 2;
};
const geomArea = (g: Geom, lat: number): number => polygonsOf(g).reduce((n, [outer, ...holes]) => n + (outer ? ringArea(outer, lat) : 0) - holes.reduce((m, h) => m + ringArea(h, lat), 0), 0);
/** A single building is never larger than this; anything bigger is a block, campus or land-use shape, not the building itself */
const MAX_FOOTPRINT_M2 = 150000;

export type FocusTarget =
  | { kind: 'point'; lng: number; lat: number; /** The view shows this many km around the point (along the shorter map side) */ radiusKm: number; nonce: number }
  | { kind: 'bounds'; bounds: [[number, number], [number, number]]; blendWith?: [[number, number], [number, number]]; /** Fit exactly these bounds with almost no margin */ exact?: boolean; nonce: number };

interface Props {
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
}

export default function MapView({ fc, cities, selectedPid, bounds, focus, active, onPick, onBack }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState('');
  const history = useRef<{ center: [number, number]; zoom: number }[]>([]);
  const [canBack, setCanBack] = useState(false);
  const [edges, setEdges] = useState<EdgeMarker[]>([]);

  // Event handlers must read the latest values; use refs to avoid rebinding
  const latest = useRef({ fc, cities, selectedPid, onPick });
  useEffect(() => {
    latest.current = { fc, cities, selectedPid, onPick };
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

  // Create the map (once only)
  useEffect(() => {
    if (!box.current) return;
    const map = new maplibregl.Map({
      container: box.current,
      style: STYLE_URL,
      center: [12.5, 43.5],
      zoom: 4.2,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
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
      setEdges(edgeMarkersExpanding(items, w, h));
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
      // Figure ground: the basemap footprint of the selected building, filled with its style colour
      map.addSource(FOOTPRINT_SOURCE, { type: 'geojson', data: EMPTY_FC as unknown as GeoData });
      map.addLayer({ id: 'footprint', type: 'fill', source: FOOTPRINT_SOURCE, paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.9 } });
      map.addLayer({ id: 'footprint-line', type: 'line', source: FOOTPRINT_SOURCE, paint: { 'line-color': INK, 'line-width': 2 } });
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
          else map.easeTo({ center: [b[0][0], b[0][1]], zoom: SAME_SPOT_ZOOM, duration: 600 });
          return;
        }
        // A number was clicked: go to the middle of the most crowded group of its buildings, at a scale of 1 km on the scale bar
        const goDensest = (pids: string[]) => {
          const set = new Set(pids);
          const pts = latest.current.fc.features.filter((f) => set.has(f.properties.pid)).map((f) => ({ lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }));
          const c = densestCenter(pts) ?? { lng: (b[0][0] + b[1][0]) / 2, lat: (b[0][1] + b[1][1]) / 2 };
          map.easeTo({ center: [c.lng, c.lat], zoom: Math.min(17, zoomForMetersPerPixel(c.lat, SCALE_1KM_MPP)), duration: 600 });
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
      // The footprint comes from the basemap's building polygons that are drawn at the selected point; tiles may still be loading, so this retries on idle
      let footKey = '';
      const refreshFootprint = () => {
        const src = map.getSource(FOOTPRINT_SOURCE) as GeoJSONSource | undefined;
        if (!src) return;
        const sel = latest.current.selectedPid;
        const pts = sel ? latest.current.fc.features.filter((f) => f.properties.pid === sel) : [];
        const layers = (map.getStyle()?.layers ?? []).filter((l) => (l as { 'source-layer'?: string })['source-layer'] === 'building').map((l) => l.id);
        const out: { type: 'Feature'; geometry: Geom; properties: { color: string } }[] = [];
        if (layers.length) {
          for (const f of pts) {
            const [lng, lat] = f.geometry.coordinates;
            const px = map.project([lng, lat]);
            // Only the basemap building polygons that contain the point itself (not their neighbours); courtyards (holes) do not count; oversized shapes are skipped
            const hits = map.queryRenderedFeatures([[px.x - 2, px.y - 2], [px.x + 2, px.y + 2]], { layers }).filter((h) => {
              const g = h.geometry as Geom;
              return coversPoint(g, lng, lat) && geomArea(g, lat) <= MAX_FOOTPRINT_M2;
            });
            for (const h of hits) out.push({ type: 'Feature', geometry: h.geometry as Geom, properties: { color: f.properties.color } });
          }
        }
        const key = sel + '|' + JSON.stringify(out.map((o) => o.geometry));
        if (key === footKey) return;
        footKey = key;
        src.setData({ type: 'FeatureCollection', features: out } as unknown as GeoData);
      };
      map.on('idle', () => {
        void refreshFew();
        refreshFootprint();
      });
      map.on('moveend', refreshFootprint);
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
    pushView();
    if (focus.kind === 'point') {
      // Zoom so that the view reaches radiusKm from the point along the shorter map side
      const el = map.getContainer();
      const px = Math.max(100, Math.min(el.clientWidth, el.clientHeight));
      const mpp = (focus.radiusKm * 2000) / px;
      const zoom = Math.log2((78271.517 * Math.cos((focus.lat * Math.PI) / 180)) / mpp);
      map.flyTo({ center: [focus.lng, focus.lat], zoom: Math.min(Math.max(zoom, 1), 19), essential: true });
    }
    else if (focus.exact) map.fitBounds(focus.bounds, { padding: 4, maxZoom: 16, duration: 700 });
    else if (focus.blendWith) {
      // Centred on Switzerland, zoomed so that the scale bar reads 500 km
      map.flyTo({ center: FULL_MAP_CENTER, zoom: zoomForMetersPerPixel(FULL_MAP_CENTER[1], FULL_MAP_MPP), essential: true, duration: 700 });
    } else map.fitBounds(focus.bounds, { padding: 120, maxZoom: 16, duration: 700 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.nonce, ready]);

  useEffect(() => {
    if (active) mapRef.current?.resize();
  }, [active]);

  // The building panel was closed (X, Escape, Back, Full map, ...): the map zooms out a little, unless the same change moved the map itself (Full map, Back)
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
    keepView.current = !!latest.current.selectedPid; // Back restores its own view; no extra zoom-out for the panel it closes
    map.easeTo({ center: prev.center, zoom: prev.zoom, duration: 500 });
    setCanBack(history.current.length > 0);
    onBack?.();
  };

  const goEdge = (key: string) => {
    const map = mapRef.current;
    const f = latest.current.cities.features.find((c) => c.properties.city === key);
    if (!map || !f) return;
    const set = new Set(JSON.parse(f.properties.pids) as string[]);
    const c = map.getCenter();
    let best: [number, number] = f.geometry.coordinates;
    let bd = Infinity;
    for (const p of latest.current.fc.features) {
      if (!set.has(p.properties.pid)) continue;
      const q = p.geometry.coordinates;
      const d = Math.hypot(q[0] - c.lng, q[1] - c.lat);
      if (d < bd) {
        bd = d;
        best = q;
      }
    }
    pushRef.current();
    map.easeTo({ center: best, duration: 600 });
  };

  return (
    <>
      <div ref={box} className="map" data-testid="map" />
      {edges.map((m) => (
        <button key={m.key} type="button" className="edge-dot" data-testid="edge-dot" style={{ left: m.x, top: m.y }} aria-label={`${m.n} buildings in this direction`} onClick={() => goEdge(m.key)}>
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

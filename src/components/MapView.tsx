'use client';

import { useEffect, useRef, useState } from 'react';
import maplibregl, { type GeoJSONSource, type Map as MLMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { CITY_TOP_ZOOM, SAME_SPOT_ZOOM, boundsOfCoords, cityClickZoom, coordKey, isSameSpot, type CityCollection, type LngLatBounds, type PointCollection } from '../lib/geo';

// OpenFreeMap: no API key or sign-up needed; keep the attribution at the bottom-right of the basemap
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
const EMPTY_FC = { type: 'FeatureCollection', features: [] } as const;

type Ring = number[][];
type Geom = { type: string; coordinates: unknown };
/** Outer rings of a (Multi)Polygon */
const outerRings = (g: Geom): Ring[] => (g.type === 'Polygon' ? [(g.coordinates as Ring[])[0] as Ring] : g.type === 'MultiPolygon' ? (g.coordinates as Ring[][]).map((p) => p[0] as Ring) : []);
const ringHas = (ring: Ring, x: number, y: number): boolean => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i] as [number, number];
    const [xj, yj] = ring[j] as [number, number];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

// Taken from MapLibre's own types, to avoid depending on the global namespace of @types/geojson
type GeoData = Parameters<GeoJSONSource['setData']>[0];

export type FocusTarget =
  | { kind: 'point'; lng: number; lat: number; /** The view shows this many km around the point (along the shorter map side) */ radiusKm: number; nonce: number }
  | { kind: 'bounds'; bounds: [[number, number], [number, number]]; blendWith?: [[number, number], [number, number]]; nonce: number };

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
}

export default function MapView({ fc, cities, selectedPid, bounds, focus, active, onPick }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState('');
  const history = useRef<{ center: [number, number]; zoom: number }[]>([]);
  const lastView = useRef<{ center: [number, number]; zoom: number } | null>(null);
  const restoring = useRef(false);
  const [canBack, setCanBack] = useState(false);

  // Event handlers must read the latest values; use refs to avoid rebinding
  const latest = useRef({ fc, cities, selectedPid, onPick });
  useEffect(() => {
    latest.current = { fc, cities, selectedPid, onPick };
  });

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

    // Back button history: remember the view before every notable move (zoom change or a pan of half a screen)
    map.on('moveend', () => {
      const c = map.getCenter();
      const cur = { center: [c.lng, c.lat] as [number, number], zoom: map.getZoom() };
      const prev = lastView.current;
      lastView.current = cur;
      if (restoring.current) {
        restoring.current = false;
        return;
      }
      if (!prev) return; // the first view (the initial fit) is the start of the history
      const span = 360 / 2 ** cur.zoom;
      const moved = Math.max(Math.abs(prev.center[0] - cur.center[0]), Math.abs(prev.center[1] - cur.center[1])) > span * 0.5;
      if (Math.abs(prev.zoom - cur.zoom) < 0.4 && !moved) return;
      history.current.push(prev);
      if (history.current.length > HISTORY_MAX) history.current.shift();
      setCanBack(true);
    });

    map.on('error', (e) => {
      const msg = e.error?.message ?? '';
      // A single tile or font failure is not fatal; only warn when the style itself fails to load
      if (/style|tiles\.openfreemap|Failed to fetch|NetworkError/i.test(msg)) setErr('Basemap failed to load; check your network connection (marker data is unaffected).');
    });

    map.on('load', () => {
      map.addSource(SOURCE, { type: 'geojson', data: latest.current.fc as unknown as GeoData });
      const dot = {
        'circle-color': ['get', 'color'],
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 5, 10, 7, 15, 10],
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff',
        // Memory estimates (unverified) are semi-transparent
        'circle-opacity': ['case', ['get', 'est'], 0.5, 1],
        'circle-stroke-opacity': ['case', ['get', 'est'], 0.5, 1],
      } as const;
      const cityPaint = {
        'circle-color': INK,
        'circle-radius': CITY_RADIUS,
        'circle-stroke-width': 3,
        'circle-stroke-color': '#ffffff',
      } as const;
      const countLayout = { 'text-field': ['to-string', ['get', 'n']], 'text-font': ['Noto Sans Bold'], 'text-size': 13, 'text-allow-overlap': true } as const;
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
        const pids = [...new Set<string>(hits.map((h) => String(h.properties?.pid)))];
        if (!pids.length) return;
        const coords = hits.map((h) => (h.geometry as { coordinates?: [number, number] } | undefined)?.coordinates).filter((c): c is [number, number] => !!c);
        const distinct = new Set(coords.map((c) => coordKey(c[0], c[1])));
        if (pids.length > 1 && distinct.size > 1) {
          // Overlapping dots at different places: zoom to the range that pulls them apart
          const b = boundsOfCoords(coords) as LngLatBounds;
          const cam = map.cameraForBounds(b, { padding: 80, maxZoom: 17 });
          map.easeTo({ center: cam?.center ?? [(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2], zoom: Math.max(cam?.zoom ?? 0, map.getZoom() + 1), duration: 600 });
          return;
        }
        latest.current.onPick(pids);
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
        if (isSameSpot(b)) {
          // Identical coordinates cannot be told apart by zooming: go to the deepest level; several buildings -> the chooser list
          map.easeTo({ center: [b[0][0], b[0][1]], zoom: SAME_SPOT_ZOOM, duration: 600 });
          const pids = pr.pids ? (JSON.parse(String(pr.pids)) as string[]) : [];
          if (pids.length > 1) latest.current.onPick(pids);
          return;
        }
        const el = map.getContainer();
        const pad = merged ? Math.round(Math.min(el.clientWidth, el.clientHeight) * UNION_PAD) : 80;
        const cam = map.cameraForBounds(b, { padding: pad, maxZoom: 17 });
        const center = cam?.center ?? [(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2];
        if (!merged) return map.easeTo({ center, zoom: cityClickZoom(cam?.zoom ?? 0), duration: 600 });
        // Merged circle: show the union of its cities (no minimum zoom, the members may be far apart); always zoom in at least a little
        const zoom = Math.max(cam?.zoom ?? 0, map.getZoom() + 0.5);
        map.easeTo({ center, zoom, duration: 600 });
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
            const hits = map.queryRenderedFeatures([[px.x - 8, px.y - 8], [px.x + 8, px.y + 8]], { layers }).filter((h) => outerRings(h.geometry as Geom).length > 0);
            // Buildings that contain the point; when the coordinate falls just beside one, take those within the small box
            const within = hits.filter((h) => outerRings(h.geometry as Geom).some((r) => ringHas(r, lng, lat)));
            for (const h of within.length ? within : hits) out.push({ type: 'Feature', geometry: h.geometry as Geom, properties: { color: f.properties.color } });
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
    if (focus.kind === 'point') {
      // Zoom so that the view reaches radiusKm from the point along the shorter map side
      const el = map.getContainer();
      const px = Math.max(100, Math.min(el.clientWidth, el.clientHeight));
      const mpp = (focus.radiusKm * 2000) / px;
      const zoom = Math.log2((78271.517 * Math.cos((focus.lat * Math.PI) / 180)) / mpp);
      map.flyTo({ center: [focus.lng, focus.lat], zoom: Math.min(Math.max(zoom, 1), 19), essential: true });
    }
    else if (focus.blendWith && map.cameraForBounds) {
      // Halfway between "fit everything" and the given reference view (less zoomed out than a full fit)
      const all = map.cameraForBounds(focus.bounds, { padding: 120 });
      const ref = map.cameraForBounds(focus.blendWith, { padding: 120 });
      if (all?.center && ref && all.zoom != null && ref.zoom != null) {
        map.flyTo({ center: all.center, zoom: (all.zoom + ref.zoom) / 2, essential: true, duration: 700 });
        return;
      }
      map.fitBounds(focus.bounds, { padding: 120, maxZoom: 16, duration: 700 });
    } else map.fitBounds(focus.bounds, { padding: 120, maxZoom: 16, duration: 700 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.nonce, ready]);

  useEffect(() => {
    if (active) mapRef.current?.resize();
  }, [active]);

  // Back to the view before the last zoom
  const goBack = () => {
    const map = mapRef.current;
    const prev = history.current.pop();
    if (!map || !prev) return;
    restoring.current = true;
    map.easeTo({ center: prev.center, zoom: prev.zoom, duration: 500 });
    setCanBack(history.current.length > 0);
  };

  return (
    <>
      <div ref={box} className="map" data-testid="map" />
      <button type="button" className="map-back" data-testid="map-back" aria-label="Back to the previous view" title="Previous view" disabled={!canBack} onClick={goBack}>
        &lt; Back
      </button>
      {err && <div className="map-note" role="status">{err}</div>}
    </>
  );
}

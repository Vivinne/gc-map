'use client';

import { useEffect, useRef, useState } from 'react';
import maplibregl, { type GeoJSONSource, type Map as MLMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { CITY_TOP_ZOOM, SAME_SPOT_ZOOM, cityClickZoom, isSameSpot, type CityCollection, type LngLatBounds, type PointCollection } from '../lib/geo';

// OpenFreeMap: no API key or sign-up needed; keep the attribution at the bottom-right of the basemap
const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
const SOURCE = 'places';
/** One numbered point per city; drawn below the city zoom, the single markers above it */
const CITY_SOURCE = 'cities';
/** City circle radius (px, fixed); circles whose centres are closer than the diameter overlap, so they are merged (counts summed) */
const CITY_RADIUS = 15;
/** Margin kept around the union of a merged circle, as a share of the shorter map side (about 20%, like the Veneto view the user pointed at) */
const UNION_PAD = 0.2;
const CITY_MERGE_PX = CITY_RADIUS * 2 + 4;

const INK = '#111827';

// Taken from MapLibre's own types, to avoid depending on the global namespace of @types/geojson
type GeoData = Parameters<GeoJSONSource['setData']>[0];

export type FocusTarget =
  | { kind: 'point'; lng: number; lat: number; zoom: number; nonce: number }
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
      map.addLayer({ id: 'points', type: 'circle', source: SOURCE, minzoom: CITY_TOP_ZOOM, paint: dot });
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
      map.addLayer({ id: 'cities', type: 'circle', source: CITY_SOURCE, maxzoom: CITY_TOP_ZOOM, layout: { 'circle-sort-key': ['-', 0, ['get', 'n']] }, paint: cityPaint });
      map.addLayer({ id: 'city-count', type: 'symbol', source: CITY_SOURCE, maxzoom: CITY_TOP_ZOOM, layout: countLayout, paint: { 'text-color': '#ffffff' } });
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
          { layers: ['points'] },
        );
        const pids = [...new Set<string>(hits.map((h) => String(h.properties?.pid)))];
        if (pids.length) latest.current.onPick(pids);
      };
      map.on('click', 'points', pickAt);

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
      for (const id of ['cities', 'points']) {
        map.on('mouseenter', id, () => (map.getCanvas().style.cursor = 'pointer'));
        map.on('mouseleave', id, () => (map.getCanvas().style.cursor = ''));
      }
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
    if (focus.kind === 'point') map.flyTo({ center: [focus.lng, focus.lat], zoom: Math.max(map.getZoom(), focus.zoom), essential: true });
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

  return (
    <>
      <div ref={box} className="map" data-testid="map" />
      {err && <div className="map-note" role="status">{err}</div>}
    </>
  );
}

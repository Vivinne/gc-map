'use client';

import { useEffect, useRef, useState } from 'react';
import maplibregl, { type GeoJSONSource, type Map as MLMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { SAME_SPOT_ZOOM, boundsOfCoords, clusterClickZoom, isSameSpot, type LngLatBounds, type PointCollection } from '../lib/geo';

// OpenFreeMap: no API key or sign-up needed; keep the attribution at the bottom-right of the basemap
const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
const SOURCE = 'places';
/** Same data, clustered; its layers are drawn only at the Full map zoom or further out */
const CLUSTER_SOURCE = 'places-c';
const CLUSTER_PADDING = 120;
// Lets the Full map view itself (which lands on the exact blended zoom) fall inside the clustered range
const CLUSTER_ZOOM_SLACK = 0.1;
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
  /** The two views the Full map button blends: a fit of every marker, and the home view (the clustered range ends at their blend) */
  fullView: { all: LngLatBounds; ref: LngLatBounds } | null;
  /** Bounding box of the currently visible buildings; null = no points */
  bounds: [[number, number], [number, number]] | null;
  focus: FocusTarget | null;
  /** The container must be re-measured when the mobile tab switches */
  active: boolean;
  /** Marker clicked: returns all building ids at that spot (several can share a coordinate) */
  onPick: (pids: string[]) => void;
}

/** Zoom of the Full map view: halfway between a fit of every marker and the home view (the same blend the Full map button flies to) */
function fullMapZoom(map: MLMap, view: Props['fullView']): number {
  const all = view && map.cameraForBounds(view.all, { padding: CLUSTER_PADDING });
  const ref = view && map.cameraForBounds(view.ref, { padding: CLUSTER_PADDING });
  return all?.zoom != null && ref?.zoom != null ? (all.zoom + ref.zoom) / 2 : 3;
}

/** Clusters are drawn below this zoom, single markers at or above it */
function clusterTopZoom(map: MLMap, view: Props['fullView']): number {
  return fullMapZoom(map, view) + CLUSTER_ZOOM_SLACK;
}

function applyClusterRange(map: MLMap, view: Props['fullView']) {
  const top = clusterTopZoom(map, view);
  for (const id of ['cluster-single', 'clusters', 'cluster-count']) if (map.getLayer(id)) map.setLayerZoomRange(id, 0, top);
  if (map.getLayer('points')) map.setLayerZoomRange('points', top, 24);
}

export default function MapView({ fc, selectedPid, fullView, bounds, focus, active, onPick }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState('');

  // Event handlers must read the latest values; use refs to avoid rebinding
  const latest = useRef({ fc, selectedPid, onPick, fullView });
  useEffect(() => {
    latest.current = { fc, selectedPid, onPick, fullView };
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
      const data = latest.current.fc as unknown as GeoData;
      map.addSource(SOURCE, { type: 'geojson', data });
      map.addSource(CLUSTER_SOURCE, { type: 'geojson', data, cluster: true, clusterRadius: 36, clusterMaxZoom: 14 });
      const top = clusterTopZoom(map, latest.current.fullView);
      const dot = {
        'circle-color': ['get', 'color'],
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 5, 10, 7, 15, 10],
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff',
        // Memory estimates (unverified) are semi-transparent
        'circle-opacity': ['case', ['get', 'est'], 0.5, 1],
        'circle-stroke-opacity': ['case', ['get', 'est'], 0.5, 1],
      } as const;
      // Zoomed out to the Full map view or further: overlapping markers merge into a numbered circle
      map.addLayer({ id: 'cluster-single', type: 'circle', source: CLUSTER_SOURCE, filter: ['!', ['has', 'point_count']], maxzoom: top, paint: dot });
      map.addLayer({
        id: 'clusters',
        type: 'circle',
        source: CLUSTER_SOURCE,
        filter: ['has', 'point_count'],
        maxzoom: top,
        paint: {
          'circle-color': INK,
          'circle-radius': ['step', ['get', 'point_count'], 14, 5, 17, 15, 21],
          'circle-stroke-width': 3,
          'circle-stroke-color': '#ffffff',
        },
      });
      map.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: CLUSTER_SOURCE,
        filter: ['has', 'point_count'],
        maxzoom: top,
        layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': ['Noto Sans Bold'], 'text-size': 13, 'text-allow-overlap': true },
        paint: { 'text-color': '#ffffff' },
      });
      // Above that zoom every marker is drawn on its own
      map.addLayer({ id: 'points', type: 'circle', source: SOURCE, minzoom: top, paint: dot });
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
          { layers: ['points', 'cluster-single'] },
        );
        const pids = [...new Set<string>(hits.map((h) => String(h.properties?.pid)))];
        if (pids.length) latest.current.onPick(pids);
      };
      map.on('click', 'points', pickAt);
      map.on('click', 'cluster-single', pickAt);

      // Cluster click: zoom so that every marker of the cluster is in view and drawn on its own
      map.on('click', 'clusters', async (e) => {
        const hit = map.queryRenderedFeatures(e.point, { layers: ['clusters'] })[0];
        const clusterId = Number(hit?.properties?.cluster_id);
        const src = map.getSource(CLUSTER_SOURCE) as GeoJSONSource | undefined;
        if (!hit || !src || Number.isNaN(clusterId)) return;
        const leaves = await src.getClusterLeaves(clusterId, Infinity, 0);
        const coords = leaves.map((l) => (l.geometry as { coordinates: [number, number] }).coordinates);
        const b = boundsOfCoords(coords);
        if (!b) return;
        if (isSameSpot(b)) {
          // Identical coordinates cannot be told apart by zooming: go to the deepest level and hand over to the chooser list
          map.easeTo({ center: [b[0][0], b[0][1]], zoom: SAME_SPOT_ZOOM, duration: 600 });
          latest.current.onPick([...new Set(leaves.map((l) => String(l.properties?.pid)))]);
          return;
        }
        const cam = map.cameraForBounds(b, { padding: 80, maxZoom: 17 });
        const top = clusterTopZoom(map, latest.current.fullView);
        map.easeTo({ center: cam?.center ?? [b[0][0], b[0][1]], zoom: clusterClickZoom(cam?.zoom ?? top, top), duration: 600 });
      });
      map.on('mouseenter', 'clusters', () => (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', 'clusters', () => (map.getCanvas().style.cursor = ''));
      map.on('mouseenter', 'points', () => (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', 'points', () => (map.getCanvas().style.cursor = ''));
      map.on('mouseenter', 'cluster-single', () => (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', 'cluster-single', () => (map.getCanvas().style.cursor = ''));
      // The Full map zoom depends on the viewport size
      map.on('resize', () => applyClusterRange(map, latest.current.fullView));
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
    (map.getSource(CLUSTER_SOURCE) as GeoJSONSource | undefined)?.setData(fc as unknown as GeoData);
  }, [fc, ready]);

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

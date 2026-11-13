'use client';

import maplibregl, { type Map as MlMap, type StyleSpecification } from 'maplibre-gl';
import { createPortal, flushSync } from 'react-dom';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { basemap } from '../lib/basemap';
import { DOT_R, boundsOf, groupOnScreen, pointRadius, type Group } from '../lib/geo';
import { ERAS, ERA_ORDER, type Building } from '../lib/model';
import type { View } from '../lib/nav';
import { MAP_COLORS } from '../styles/tokens';
import { Icon } from './Icons';
import ScaleBar, { scaleFor } from './ScaleBar';

/** Camera moves: one length and one curve, the same as the panels (fast start, soft landing) */
const MAP_MS = 420;
const EASE = (t: number) => 1 - (1 - t) ** 4;
const EUROPE: [[number, number], [number, number]] = [[-9.5, 36.5], [24.5, 57.5]];
/** Without a submitted search, markers show from this scale bar length down (metres) */
export const MARKER_SCALE = 100000;
/** Space kept round the buildings when the map frames them */
const FRAME = 40;
const MAX_ZOOM = 18;

export interface Padding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface MapHandle {
  /** Frame a set of buildings in the free part of the map */
  fitTo(list: Building[]): void;
  /** Move the map only as far as needed to show a point (a building, a number point) in the free part; the zoom stays */
  reveal(at: { lng: number; lat: number }): void;
  /**
   * Show the building of an open card. If it is merged into a number point, zoom in just enough for it to
   * stand alone and bring it into the free part of the map; otherwise as `reveal` (the zoom stays).
   */
  focus(b: Building): void;
  view(): View | null;
}

interface Props {
  /** Buildings the map may show: the search results, or every building */
  buildings: Building[];
  /** A search is submitted: its results show at every scale */
  always: boolean;
  selected: Building | null;
  /** Building pointed at in a list */
  hoverId: string;
  /** Part of the map covered by panels */
  padding: Padding;
  reducedMotion: boolean;
  compact: boolean;
  /** View to open at (reload, shared link); none = Europe */
  start: View | null;
  onSelect(id: string): void;
  /** A number point clicked: its buildings */
  onGroup(ids: string[]): void;
  /** The camera stopped */
  onView(v: View): void;
  /** The map cannot start (no WebGL) */
  onFail(): void;
  fallback: React.ReactNode;
}

function styleSpec(): StyleSpecification {
  const c = MAP_COLORS;
  const { land, borders } = basemap();
  return {
    version: 8,
    sources: {
      land: { type: 'geojson', data: land },
      borders: { type: 'geojson', data: borders },
      // Streets for the city scale. Optional: if the tile server cannot be reached the offline layers still draw the map.
      ofm: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' },
    },
    layers: [
      { id: 'sea', type: 'background', paint: { 'background-color': c.sea } },
      { id: 'land', type: 'fill', source: 'land', paint: { 'fill-color': c.land } },
      { id: 'ofm-water', type: 'fill', source: 'ofm', 'source-layer': 'water', minzoom: 6, paint: { 'fill-color': c.sea } },
      {
        id: 'ofm-river', type: 'line', source: 'ofm', 'source-layer': 'waterway', minzoom: 9,
        paint: { 'line-color': c.sea, 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.8, 15, 4] },
      },
      {
        id: 'ofm-roads', type: 'line', source: 'ofm', 'source-layer': 'transportation', minzoom: 10,
        filter: ['match', ['get', 'class'], ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service'], true, false],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': c.road,
          'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 10, ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], 1.4, 0.4], 16, ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], 12, ['secondary', 'tertiary'], 9, 5]],
        },
      },
      { id: 'ofm-buildings', type: 'fill', source: 'ofm', 'source-layer': 'building', minzoom: 14, paint: { 'fill-color': c.building } },
      { id: 'borders', type: 'line', source: 'borders', maxzoom: 10, paint: { 'line-color': '#FFFFFF', 'line-width': 1 } },
    ],
  };
}

const size = (n: number) => (n > 1 ? pointRadius(n) : DOT_R);

const MapView = forwardRef<MapHandle, Props>(function MapView(props, ref) {
  const { buildings, always, selected, hoverId, padding, reducedMotion, compact, start, onSelect, onGroup, onView, onFail, fallback } = props;
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const tilesOk = useRef(false);
  const [layer, setLayer] = useState<HTMLElement | null>(null);
  const [, setFrame] = useState(0);
  const [pinHover, setPinHover] = useState('');
  const [noMap, setNoMap] = useState(false);
  const [tileFail, setTileFail] = useState(false);
  const padRef = useRef(padding);
  padRef.current = padding;
  const viewRef = useRef(onView);
  viewRef.current = onView;
  const motion = useCallback((ms: number) => (reducedMotion ? 0 : ms), [reducedMotion]);

  useEffect(() => {
    if (!box.current) return;
    let map: MlMap;
    try {
      map = new maplibregl.Map({
        container: box.current,
        style: styleSpec(),
        ...(start ? { center: [start.lng, start.lat] as [number, number], zoom: start.zoom } : { bounds: EUROPE, fitBoundsOptions: { padding: 20 } }),
        attributionControl: false,
        renderWorldCopies: true,
        maxZoom: MAX_ZOOM,
        minZoom: 0.8,
        dragRotate: false,
        pitchWithRotate: false,
      });
    } catch {
      setNoMap(true);
      onFail();
      return;
    }
    map.touchZoomRotate.disableRotation();
    map.on('error', (e) => {
      const ev = e as { sourceId?: string; error?: { message?: string; url?: string } };
      if (!tilesOk.current && (ev.sourceId === 'ofm' || /openfreemap/.test(`${ev.error?.message ?? ''} ${ev.error?.url ?? ''}`))) setTileFail(true);
    });
    // The overlay is redrawn in the same frame as the map, so the marks never lag or shake while the map moves
    let queued = false;
    const redraw = () => {
      if (queued) return;
      queued = true;
      queueMicrotask(() => {
        queued = false;
        flushSync(() => setFrame((f) => f + 1));
      });
    };
    map.on('move', redraw);
    map.on('resize', redraw);
    map.on('load', redraw);
    map.on('moveend', () => {
      const c = map.getCenter();
      viewRef.current({ lng: c.lng, lat: c.lat, zoom: map.getZoom() });
    });
    // Once street tiles arrive their water layer draws the coasts from zoom 6: the coarse offline land stops there
    map.on('data', (e) => {
      if (tilesOk.current || (e as { sourceId?: string }).sourceId !== 'ofm' || !(e as { tile?: unknown }).tile) return;
      tilesOk.current = true;
      setTileFail(false);
      map.setPaintProperty('sea', 'background-color', ['step', ['zoom'], MAP_COLORS.sea, 6, MAP_COLORS.land]);
      map.setLayerZoomRange('land', 0, 6);
    });
    mapRef.current = map;
    setLayer(map.getCanvasContainer());
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(box.current);
    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  useImperativeHandle(
    ref,
    () => ({
      fitTo: (list) => {
        const map = mapRef.current;
        const b = boundsOf(list);
        if (!map || !b) return;
        const p = padRef.current;
        map.fitBounds(b, {
          padding: { top: p.top + FRAME, right: p.right + FRAME, bottom: p.bottom + FRAME, left: p.left + FRAME },
          maxZoom: 15,
          duration: motion(MAP_MS),
          easing: EASE,
        });
      },
      reveal: (b) => {
        const map = mapRef.current;
        if (map) reveal(map, b);
      },
      focus: (b) => {
        const map = mapRef.current;
        if (!map) return;
        const zoom = map.getZoom();
        const shown = markersShown.current;
        const here = map.project([b.lng, b.lat]);
        let near = Infinity;
        for (const o of shown) {
          if (o.id === b.id) continue;
          const q = map.project([o.lng, o.lat]);
          near = Math.min(near, Math.hypot(q.x - here.x, q.y - here.y));
        }
        // Far enough for the selection ring (r 18) to clear a neighbouring dot or small number point
        const need = 32;
        if (!shown.length || near >= need) {
          reveal(map, b);
          return;
        }
        const to = Math.min(MAX_ZOOM, zoom + (near > 0 ? Math.log2(need / near) + 0.15 : MAX_ZOOM));
        const p = padRef.current;
        map.easeTo({
          center: [b.lng, b.lat],
          zoom: to,
          padding: { top: p.top, right: p.right, bottom: p.bottom, left: p.left },
          duration: motion(MAP_MS),
          easing: EASE,
        });
      },
      view: () => {
        const m = mapRef.current;
        if (!m) return null;
        const c = m.getCenter();
        return { lng: c.lng, lat: c.lat, zoom: m.getZoom() };
      },
    }),
    [motion],
  );

  const map = mapRef.current;
  const scale = map ? scaleFor(map.getCenter().lat, map.getZoom()) : null;
  const markersOn = always || (!!scale && scale.metres <= MARKER_SCALE);
  // Buildings drawn as markers at this moment (focus() checks whether the open one is merged)
  const markersShown = useRef<Building[]>([]);
  markersShown.current = markersOn ? buildings : [];

  // A tap moves a finger a little: allow more on phones before it counts as a drag
  const down = useRef<[number, number] | null>(null);
  const onDown = (e: React.PointerEvent) => {
    down.current = [e.clientX, e.clientY];
  };
  const isClick = (e: React.MouseEvent) => !down.current || Math.hypot(e.clientX - down.current[0], e.clientY - down.current[1]) < (compact ? 14 : 5);
  const hot = hoverId || pinHover;
  const act = (key: string, click: () => void) => ({
    onPointerDown: onDown,
    onPointerEnter: () => setPinHover(key),
    onPointerLeave: () => setPinHover((h) => (h === key ? '' : h)),
    onClick: (e: React.MouseEvent) => isClick(e) && click(),
  });

  let overlay: React.ReactNode = null;
  if (map && layer) {
    const { clientWidth: W, clientHeight: H } = map.getContainer();
    // The world repeats sideways: each point is drawn on the copy nearest the middle of the free part of the map
    const mid = map.unproject([(padding.left + W - padding.right) / 2, H / 2]).lng;
    const proj = (lng: number, lat: number) => {
      const p = map.project([lng + 360 * Math.round((mid - lng) / 360), lat]);
      return { x: p.x, y: p.y };
    };
    const inView = (x: number, y: number, m = 40) => x > -m && y > -m && x < W + m && y < H + m;
    const marks: React.ReactNode[] = [];
    const hits: React.ReactNode[] = [];
    if (markersOn) {
      const groups = groupOnScreen(
        buildings.map((b) => ({ item: b, ...proj(b.lng, b.lat) })),
        size,
      );
      for (const g of groups) {
        if (!inView(g.x, g.y)) continue;
        if (g.items.length === 1) {
          const b = g.items[0]!;
          const on = selected?.id === b.id;
          marks.push(
            <circle key={b.id} className={`mk dot${b.id === hot ? ' hot' : ''}${on ? ' sel' : ''}`} cx={g.x} cy={g.y} r={DOT_R} fill={ERAS[b.era].color} {...act(b.id, () => onSelect(b.id))}>
              <title>{b.name}</title>
            </circle>,
          );
          if (compact) hits.push(<circle key={`h-${b.id}`} className="mk hit" cx={g.x} cy={g.y} r={20} {...act(b.id, () => onSelect(b.id))} />);
          continue;
        }
        const key = g.items.map((b) => b.id).join('~');
        const isHot = hot === key || g.items.some((b) => b.id === hoverId);
        marks.push(
          <g key={key} className={`mk num${isHot ? ' hot' : ''}`} transform={`translate(${g.x.toFixed(1)},${g.y.toFixed(1)})`} {...act(key, () => onGroup(g.items.map((b) => b.id)))}>
            <NumberPoint group={g} />
            <title>{`${g.items.length} Architectures`}</title>
          </g>,
        );
      }
    }
    // The open building is always marked, markers on or off
    if (selected) {
      const { x, y } = proj(selected.lng, selected.lat);
      if (inView(x, y)) {
        marks.push(
          <g key="sel" className="sel-mark" transform={`translate(${x},${y})`}>
            <circle r={18} fill={ERAS[selected.era].color} opacity={0.22} />
            <circle r={10} fill="#fff" style={{ stroke: 'var(--ink)' }} strokeWidth={3} />
            <circle r={5.5} fill={ERAS[selected.era].color} />
          </g>,
        );
      }
    }
    overlay = createPortal(
      <svg className="overlay" width={W} height={H}>
        {marks}
        {hits}
      </svg>,
      layer,
    );
  }

  const zoomBy = (d: 1 | -1) => (d > 0 ? map?.zoomIn({ duration: motion(220), easing: EASE }) : map?.zoomOut({ duration: motion(220), easing: EASE }));

  return (
    <div className={`map-box${noMap ? ' no-map' : ''}`}>
      <div ref={box} className="map-canvas" />
      {noMap && <div className="map-fail">{fallback}</div>}
      {tileFail && !noMap && (
        <div className="map-tiles" role="status">
          <span>Map detail didn&apos;t load.</span>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setTileFail(false);
              tilesOk.current = false;
              mapRef.current?.setStyle(styleSpec());
            }}
          >
            Retry
          </button>
        </div>
      )}
      {overlay}
      {scale && !noMap && <ScaleBar scale={scale} style={{ left: 16, bottom: 16 }} />}
      {!noMap && !compact && (
        <div className="ctrls">
          <button type="button" aria-label="Zoom in" onClick={() => zoomBy(1)}>
            <Icon name="plus" />
          </button>
          <button type="button" aria-label="Zoom out" onClick={() => zoomBy(-1)}>
            <Icon name="minus" />
          </button>
        </div>
      )}
      <div className="credit">Natural Earth, OpenFreeMap, OpenMapTiles, OpenStreetMap contributors</div>
    </div>
  );
});

export default MapView;

/** Number point: a ring split by category colour, the count in the middle (the v1 city circle) */
function NumberPoint({ group }: { group: Group<Building> }) {
  const items = group.items;
  const r = pointRadius(items.length);
  const ring = 6;
  const parts = ERA_ORDER.map((e) => [e, items.filter((b) => b.era === e).length] as const).filter(([, n]) => n > 0);
  let a0 = -Math.PI / 2;
  const P = (a: number, rr: number) => `${(Math.cos(a) * rr).toFixed(2)},${(Math.sin(a) * rr).toFixed(2)}`;
  return (
    <>
      <circle r={r + 5} className="num-hot" />
      {parts.length === 1 ? (
        <circle r={r - ring / 2} fill="none" stroke={ERAS[parts[0]![0]].color} strokeWidth={ring} />
      ) : (
        parts.map(([e, n]) => {
          const a1 = a0 + (n / items.length) * Math.PI * 2;
          const large = a1 - a0 > Math.PI ? 1 : 0;
          const d = `M${P(a0, r)} A${r},${r} 0 ${large} 1 ${P(a1, r)} L${P(a1, r - ring)} A${r - ring},${r - ring} 0 ${large} 0 ${P(a0, r - ring)} Z`;
          a0 = a1;
          return <path key={e} d={d} fill={ERAS[e].color} stroke="#fff" strokeWidth={1} />;
        })
      )}
      <circle r={r - ring} fill="#fff" />
      <text className="num-n" y={4.3} textAnchor="middle">
        {items.length}
      </text>
    </>
  );
}

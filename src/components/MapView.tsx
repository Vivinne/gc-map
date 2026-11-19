'use client';

import type { Map as MlMap, StyleSpecification } from 'maplibre-gl';
import { flushSync } from 'react-dom';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { Building } from '../lib/model';
import { isMouseHover } from '../lib/pointer';
import type { View } from '../lib/nav';
import { INSET, MAP_COLORS } from '../styles/tokens';
import { Icon } from './Icons';
import ScaleBar, { scaleFor } from './ScaleBar';
import { EASE, EUROPE, MAX_ZOOM, cameraApi, type MapHandle, type Padding } from './map/camera';
import { renderOverlay, type Act, type Click } from './map/overlay';

/* M8 map: the MapLibre map, its events, the scale bar, zoom buttons and the tile notice.
   Camera moves: map/camera.ts · markers and names: map/overlay.tsx · basemap style: map/style.ts */

export type { MapHandle, Padding };

/** With no search, every name shows when the scale bar reads this length (metres) or less; wider, only exam buildings */
const NAME_SCALE = 100000;
/**
 * The map library and the offline basemap are the biggest downloads: they load after the page is on screen,
 * so the search box, Category and the lists work while the map is still coming (P1, slow networks).
 * MapLibre 6 draws tiles in a worker it loads from beside its own file; the bundler moves that file, so the
 * worker is pointed to where the bundler put it (S1: MapLibre 6 for the XSS fix in 5.x).
 */
async function loadMapLib() {
  const [lib, style] = await Promise.all([import('maplibre-gl'), import('./map/style')]);
  lib.setWorkerUrl(new URL('maplibre-gl/dist/maplibre-gl-worker.mjs', import.meta.url).href);
  return { Map: lib.Map, styleSpec: style.styleSpec };
}

/** Longest press (ms) that still counts as a click on a mark */
const PRESS_MS = 700;

interface Props {
  /** Buildings the map may show: the search results, or every building */
  buildings: Building[];
  /** A search is submitted: its results are named at every scale */
  searched: boolean;
  selected: Building | null;
  /** Building(s) pointed at in a list (ids joined by "~") */
  hoverId: string;
  /** Buildings whose rows are on screen in the open list (named on the map; the other markers dim); null = off */
  seenIds: string[] | null;
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
  /** The map is on screen (it loads after the page): camera moves asked for before now can run */
  onReady(): void;
  fallback: React.ReactNode;
}

const MapView = forwardRef<MapHandle, Props>(function MapView(props, ref) {
  const { buildings, searched, selected, hoverId, seenIds, padding, reducedMotion, compact, start, onSelect, onGroup, onView, onFail, onReady, fallback } = props;
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

  const styleRef = useRef<(() => StyleSpecification) | null>(null);
  // a map file that fails to download goes to the page's error guard (it reloads once for a newer deploy)
  const [loadError, setLoadError] = useState<unknown>(null);
  if (loadError) throw loadError;

  useEffect(() => {
    let gone = false;
    let stop = () => {};
    loadMapLib().then(
      (lib) => {
        if (!gone) stop = startMap(lib);
      },
      (e) => !gone && setLoadError(e),
    );
    return () => {
      gone = true;
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startMap = ({ Map: MaplibreMap, styleSpec }: Awaited<ReturnType<typeof loadMapLib>>): (() => void) => {
    if (!box.current) return () => {};
    styleRef.current = styleSpec;
    let map: MlMap;
    try {
      map = new MaplibreMap({
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
      return () => {};
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
    // A zoom moves the markers under a still mouse: the ring of the number point it pointed at would stay on every
    // building that point splits into, so a zoom ends it (the marker under the mouse rings again once the mouse moves)
    // Any camera move does the same: marks slide away from (or under) a still mouse without a pointer-leave
    map.on('zoomstart', () => setPinHover(''));
    map.on('movestart', () => setPinHover(''));
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
    onReady();
    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
  };

  // A new screen (card, list, search) redraws the marks: the ring of a mark the mouse was on ends with it
  useEffect(() => setPinHover(''), [buildings, selected]);

  useImperativeHandle(ref, () => cameraApi(mapRef, { padRef, markersShown, motion }), [motion]);

  const map = mapRef.current;
  const scale = map ? scaleFor(map.getCenter().lat, map.getZoom()) : null;
  // Markers show at every scale (with or without a search). With no search, a view wider than 100 km on the
  // scale bar names only the buildings set in past TEST-ARCHED papers (and the open card's); every name shows
  // from 100 km down.
  const namesOn = searched || (!!scale && scale.metres <= NAME_SCALE);
  const named = (b: Building) => namesOn || b.exams.length > 0 || b.id === selected?.id;
  // Buildings drawn as markers at this moment (focus() checks whether the open one is merged)
  const markersShown = useRef<Building[]>([]);
  markersShown.current = buildings;

  // A press on a mark opens what was under the pointer when it went down (N13): while the map still moves, the
  // mark slides away before the pointer comes up, and the click would land on another mark or on none.
  // A tap moves a finger a little: allow more on phones before it counts as a drag.
  const press = useRef<{ click: Click; x: number; y: number; t: number } | null>(null);
  /** A press just opened its mark: the click the browser sends after it is not a second open */
  const pressed = useRef(false);
  const slop = compact ? 14 : 5;
  useEffect(() => {
    const onUp = (e: PointerEvent) => {
      const p = press.current;
      press.current = null;
      if (!p || e.button > 0 || performance.now() - p.t > PRESS_MS || Math.hypot(e.clientX - p.x, e.clientY - p.y) >= slop) return;
      pressed.current = true;
      // a click that never comes (it landed off the marks) must not swallow the next one
      window.setTimeout(() => (pressed.current = false), PRESS_MS);
      p.click({ clientX: p.x, clientY: p.y });
    };
    const onCancel = () => (press.current = null);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onCancel, true);
    return () => {
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onCancel, true);
    };
  }, [slop]);
  // Buildings pointed at: one id, or several joined by "~" (a number point, a country heading in a list)
  const hot = hoverId || pinHover;
  const act: Act = (key, click, label) => ({
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button <= 0) press.current = { click, x: e.clientX, y: e.clientY, t: performance.now() };
    },
    // the ink ring follows a mouse only: a finger's tap would leave it stuck on
    onPointerEnter: (e: React.PointerEvent) => isMouseHover(e) && setPinHover(key),
    // the ring ends whenever the map moves or the screen changes (below); a mouse still on the mark rings it again as it moves
    onPointerMove: (e: React.PointerEvent) => isMouseHover(e) && setPinHover(key),
    onPointerLeave: () => setPinHover((h) => (h === key ? '' : h)),
    // pointer presses open on release (above); a click with no press before it (a screen reader) opens here
    onClick: (e: React.MouseEvent) => {
      if (pressed.current) pressed.current = false;
      else if (!press.current && e.detail === 0) click(e);
    },
    ...(label
      ? {
          tabIndex: 0,
          role: 'button',
          'aria-label': label,
          onKeyDown: (e: React.KeyboardEvent) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            e.preventDefault();
            click();
          },
          // the keyboard points at a mark as a mouse does: its ink ring shows while it has the focus
          onFocus: (e: React.FocusEvent) => e.currentTarget.matches(':focus-visible') && setPinHover(key),
          onBlur: () => setPinHover((h) => (h === key ? '' : h)),
        }
      : { 'aria-hidden': true }),
  });

  const overlay = map && layer
    ? renderOverlay({ map, layer, buildings, padding, selected, hot, seenIds, named, compact, act, onSelect, onGroup })
    : null;

  // + / −: around the open building while its card is open (the mouse wheel zooms around the mouse)
  const zoomBy = (d: 1 | -1) => {
    if (!map) return;
    const around = selected ? ([selected.lng, selected.lat] as [number, number]) : undefined;
    map.easeTo({ zoom: map.getZoom() + d, ...(around ? { around } : {}), duration: motion(220), easing: EASE });
  };

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
              if (styleRef.current) mapRef.current?.setStyle(styleRef.current());
            }}
          >
            Retry
          </button>
        </div>
      )}
      {overlay}
      {scale && !noMap && <ScaleBar scale={scale} style={{ left: INSET, bottom: INSET }} />}
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

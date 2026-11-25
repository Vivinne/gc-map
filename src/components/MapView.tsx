'use client';

import type { Map as MlMap, StyleSpecification } from 'maplibre-gl';
import { flushSync } from 'react-dom';
import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import type { Building } from '../lib/model';
import { isMouseHover } from '../lib/pointer';
import type { View } from '../lib/nav';
import { CREDIT_MIN_H, INSET, MAP_BOTTOM, MAP_COLORS, MOTION, ZOOM_BTN } from '../styles/tokens';
import { Icon } from './Icons';
import ScaleBar, { scaleFor } from './ScaleBar';
import { EASE, EUROPE, MAX_ZOOM, cameraApi, type MapHandle, type Padding } from './map/camera';
import { flatView, type ViewLike } from '../lib/flatView';
import { renderOverlay, type Act, type Click, type GroupKeep } from './map/overlay';

/* M8 map: the MapLibre map, its events, the scale bar, zoom buttons and the tile notice.
   Camera moves: map/camera.ts · markers and names: map/overlay.tsx · basemap style: map/style.ts */

export type { MapHandle, Padding };

/** With no search, every name shows when the scale bar reads this length (metres) or less; wider, only exam buildings */
const NAME_SCALE = 100000;
/** Farthest the map zooms out */
const MIN_ZOOM = 0.8;
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

/** Street tiles that have not come by this time (ms) count as failed: the notice and Retry show (L1) */
const TILE_WAIT = 10000;

/** Most device pixels per point the map is drawn at (phones with 3 draw at 2) */
const MAX_MAP_DPR = 2;
/**
 * Phones (user, 2026-11-25): one fixed 1.5. Switching to 1x while the map moved resized the drawing buffer at
 * every start and stop of a move, which blanks a WebGL canvas for a frame: the map flashed
 */
const MAX_PHONE_DPR = 1.5;

/** Zoom from which the street tiles are drawn (map/style.ts) */
const STREET_ZOOM = 6;

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
  /** The map could not start: only then does the fallback (which changes with every screen) need drawing */
  down: boolean;
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
  // A phone page left only a strip by its keyboard: the source line would sit under the search box, so it waits
  // until the keyboard has gone (R6)
  const [noRoom, setNoRoom] = useState(false);
  useEffect(() => {
    const check = () => setNoRoom(compact && window.innerHeight < CREDIT_MIN_H);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [compact]);
  /** Where the mouse last was (the ring check after a map move) */
  const mouseAt = useRef<[number, number] | null>(null);
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') mouseAt.current = [e.clientX, e.clientY];
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, []);
  /** Where the markers are drawn until the map is there */
  const earlyLayer = useRef<HTMLDivElement>(null);
  // a tile server that is slow or does not answer gives no error: no street tile by TILE_WAIT counts as a failure.
  // Street tiles are used only from STREET_ZOOM on, so the wait runs only while the map is that close (zoomed
  // further out nothing is asked for; counting there showed the notice on the plain Europe view)
  const tileTimer = useRef(0);
  const waitForTiles = (map: MlMap) => {
    if (tilesOk.current || map.getZoom() < STREET_ZOOM) {
      window.clearTimeout(tileTimer.current);
      tileTimer.current = 0;
      return;
    }
    if (tileTimer.current) return;
    tileTimer.current = window.setTimeout(() => {
      tileTimer.current = 0;
      if (!tilesOk.current && map.getZoom() >= STREET_ZOOM) setTileFail(true);
    }, TILE_WAIT);
  };
  useEffect(() => () => window.clearTimeout(tileTimer.current), []);
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
    const sharp = Math.min(window.devicePixelRatio || 1, compact ? MAX_PHONE_DPR : MAX_MAP_DPR);
    try {
      map = new MaplibreMap({
        container: box.current,
        style: styleSpec(),
        ...(start ? { center: [start.lng, start.lat] as [number, number], zoom: start.zoom } : { bounds: EUROPE, fitBoundsOptions: { padding: 20 } }),
        attributionControl: false,
        renderWorldCopies: true,
        maxZoom: MAX_ZOOM,
        minZoom: MIN_ZOOM,
        dragRotate: false,
        pitchWithRotate: false,
        // phones (user, 2026-11-24: smoothness): the map is drawn at no more than 2 device pixels per point. Phones
        // with 3 (most iPhones) then draw 44 % fewer pixels each frame, with lines and land edges still sharp; the
        // markers, names and text are page elements and stay at full sharpness
        pixelRatio: sharp,
        // tiles that arrive show at once instead of fading in over 300 ms of extra frames
        fadeDuration: 0,
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
    map.on('zoomstart', () => {
      setPinHover('');
      groupKeep.current.zooming = true;
    });
    map.on('zoomend', () => {
      groupKeep.current.zooming = false;
      redraw();
    });
    map.on('movestart', () => setPinHover(''));
    map.on('resize', redraw);
    map.on('load', redraw);
    map.on('moveend', () => {
      // a mark that slid away under a still mouse gets no pointer-leave (Safari also rings marks passing under it
      // during the move): when the map stops, the ring stays only on the mark that is under the mouse now
      const at = mouseAt.current;
      const under = at ? document.elementFromPoint(at[0], at[1])?.closest('svg.overlay .mk') : null;
      const now = under?.getAttribute('data-key') ?? '';
      setPinHover((h) => (h && h !== now && !document.activeElement?.matches?.('svg.overlay .mk:focus-visible') ? now : h));
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
    waitForTiles(map);
    map.on('moveend', () => waitForTiles(map));
    setLayer(map.getCanvasContainer());
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => map.resize());
    });
    ro.observe(box.current);
    onReady();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
  };

  // A new screen (card, list, search) redraws the marks: the ring of a mark the mouse was on ends with it
  useEffect(() => setPinHover(''), [buildings, selected]);

  useImperativeHandle(ref, () => cameraApi(mapRef, { padRef, markersShown, motion }), [motion]);

  const map = mapRef.current;
  // Before the map library arrives the markers are drawn on the view the map will open at (P2), over the plain
  // sea colour; they work as usual (a card opens, the map frames it once it is there)
  const [early, setEarly] = useState<{ el: HTMLDivElement; view: ViewLike } | null>(null);
  useLayoutEffect(() => {
    if (map || noMap || !box.current) return;
    const el = box.current;
    const make = () => {
      if (!el.clientWidth || !el.clientHeight) return;
      setEarly({ el, view: flatView(el, start ?? { bounds: EUROPE, padding: 20, minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM }) });
    };
    make();
    const ro = new ResizeObserver(make);
    ro.observe(el);
    return () => ro.disconnect();
  }, [map, noMap, start]);
  const shown: ViewLike | null = map ?? early?.view ?? null;
  const scale = shown ? scaleFor(shown.getCenter().lat, shown.getZoom()) : null;
  // Markers show at every scale (with or without a search). With no search, a view wider than 100 km on the
  // scale bar names only the buildings set in past TEST-ARCHED papers (and the open card's); every name shows
  // from 100 km down.
  const namesOn = searched || (!!scale && scale.metres <= NAME_SCALE);
  const named = (b: Building) => namesOn || b.exams.length > 0 || b.id === selected?.id;
  // Buildings drawn as markers at this moment (focus() checks whether the open one is merged)
  /** Number point groups kept through a zoom (map/overlay.tsx GroupKeep) */
  const groupKeep = useRef<GroupKeep>({ zooming: false, last: null });
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
    'data-key': key,
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
    ? renderOverlay({ map, layer, buildings, padding, selected, hot, seenIds, named, compact, act, onSelect, onGroup, keep: groupKeep.current })
    : early && earlyLayer.current && !noMap
      ? renderOverlay({ map: early.view, layer: earlyLayer.current, buildings, padding, selected, hot, seenIds, named, compact, act, onSelect, onGroup })
      : null;

  // + / −: around the open building while its card is open (the mouse wheel zooms around the mouse)
  const zoomBy = (d: 1 | -1) => {
    if (!map) return;
    const around = selected ? ([selected.lng, selected.lat] as [number, number]) : undefined;
    map.easeTo({ zoom: map.getZoom() + d, ...(around ? { around } : {}), duration: motion(MOTION.mid), easing: EASE });
  };

  return (
    <div className={`map-box${noMap ? ' no-map' : ''}`}>
      <div ref={box} className="map-canvas" />
      {!map && <div ref={earlyLayer} className="map-early" />}
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
              const m = mapRef.current;
              if (styleRef.current) m?.setStyle(styleRef.current());
              if (m) waitForTiles(m);
            }}
          >
            Retry
          </button>
        </div>
      )}
      {overlay}
      {scale && !noMap && <ScaleBar scale={scale} style={compact ? { left: INSET, bottom: MAP_BOTTOM } : { right: INSET + ZOOM_BTN + INSET, bottom: MAP_BOTTOM }} />}
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
      <div className={`credit${noRoom ? ' off' : ''}`}>Natural Earth, OpenFreeMap, OpenMapTiles, OpenStreetMap contributors</div>
    </div>
  );
});

// Drawn again only when something it shows changes (R8: not on every letter typed in the search box);
// the fallback page counts only while the map is down
export default memo(MapView, (a, b) =>
  (Object.keys(b) as (keyof Props)[]).every((k) => (k === 'fallback' ? !b.down || a.fallback === b.fallback : a[k] === b[k])),
);

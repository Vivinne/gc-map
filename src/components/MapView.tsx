'use client';

import maplibregl, { type Map as MlMap, type StyleSpecification } from 'maplibre-gl';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { basemap } from '../lib/basemap';
import { MIN_DONUT, boundsOf, clusterAt, donutRadius, nearest, regionOf, stacks, type Cluster } from '../lib/geo';
import { BUILDINGS, ERAS, ERA_ORDER, type Building } from '../lib/model';
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
  showBuilding(b: Building): void;
  home(): void;
}

interface Props {
  buildings: Building[];
  selected: Building | null;
  hoverCity: string;
  padding: Padding;
  reducedMotion: boolean;
  /** Phone layout: side widgets give way to the building sheet */
  compact?: boolean;
  onSelect(id: string): void;
  onCity(city: string): void;
  onReady?(): void;
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
  const { buildings, selected, hoverCity, padding, reducedMotion, compact, onSelect, onCity, onReady } = props;
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const [layer, setLayer] = useState<HTMLElement | null>(null);
  const [frame, setFrame] = useState(0);
  const [stackPick, setStackPick] = useState<{ lng: number; lat: number; items: Building[] } | null>(null);
  const [tip, setTip] = useState<Cluster | null>(null);
  const padRef = useRef(padding);
  padRef.current = padding;
  const motion = useCallback((ms: number) => (reducedMotion ? 0 : ms), [reducedMotion]);

  useEffect(() => {
    if (!box.current) return;
    const map = new maplibregl.Map({
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
    map.on('move', bump);
    map.on('resize', bump);
    map.on('load', () => {
      bump();
      onReady?.();
    });
    mapRef.current = map;
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
      const extra = 50;
      map.fitBounds(b, {
        padding: { top: p.top + extra, right: p.right + extra, bottom: p.bottom + extra, left: p.left + extra },
        maxZoom,
        duration: motion(650),
      });
    },
    [motion],
  );

  useImperativeHandle(
    ref,
    () => ({
      fitAll: (list) => (list.length ? fitTo(list, 6) : undefined),
      fitTo,
      home: () => {
        const p = padRef.current;
        mapRef.current?.fitBounds(EUROPE, { padding: { top: p.top + 20, right: p.right + 20, bottom: p.bottom + 20, left: p.left + 20 }, duration: motion(650) });
      },
      showBuilding: (b) => {
        const map = mapRef.current;
        if (!map) return;
        const p = padRef.current;
        // Zoom so the nearest other building stays in view (context), never past street level,
        // and never so far out that names are hidden
        const near = nearest(b, BUILDINGS, 1)[0];
        const c = map.getContainer();
        const side = Math.max(200, Math.min(c.clientWidth - p.left - p.right, c.clientHeight - p.top - p.bottom));
        let z = 15;
        if (near) {
          const mpp = near.d / (0.12 * side);
          z = Math.log2((40075016.686 * Math.cos((b.lat * Math.PI) / 180)) / (512 * mpp));
        }
        z = Math.max(DETAIL_ZOOM + 0.2, Math.min(14.5, z));
        map.easeTo({ center: [b.lng, b.lat], zoom: z, padding: p, duration: motion(600) });
      },
    }),
    [fitTo, motion],
  );

  const map = mapRef.current;
  const zoom = map ? map.getZoom() : 4;
  const detail = zoom >= DETAIL_ZOOM;
  const zBucket = Math.floor(zoom * 2) / 2;

  const clusters = useMemo(() => (detail ? [] : clusterAt(buildings, zBucket)), [buildings, zBucket, detail]);
  const piles = useMemo(() => (detail ? stacks(buildings) : []), [buildings, detail]);

  useEffect(() => {
    setStackPick(null);
    setTip(null);
  }, [buildings, detail]);

  // Buildings outside the current view, grouped by region
  const outside = useMemo(() => {
    if (!map) return [];
    const bb = map.getBounds();
    const groups = new Map<string, Building[]>();
    for (const b of buildings) {
      if (bb.contains([b.lng, b.lat])) continue;
      const k = regionOf(b);
      const arr = groups.get(k);
      if (arr) arr.push(b);
      else groups.set(k, [b]);
    }
    return [...groups.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, buildings, frame]);

  const down = useRef<[number, number] | null>(null);
  const onDown = (e: React.PointerEvent) => {
    down.current = [e.clientX, e.clientY];
  };
  const isClick = (e: React.MouseEvent) => !down.current || Math.hypot(e.clientX - down.current[0], e.clientY - down.current[1]) < 5;

  let overlay: React.ReactNode = null;
  if (map && layer) {
    const W = map.getContainer().clientWidth;
    const H = map.getContainer().clientHeight;
    const proj = (lng: number, lat: number) => {
      const p = map.project([lng, lat]);
      return [p.x, p.y] as const;
    };
    const inView = (x: number, y: number, m = 40) => x > -m && y > -m && x < W + m && y < H + m;
    const marks: React.ReactNode[] = [];
    const labels: React.ReactNode[] = [];
    const cityLabels: { key: string; x: number; y: number; r: number; text: string; hot: boolean }[] = [];

    if (!detail) {
      for (const c of clusters) {
        if (c.items.length < MIN_DONUT) {
          for (const b of c.items) {
            const [x, y] = proj(b.lng, b.lat);
            if (!inView(x, y)) continue;
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
        const hot = hoverCity === c.name || tip === c;
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
              if (c.cities.size === 1) onCity(c.name);
              else fitTo(c.items);
            }}
          >
            {hot && <circle r={r + 6} className="donut-hot" />}
            <Donut items={c.items} r={r} />
            <text className="donut-n" y={4.3} textAnchor="middle">
              {c.items.length}
            </text>
          </g>,
        );
        if (c.items.length >= 5 || hot) cityLabels.push({ key: c.key, x, y, r, text: clusterName(c), hot });
      }
      // City names: right of the circle first, then left, below, above; never over another circle or name
      const occupied: Box[] = [];
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
      const placed: Box[] = [];
      const items: { x: number; y: number; pile: { items: Building[]; lng: number; lat: number } }[] = [];
      for (const pile of piles) {
        const [x, y] = proj(pile.lng, pile.lat);
        if (!inView(x, y)) continue;
        items.push({ x, y, pile });
        placed.push({ x1: x - 8, x2: x + 8, y1: y - 8, y2: y + 8 });
      }
      // Labels: selected first, then those asked in previous years, then the rest; skipped where they would collide
      const rank = (p: { items: Building[] }) => (selected && p.items.includes(selected) ? 0 : p.items.some((b) => b.exams.length) ? 1 : 2);
      for (const it of [...items].sort((a, b) => rank(a.pile) - rank(b.pile))) {
        const isSel = !!selected && it.pile.items.includes(selected);
        const text = it.pile.items.length > 1 ? `${shortStack(it.pile.items)} (${it.pile.items.length})` : it.pile.items[0]!.name;
        const pos = placeLabel(it.x, it.y, text, isSel, placed, W, H);
        if (!pos) continue;
        labels.push(<PlaceLabel key={`t-${it.pile.items[0]!.id}`} {...pos} text={text} strong={isSel} />);
      }
      for (const it of items) {
        const { x, y, pile } = it;
        if (pile.items.length > 1) {
          marks.push(
            <g key={`s-${pile.items[0]!.id}`} className="mk pile" transform={`translate(${x},${y})`} onPointerDown={onDown} onClick={(e) => isClick(e) && setStackPick(pile)}>
              <rect x={-10} y={-10} width={20} height={20} />
              <text y={4.5} textAnchor="middle">
                {pile.items.length}
              </text>
            </g>,
          );
        } else {
          const b = pile.items[0]!;
          if (selected && b.id === selected.id) continue;
          marks.push(
            <circle key={b.id} className={`mk dot${b.exams.length ? ' asked' : ''}`} cx={x} cy={y} r={6.5} fill={ERAS[b.era].color} onPointerDown={onDown} onClick={(e) => isClick(e) && onSelect(b.id)}>
              <title>{b.name}</title>
            </circle>,
          );
        }
      }
    }
    if (selected) {
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
          <b>{clusterName(tip)}</b>
          <span>
            {tip.items.length} buildings{parts.length > 1 ? `: ${parts.map(([k, v]) => `${k} ${v}`).join(', ')}` : ''}
          </span>
          <span className="k">Click to zoom in</span>
        </div>
      );
    }

    let pickEl: React.ReactNode = null;
    if (stackPick) {
      const [x, y] = proj(stackPick.lng, stackPick.lat);
      pickEl = (
        <div
          className="stack-pick"
          style={{ left: Math.min(x + 16, W - 290), top: Math.max(8, Math.min(y - 10, H - 40 - stackPick.items.length * 38)) }}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <div className="sp-h">
            Same place, {stackPick.items.length} entries
            <button type="button" aria-label="Close" onClick={() => setStackPick(null)}>
              <Icon name="close" size={12} />
            </button>
          </div>
          {stackPick.items.map((b) => (
            <button
              type="button"
              key={b.id}
              className="sp-row"
              onClick={() => {
                setStackPick(null);
                onSelect(b.id);
              }}
            >
              <i style={{ background: ERAS[b.era].color }} />
              <span>{b.name}</span>
              <em>{b.yearShort}</em>
            </button>
          ))}
        </div>
      );
    }

    overlay = createPortal(
      <>
        <svg className="overlay" width={W} height={H}>
          {marks}
          {labels}
        </svg>
        {tipEl}
        {pickEl}
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

  return (
    <div className="map-box">
      <div ref={box} className="map-canvas" />
      {overlay}
      {outside.length > 0 && !(compact && selected) && (
        <div className="away" style={{ left: padding.left + 16, bottom: padding.bottom + 52 }}>
          {outside.map(([k, v]) => (
            <button type="button" key={k} className="chip away-chip" onClick={() => fitTo(v, 12)}>
              {k}
              <span className="n">{v.length}</span>
              <Icon name="right" size={12} />
            </button>
          ))}
        </div>
      )}
      {scale && !(compact && selected) && (
        <div className="scale" style={{ left: padding.left + 16, bottom: padding.bottom + 14 }}>
          {scale.label}
          <i style={{ width: scale.px }} />
        </div>
      )}
      <div className="ctrls" style={{ right: padding.right + 14, bottom: padding.bottom + 14 }}>
        <button type="button" aria-label="Zoom in" onClick={() => map?.zoomIn({ duration: motion(250) })}>
          <Icon name="plus" />
        </button>
        <button type="button" aria-label="Zoom out" onClick={() => map?.zoomOut({ duration: motion(250) })}>
          <Icon name="minus" />
        </button>
        <button type="button" aria-label="Show every result" title="Show every result (F)" onClick={() => (buildings.length ? fitTo(buildings, 6) : undefined)}>
          <Icon name="fit" />
        </button>
      </div>
      <div className={`credit${compact && selected ? ' hide' : ''}`} style={{ right: padding.right + 64, bottom: padding.bottom + 4 }}>
        Natural Earth, OpenFreeMap, OpenMapTiles, OpenStreetMap contributors
      </div>
    </div>
  );
});

export default MapView;

/** Name for a circle: the city; several cities are "<city> area"; many cities of one country are the country */
function clusterName(c: Cluster): string {
  if (c.cities.size === 1) return c.name;
  const countries = new Set(c.items.map((b) => b.country));
  const only = [...countries][0];
  if (c.cities.size >= 4 && countries.size === 1 && only && only !== 'Others') return only;
  return `${c.name} area`;
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
function textWidth(text: string, strong: boolean): number {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
  if (!measureCtx) return text.length * 7;
  measureCtx.font = `${strong ? 750 : 600} ${strong ? 13.5 : 12}px "Archivo Variable", "Noto Sans TC", sans-serif`;
  return measureCtx.measureText(text).width;
}

function placeLabel(x: number, y: number, text: string, strong: boolean, placed: Box[], W: number, H: number) {
  const fs = strong ? 13.5 : 12;
  const tw = textWidth(text, strong);
  const cands: [number, number, 'start' | 'end' | 'middle'][] = [
    [12, 4, 'start'], [-12, 4, 'end'], [0, -14, 'middle'], [0, 22, 'middle'], [10, -9, 'start'], [-10, -9, 'end'], [10, 16, 'start'], [-10, 16, 'end'],
  ];
  for (const [dx, dy, anchor] of cands) {
    const x1 = anchor === 'start' ? x + dx : anchor === 'end' ? x + dx - tw : x - tw / 2;
    const b = { x1: x1 - 3, x2: x1 + tw + 3, y1: y + dy - fs, y2: y + dy + 4 };
    if (b.x1 < 2 || b.x2 > W - 2 || b.y1 < 2 || b.y2 > H - 2) continue;
    if (placed.some((o) => !(b.x2 < o.x1 || b.x1 > o.x2 || b.y2 < o.y1 || b.y1 > o.y2))) continue;
    placed.push(b);
    return { x: x1, y: y + dy, w: tw };
  }
  return null;
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
    <g className="place-lbl">
      <text x={x} y={y} className="halo">
        {text}
      </text>
      <text x={x} y={y}>
        {text}
      </text>
    </g>
  );
}

/** Label for several entries at one spot: their shared leading words, else the first name */
function shortStack(items: Building[]): string {
  const words = items.map((b) => b.name.split(/\s+/));
  const out: string[] = [];
  const first = words[0] ?? [];
  for (let i = 0; i < first.length; i++) {
    const w = first[i];
    if (w && words.every((ws) => ws[i] === w)) out.push(w);
    else break;
  }
  return out.length ? out.join(' ') : (items[0]?.name ?? '');
}

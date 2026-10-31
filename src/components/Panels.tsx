'use client';

import { memo, useEffect, useRef, type PointerEvent } from 'react';
import type { Era, Place, Unlocated } from '../lib/types';

const KIND_LABEL: Record<Unlocated['kind'], string> = {
  'no-location': 'No location in the handout (not filled in, per the rules)',
  'not-found': 'No coordinate found',
  partial: 'No coordinate found for some sub-items',
};

export function eraOf(eras: readonly Era[], id: string): Era | undefined {
  return eras.find((e) => e.id === id);
}

export const PlaceList = memo(function PlaceList({
  places, eras, selectedId, onSelect,
}: {
  places: readonly Place[];
  eras: readonly Era[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  if (places.length === 0) return <p className="empty">No matching buildings.</p>;
  return (
    <ul className="list" aria-label="Building list">
      {places.map((p) => (
        <li key={p.id} style={{ ['--c' as string]: eraOf(eras, p.era)?.color }}>
          <button type="button" className="item" aria-current={p.id === selectedId} onClick={() => onSelect(p.id)}>
            <span className="name">{p.name}</span>
            <span className="meta">
              {[p.loc || 'Location not given', p.year !== '—' ? p.year : ''].filter(Boolean).join(' | ')}
              {p.points.length === 0 && <em className="tag">Unlocated</em>}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
});

const blank = (v: string): string => (v.trim() === '—' ? '' : v.trim());

export interface Offset {
  x: number;
  y: number;
}

/** Free space kept between the dragged panel and the window edges / the tag panel (or its three-line button) */
const GAP = 14;
/** Full panel width (px) and the smallest scale: the heading is 24 px at full size and may shrink to 11 pt */
const FULL_W = 400;
export const K_MIN = ((11 * 96) / 72) / 24;

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));
const hits = (l: number, t: number, r: number, b: number, z: DOMRect) => l < z.right && r > z.left && t < z.bottom && b > z.top;

/**
 * Offset to use for the panel: GAP px inside the map edges, and GAP px away from the tag panel (`menu`: the whole panel when open, just the button when collapsed).
 * `base` is the panel's rect at offset 0, `stage` the map's rect; `want` the offset asked for.
 */
export function constrainOffset(base: DOMRect, stage: DOMRect, menu: DOMRect | null, want: Offset): Offset {
  const lo = { x: stage.left + GAP - base.left, y: stage.top + GAP - base.top };
  const hi = { x: stage.right - GAP - base.right, y: stage.bottom - GAP - base.bottom };
  const x = clamp(want.x, lo.x, hi.x);
  const y = clamp(want.y, lo.y, hi.y);
  if (!menu || menu.width === 0) return { x, y };
  const z = new DOMRect(menu.left - GAP, menu.top - GAP, menu.width + 2 * GAP, menu.height + 2 * GAP);
  const clear = (px: number, py: number) => !hits(base.left + px, base.top + py, base.right + px, base.bottom + py, z);
  if (clear(x, y)) return { x, y };
  // Slide out of the zone in the direction that moves the panel least and stays inside the map
  const cands: Offset[] = [
    { x: z.right - base.left, y },
    { x, y: z.bottom - base.top },
    { x: z.left - base.right, y },
    { x, y: z.top - base.bottom },
  ].filter((c) => c.x >= lo.x && c.x <= hi.x && c.y >= lo.y && c.y <= hi.y && clear(c.x, c.y));
  if (!cands.length) return { x, y };
  return cands.reduce((best, c) => (Math.hypot(c.x - x, c.y - y) < Math.hypot(best.x - x, best.y - y) ? c : best));
}

export function DetailPanel({
  place, era, offset, scale, minimized, layoutKey, onMoved, onScale, onMinimize, onClose,
}: {
  place: Place;
  era: Era | undefined;
  /** Position relative to the default spot; kept by the parent so it survives switching buildings */
  offset: Offset;
  /** 1 = full size; the panel can be made smaller with the resize handle (down to K_MIN) */
  scale: number;
  minimized: boolean;
  /** Changes when the surroundings change (tag panel opened / closed), so the position is checked again */
  layoutKey: string;
  onMoved: (o: Offset) => void;
  onScale: (k: number) => void;
  onMinimize: () => void;
  onClose: () => void;
}) {
  const sub = [blank(place.year), place.loc].filter(Boolean).join(', ');
  const ref = useRef<HTMLElement>(null);
  const cur = useRef<Offset>(offset);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number; base: DOMRect; s: DOMRect; menu: DOMRect | null } | null>(null);
  const isPhone = () => window.matchMedia('(max-width: 900px)').matches; // bottom sheet on phones

  const frame = () => {
    const el = ref.current;
    const stage = el?.offsetParent as HTMLElement | null;
    if (!el || !stage) return null;
    const r = el.getBoundingClientRect();
    const base = new DOMRect(r.left - cur.current.x, r.top - cur.current.y, r.width, r.height);
    return { el, base, s: stage.getBoundingClientRect(), menu: document.querySelector('.side')?.getBoundingClientRect() ?? null };
  };
  const apply = (o: Offset) => {
    cur.current = o;
    if (ref.current) ref.current.style.transform = `translate(${o.x}px, ${o.y}px)`;
  };

  // Check the position again when the window, the tag panel or the panel's own size changes
  useEffect(() => {
    const fit = () => {
      const f = frame();
      if (!f || isPhone()) return;
      const o = constrainOffset(f.base, f.s, f.menu, cur.current);
      if (o.x !== cur.current.x || o.y !== cur.current.y) {
        apply(o);
        onMoved(o);
      }
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey, minimized, place.id, scale]);

  // Drag by the coloured heading block; the DOM is moved directly while dragging (no re-render), the parent is told at the end
  const down = (e: PointerEvent<HTMLElement>) => {
    const f = frame();
    if (!f || e.button !== 0 || (e.target as HTMLElement).closest('button') || isPhone()) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox: cur.current.x, oy: cur.current.y, base: f.base, s: f.s, menu: f.menu };
  };
  const move = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    apply(constrainOffset(d.base, d.s, d.menu, { x: d.ox + e.clientX - d.x, y: d.oy + e.clientY - d.y }));
  };
  const up = () => {
    const d = drag.current;
    drag.current = null;
    if (d && (cur.current.x !== offset.x || cur.current.y !== offset.y)) onMoved(cur.current);
  };

  const scaleNow = useRef(scale);
  // Resize by the bottom-left corner: the right edge stays put, width goes from the current full size down to the 11 pt heading size
  const rz = useRef<{ x: number; w: number; right: number; s: DOMRect } | null>(null);
  const rdown = (e: PointerEvent<HTMLElement>) => {
    const f = frame();
    if (!f || e.button !== 0 || isPhone()) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const r = f.el.getBoundingClientRect();
    rz.current = { x: e.clientX, w: r.width, right: r.right, s: f.s };
  };
  const rmove = (e: PointerEvent<HTMLElement>) => {
    const d = rz.current;
    const el = ref.current;
    if (!d || !el) return;
    const wMax = Math.min(FULL_W, d.s.width - 32);
    const w = clamp(d.w + (d.x - e.clientX), FULL_W * K_MIN, Math.min(wMax, d.right - d.s.left - GAP));
    const k = w / FULL_W;
    scaleNow.current = k;
    el.style.setProperty('--k', String(k));
  };
  const rup = () => {
    if (!rz.current) return;
    rz.current = null;
    onScale(scaleNow.current);
  };
  return (
    <section
      ref={ref}
      className="detail"
      data-min={minimized}
      style={{ ['--c' as string]: era?.color, ['--k' as string]: scale, transform: `translate(${offset.x}px, ${offset.y}px)` }}
      aria-label={`${place.name} details`}
      data-testid="detail"
    >
      <header className="head" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <button type="button" className="minimize" onClick={onMinimize} aria-label={minimized ? 'Restore details' : 'Minimize details'} aria-pressed={minimized} data-testid="detail-min">{minimized ? '▢' : '−'}</button>
        <button type="button" className="close" onClick={onClose} aria-label="Close">×</button>
        <h2>{place.name}</h2>
        <p className="loc">{sub}</p>
      </header>
      <div className="context">
        {blank(place.who) && (
          <>
            <p className="who">{blank(place.who)}</p>
            <p className="dash">－</p>
          </>
        )}
        <p className="ctx">{blank(place.summary)}</p>
        {place.exams.length > 0 && (
          <p className="exam">{place.exams.map((y) => `【${y} TEST-ARCHED】`).join(' ')}</p>
        )}
      </div>
      {!minimized && <div className="resize" role="separator" aria-label="Resize details" data-testid="detail-resize" onPointerDown={rdown} onPointerMove={rmove} onPointerUp={rup} onPointerCancel={rup} />}
    </section>
  );
}

export function Chooser({
  places, eras, onSelect, onClose,
}: {
  places: readonly Place[];
  eras: readonly Era[];
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <section className="chooser" aria-label="Several buildings at the same location" data-testid="chooser">
      <header>
        <strong>{places.length} entries here</strong>
        <button type="button" className="close" onClick={onClose} aria-label="Close">×</button>
      </header>
      <ul>
        {places.map((p) => (
          <li key={p.id}>
            <button type="button" className="item" style={{ ['--c' as string]: eraOf(eras, p.era)?.color }} onClick={() => onSelect(p.id)}>
              <span className="bar" />
              <span className="txt">
                <span className="name">{p.name}</span>
                <span className="meta">{p.style}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function UnlocatedList({
  items, onSelect,
}: {
  items: readonly Unlocated[];
  onSelect: (id: string) => void;
}) {
  if (items.length === 0) return null;
  const kinds: Unlocated['kind'][] = ['not-found', 'partial', 'no-location'];
  return (
    <details className="unloc">
      <summary>Unlocated list ({items.length})</summary>
      {kinds.map((k) => {
        const list = items.filter((i) => i.kind === k);
        if (list.length === 0) return null;
        return (
          <div key={k} className="group">
            <h4>{KIND_LABEL[k]} ({list.length})</h4>
            <ul>
              {list.map((i) => (
                <li key={`${i.id}-${i.sub ?? ''}`}>
                  <button type="button" onClick={() => onSelect(i.id)}>
                    {i.name}
                    {i.sub ? ` / ${i.sub}` : ''}
                  </button>
                  <span className="why">{i.loc ? `${i.loc} | ` : ''}{i.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </details>
  );
}

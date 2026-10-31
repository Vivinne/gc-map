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

/** Free space kept between the dragged panel and the three-line button */
const MENU_GAP = 14;

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));
const hits = (l: number, t: number, r: number, b: number, z: DOMRect) => l < z.right && r > z.left && t < z.bottom && b > z.top;

/**
 * Offset to use for the panel: fully inside the map, and not touching the three-line button (plus MENU_GAP around it).
 * `base` is the panel's rect at offset 0, `stage` the map's rect; `want` the offset asked for.
 */
export function constrainOffset(base: DOMRect, stage: DOMRect, menu: DOMRect | null, want: Offset): Offset {
  const lo = { x: stage.left - base.left, y: stage.top - base.top };
  const hi = { x: stage.right - base.right, y: stage.bottom - base.bottom };
  const x = clamp(want.x, lo.x, hi.x);
  const y = clamp(want.y, lo.y, hi.y);
  if (!menu || menu.width === 0) return { x, y };
  const z = new DOMRect(menu.left - MENU_GAP, menu.top - MENU_GAP, menu.width + 2 * MENU_GAP, menu.height + 2 * MENU_GAP);
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
  place, era, offset, minimized, layoutKey, onMoved, onMinimize, onClose,
}: {
  place: Place;
  era: Era | undefined;
  /** Position relative to the default spot; kept by the parent so it survives switching buildings */
  offset: Offset;
  minimized: boolean;
  /** Changes when the surroundings change (tag panel opened / closed), so the position is checked again */
  layoutKey: string;
  onMoved: (o: Offset) => void;
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
    return { el, base, s: stage.getBoundingClientRect(), menu: document.querySelector('.menu-btn')?.getBoundingClientRect() ?? null };
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
  }, [layoutKey, minimized, place.id]);

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

  return (
    <section
      ref={ref}
      className="detail"
      data-min={minimized}
      style={{ ['--c' as string]: era?.color, transform: `translate(${offset.x}px, ${offset.y}px)` }}
      aria-label={`${place.name} details`}
      data-testid="detail"
    >
      <header className="head" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <button type="button" className="minimize" onClick={onMinimize} aria-label={minimized ? 'Restore details' : 'Minimize details'} aria-pressed={minimized} data-testid="detail-min">−</button>
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

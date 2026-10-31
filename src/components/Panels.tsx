'use client';

import { memo, useRef, type PointerEvent } from 'react';
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

/** Grab at least this much of the panel (px) must stay inside the map */
const KEEP_PX = 60;

export function DetailPanel({
  place, era, offset, onMoved, onClose,
}: {
  place: Place;
  era: Era | undefined;
  /** Position relative to the default spot; kept by the parent so it survives switching buildings */
  offset: Offset;
  onMoved: (o: Offset) => void;
  onClose: () => void;
}) {
  const sub = [blank(place.year), place.loc].filter(Boolean).join(', ');
  const ref = useRef<HTMLElement>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number; r: DOMRect; s: DOMRect; cur: Offset } | null>(null);

  // Drag by the coloured heading block; the DOM is moved directly while dragging (no re-render), the parent is told at the end
  const down = (e: PointerEvent<HTMLElement>) => {
    const el = ref.current;
    const stage = el?.offsetParent as HTMLElement | null;
    if (!el || !stage || e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
    if (window.matchMedia('(max-width: 900px)').matches) return; // bottom sheet on phones
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y, r: el.getBoundingClientRect(), s: stage.getBoundingClientRect(), cur: offset };
  };
  const move = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    const el = ref.current;
    if (!d || !el) return;
    const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
    const dx = clamp(e.clientX - d.x, d.s.left + KEEP_PX - d.r.right, d.s.right - KEEP_PX - d.r.left);
    const dy = clamp(e.clientY - d.y, d.s.top - d.r.top, d.s.bottom - KEEP_PX - d.r.top);
    d.cur = { x: d.ox + dx, y: d.oy + dy };
    el.style.transform = `translate(${d.cur.x}px, ${d.cur.y}px)`;
  };
  const up = () => {
    const d = drag.current;
    drag.current = null;
    if (d && (d.cur.x !== offset.x || d.cur.y !== offset.y)) onMoved(d.cur);
  };

  return (
    <section
      ref={ref}
      className="detail"
      style={{ ['--c' as string]: era?.color, transform: `translate(${offset.x}px, ${offset.y}px)` }}
      aria-label={`${place.name} details`}
      data-testid="detail"
    >
      <header className="head" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
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

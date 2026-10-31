'use client';

import { memo, useEffect, useLayoutEffect, useRef, type PointerEvent } from 'react';
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

export interface DetailSize {
  k: number;
  w: number | null;
  /** Height when expanded / when minimized (null = follows the content) */
  h: number | null;
  mh: number | null;
}

export interface Offset {
  x: number;
  y: number;
}

/** Free space kept between the dragged panel and the window edges / the tag panel (or its three-line button) */
const GAP = 14;
/** The heading is 24 px at full size and may shrink to 11 pt (the smallest scale k) */
export const K_MIN = ((11 * 96) / 72) / (24 - (2 * 96) / 72); // 11 pt floor for the heading, whose base size is 24 px - 2 pt

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

/** Shortest the panel may be at its current width: expanded = heading + one line of text, minimized = one heading line with the buttons */
function minHeightOf(el: HTMLElement, k: number, minimized: boolean): number {
  const bw = parseFloat(getComputedStyle(el.querySelector('.detail-box') ?? el).borderTopWidth) || 0;
  if (minimized) {
    const h2 = el.querySelector('h2') as HTMLElement | null;
    return Math.max(52 * k, (h2?.offsetHeight ?? 24 * k) + 12 * k) + 2 * bw;
  }
  const head = el.querySelector('.head') as HTMLElement | null;
  const ctx = el.querySelector('.context') as HTMLElement | null;
  const line = el.querySelector('.ctx') as HTMLElement | null;
  const cs = ctx ? getComputedStyle(ctx) : null;
  return (head?.offsetHeight ?? 0) + (cs ? parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) : 0) + (line ? parseFloat(getComputedStyle(line).lineHeight) || 20 * k : 20 * k) + 2 * bw;
}

/** Width of the heading on one line plus the room for the two buttons: the panel is never narrower than this, so the heading never wraps */
function titleLineWidth(el: HTMLElement): number {
  const h2 = el.querySelector('h2') as HTMLElement | null;
  if (!h2) return 0;
  const prev = h2.style.width;
  h2.style.width = 'max-content';
  const w = Math.ceil(h2.getBoundingClientRect().width) + 2; // a little slack so rounding never wraps the heading
  h2.style.width = prev;
  return w;
}
function borderOf(el: HTMLElement): number {
  return parseFloat(getComputedStyle(el.querySelector('.detail-box') ?? el).borderTopWidth) || 0;
}

export function DetailPanel({
  place, era, offset, size, minimized, layoutKey, onMoved, onSize, onMinimize, onClose,
}: {
  place: Place;
  era: Era | undefined;
  /** Position relative to the default spot; kept by the parent so it survives switching buildings */
  offset: Offset;
  /** Scale of type and buttons (1 = full), and the panel's width / height in px (null = the default size) */
  size: DetailSize;
  minimized: boolean;
  /** Changes when the surroundings change (tag panel opened / closed), so the position is checked again */
  layoutKey: string;
  onMoved: (o: Offset) => void;
  onSize: (z: DetailSize) => void;
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
  }, [layoutKey, minimized, place.id, size.k, size.w, size.h, size.mh]);

  // The heading is always on one line: a building with a longer title (or a new scale) widens the panel to what that line needs
  useLayoutEffect(() => {
    const el = ref.current;
    const stage = el?.offsetParent as HTMLElement | null;
    if (!el || !stage || isPhone()) return;
    // one-line heading first, 2/3 width second: the panel may pass 2/3 of the map when the heading needs it, never the map edges
    const maxW = stage.clientWidth - 2 * GAP;
    const need = Math.min(titleLineWidth(el) + (16 + 96) * size.k + 2 * borderOf(el), maxW);
    const now = el.getBoundingClientRect().width;
    if (now < need - 0.5) {
      el.style.setProperty('--w', `${need}px`);
      onSize({ ...size, w: need });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place.id, minimized, size.k, size.w]);

  // A stored height that is too short for this building's heading (another building, another scale) is raised: the heading and one line of text always fit inside the frame
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || isPhone()) return;
    const cur2 = minimized ? size.mh : size.h;
    if (!cur2) return;
    const need = minHeightOf(el, size.k, minimized);
    if (cur2 < need - 0.5) {
      el.style.setProperty(minimized ? '--mh' : '--h', `${need}px`);
      onSize(minimized ? { ...size, mh: need } : { ...size, h: need });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place.id, minimized, size.k, size.w, size.h, size.mh]);

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

  // Resize. Corners keep the proportions (type and buttons scale with it, k); edges move only that edge, the other three stay where they are (k unchanged).
  // Limits, always keeping GAP from the map edges and from the tag panel: width from "title + the two buttons" to 2/3 of the map;
  // height from "title + one line of text" to the whole map height.
  const rz = useRef<{ dir: string; x: number; y: number; k: number; r: DOMRect; s: DOMRect; side: DOMRect | null; zone: DOMRect | null } | null>(null);
  const sizeNow = useRef<DetailSize>(size);
  const rdown = (e: PointerEvent<HTMLElement>) => {
    const f = frame();
    const dir = e.currentTarget.dataset.dir;
    if (!f || !dir || e.button !== 0 || isPhone()) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const r = f.el.getBoundingClientRect();
    f.el.style.setProperty(minimized ? '--mh' : '--h', `${r.height}px`); // the height stops following the text: the box keeps its size and the text scrolls
    sizeNow.current = minimized ? { ...size, w: r.width, mh: r.height } : { ...size, w: r.width, h: r.height };
    const z = f.menu && f.menu.width ? new DOMRect(f.menu.left - GAP, f.menu.top - GAP, f.menu.width + 2 * GAP, f.menu.height + 2 * GAP) : null;
    rz.current = { dir, x: e.clientX, y: e.clientY, k: size.k, r, s: f.s, side: f.menu, zone: z };
  };
  const rmove = (e: PointerEvent<HTMLElement>) => {
    const d = rz.current;
    const el = ref.current;
    if (!d || !el) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    const { r: R, s: S, zone } = d;
    const maxW = Math.min((S.width * 2) / 3, S.width - 2 * GAP);
    const maxH = S.height - 2 * GAP;
    let L = R.left, T = R.top, Rt = R.right, B = R.bottom, k = d.k;
    if (d.dir.length === 2) {
      // corner: same proportions, opposite corner fixed
      const sx = d.dir.includes('e') ? 1 : -1;
      const sy = d.dir.includes('s') ? 1 : -1;
      const rw = (R.width + sx * dx) / R.width;
      const rh = (R.height + sy * dy) / R.height;
      let q = Math.abs(rw - 1) >= Math.abs(rh - 1) ? rw : rh;
      const roomX = sx > 0 ? S.right - GAP - R.left : R.right - (S.left + GAP);
      const roomY = sy > 0 ? S.bottom - GAP - R.top : R.bottom - (S.top + GAP);
      // the heading must stay on one line: width(q) = q * R.width must cover q * (heading + buttons) + borders
      const bw = borderOf(el);
      const spare = R.width - (titleLineWidth(el) + (16 + 96) * d.k);
      if (spare < 2 * bw - 2) return; // already too narrow for a one-line heading (2 px of rounding allowed): no corner scaling
      const qMin = Math.max(K_MIN / d.k, (2 * bw) / Math.max(spare, 2 * bw));
      const qMax = Math.min(maxW / R.width, maxH / R.height, roomX / R.width, roomY / R.height);
      q = clamp(q, qMin, qMax);
      const place = (qq: number) => {
        const w = R.width * qq, h = R.height * qq;
        return new DOMRect(sx > 0 ? R.left : R.right - w, sy > 0 ? R.top : R.bottom - h, w, h);
      };
      while (zone && q > qMin && hits(place(q).left, place(q).top, place(q).right, place(q).bottom, zone)) q -= 0.01;
      const n = place(q);
      L = n.left; T = n.top; Rt = n.right; B = n.bottom; k = d.k * q;
    } else {
      // Narrowest: the heading stays on one line, plus the padding that holds the two buttons. A width that would wrap the heading is never allowed.
      const bw = borderOf(el);
      const minW = titleLineWidth(el) + (16 + 96) * k + 2 * bw;
      if (minW > S.width - 2 * GAP) return; // the heading cannot fit on one line even across the whole map: the panel stays as it is
      const minH = minHeightOf(el, k, minimized);
      if (d.dir === 'e') Rt = clamp(R.right + dx, L + minW, Math.min(L + Math.max(maxW, minW), S.right - GAP));
      if (d.dir === 'w') L = clamp(R.left + dx, Math.max(Rt - Math.max(maxW, minW), S.left + GAP), Rt - minW);
      if (d.dir === 's') B = clamp(R.bottom + dy, T + minH, Math.min(T + maxH, S.bottom - GAP));
      if (d.dir === 'n') T = clamp(R.top + dy, Math.max(B - maxH, S.top + GAP), B - minH);
      // A narrower box wraps the text more and the heading may get taller: the bottom edge follows so the heading always fits
      if ((d.dir === 'e' || d.dir === 'w') && B - T < minH) B = Math.min(T + minH, S.bottom - GAP);
      // do not run into the tag panel: stop the moving edge at its boundary
      if (zone && hits(L, T, Rt, B, zone)) {
        if (d.dir === 'w') L = Math.max(L, zone.right);
        if (d.dir === 'n') T = Math.max(T, zone.bottom);
        if (d.dir === 'e') Rt = Math.min(Rt, zone.left);
        if (d.dir === 's') B = Math.min(B, zone.top);
      }
    }
    const w = Rt - L, h = B - T;
    el.style.setProperty('--k', String(k));
    el.style.setProperty('--w', `${w}px`);
    el.style.setProperty(minimized ? '--mh' : '--h', `${h}px`);
    sizeNow.current = minimized ? { ...size, k, w, mh: h } : { ...size, k, w, h };
    // The panel is anchored top-right: measure where it sits at offset 0 with the new size, then choose the offset that puts it on the wanted rect
    const m = el.getBoundingClientRect();
    apply({ x: L - (m.left - cur.current.x), y: T - (m.top - cur.current.y) });
  };
  const rup = () => {
    if (!rz.current) return;
    rz.current = null;
    onSize(sizeNow.current);
    onMoved(cur.current);
  };
  return (
    <section
      ref={ref}
      className="detail"
      data-min={minimized}
      style={{ ['--c' as string]: era?.color, ['--k' as string]: size.k, ...(size.w ? { ['--w' as string]: `${size.w}px` } : {}), ...(size.h && !minimized ? { ['--h' as string]: `${size.h}px` } : {}), ...(size.mh && minimized ? { ['--mh' as string]: `${size.mh}px` } : {}), transform: `translate(${offset.x}px, ${offset.y}px)` }}
      aria-label={`${place.name} details`}
      data-testid="detail"
    >
      <div className="detail-box">
      <header className="head" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <button type="button" className="minimize" onClick={onMinimize} aria-label={minimized ? 'Restore details' : 'Minimize details'} aria-pressed={minimized} data-testid="detail-min">{minimized ? <span className="sq" aria-hidden="true" /> : '−'}</button>
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
      </div>
      {['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].map((dir) => (
          <div key={dir} className={`rz rz-${dir}`} data-dir={dir} role="separator" aria-label={`Resize details (${dir})`} data-testid={`detail-resize-${dir}`} onPointerDown={rdown} onPointerMove={rmove} onPointerUp={rup} onPointerCancel={rup} />
        ))}
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

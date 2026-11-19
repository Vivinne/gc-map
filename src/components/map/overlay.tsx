import type { Map as MlMap } from 'maplibre-gl';
import type { FocusEvent, KeyboardEvent, MouseEvent, PointerEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { DOT_R, groupOnScreen, pointRadius } from '../../lib/geo';
import { ERAS, type Building } from '../../lib/model';
import NumberPoint from '../NumberPoint';
import type { Padding } from './camera';

/* M8 markers and names: the SVG drawn over the map each frame (dots, number points, names, the open building's mark). */

/** Map name labels: longest name shown in full, and the width a character takes at 12 px */
const LABEL_MAX = 24;
const LABEL_CHAR = 6.6;
/** The open building's name: 13.5 px against 12 px */
const SEL_SCALE = 13.5 / 12;
/** Halo of the open building's mark (the white disc with its ink ring is r 13) */
const SEL_HALO = 18;
/** A finger's touch circle around each single marker on phones */
const HIT_R = 20;

const size = (n: number) => (n > 1 ? pointRadius(n) : DOT_R);

/**
 * Pointer handlers of one marker, number point or name (made by MapView: it keeps the hover and tap state).
 * With a `label` the mark is also a button for the keyboard and screen readers (Tab, Enter or Space); the
 * names and the phone touch circles repeat a marker, so they take no label and stay out of the Tab order.
 */
/** Where the pointer was pressed (none: the keyboard) */
export type Click = (at?: { clientX: number; clientY: number }) => void;
export type Act = (key: string, click: Click, label?: string) => {
  onPointerDown: (e: PointerEvent) => void;
  onPointerEnter: (e: PointerEvent) => void;
  onPointerLeave: () => void;
  onPointerMove: (e: PointerEvent) => void;
  onClick: (e: MouseEvent) => void;
  tabIndex?: number;
  role?: string;
  'aria-label'?: string;
  'aria-hidden'?: boolean;
  onKeyDown?: (e: KeyboardEvent) => void;
  onFocus?: (e: FocusEvent) => void;
  onBlur?: () => void;
};

interface OverlayArgs {
  map: MlMap;
  /** The map's canvas container: the SVG is portalled into it */
  layer: HTMLElement;
  buildings: Building[];
  padding: Padding;
  selected: Building | null;
  /** Building(s) pointed at, in a list or on the map (ids joined by "~") */
  hot: string;
  seenIds: string[] | null;
  /** Whether a single marker gets its name */
  named: (b: Building) => boolean;
  compact: boolean;
  act: Act;
  onSelect(id: string): void;
  onGroup(ids: string[]): void;
}

export function renderOverlay({ map, layer, buildings, padding, selected, hot, seenIds, named, compact, act, onSelect, onGroup }: OverlayArgs): ReactNode {
  const hotSet = new Set(hot ? hot.split('~') : []);
  const seen = seenIds && seenIds.length ? new Set(seenIds) : null;
  const seenCls = (ids: string[]) => (seen && !ids.some((id) => seen.has(id)) ? ' dim' : '');
  const { clientWidth: W, clientHeight: H } = map.getContainer();
  // The world repeats sideways: each point is drawn on the copy nearest the middle of the free part of the map
  const mid = map.unproject([(padding.left + W - padding.right) / 2, H / 2]).lng;
  const proj = (lng: number, lat: number) => {
    const p = map.project([lng + 360 * Math.round((mid - lng) / 360), lat]);
    return { x: p.x, y: p.y };
  };
  const inView = (x: number, y: number, m = 40) => x > -m && y > -m && x < W + m && y < H + m;
  const marks: ReactNode[] = [];
  // Markers and number points a finger can mean: their centres and sizes on screen
  const targets: { x: number; y: number; r: number; go(): void }[] = [];
  const tapNearest = (e: { clientX: number; clientY: number } | undefined, own: string) => {
    if (!e) return onSelect(own);
    const box = layer.getBoundingClientRect();
    const x = e.clientX - box.left, y = e.clientY - box.top;
    let best: (typeof targets)[number] | null = null, gap = Infinity;
    for (const t of targets) {
      const d = Math.hypot(t.x - x, t.y - y) - t.r;
      if (d < gap) (gap = d), (best = t);
    }
    if (best && gap <= HIT_R) best.go();
    else onSelect(own);
  };
  // Names beside every single marker (placed after all markers, see below)
  const labels: ReactNode[] = [];
  const singles: { b: Building; x: number; y: number }[] = [];
  // Screen boxes no name may cover: every marker and number point, then each name placed
  const taken: [number, number, number, number][] = [];
  const hits: ReactNode[] = [];
  const groups = groupOnScreen(
    buildings.map((b) => ({ item: b, ...proj(b.lng, b.lat) })),
    size,
  );
  // The open building inside a number point: the point stays whole and is itself marked open (halo, ink
  // ring, the open building's name beside it); no separate mark is laid over it
  const selGroup = selected ? (groups.find((g) => g.items.length > 1 && g.items.some((b) => b.id === selected.id)) ?? null) : null;
  for (const g of groups) {
    if (!inView(g.x, g.y)) continue;
    if (g.items.length === 1) {
      const b = g.items[0]!;
      const on = selected?.id === b.id;
      targets.push({ x: g.x, y: g.y, r: DOT_R, go: () => onSelect(b.id) });
      marks.push(
        <circle key={b.id} className={`mk dot${hotSet.has(b.id) ? ' hot' : ''}${on ? ' sel' : ''}${seenCls([b.id])}`} cx={g.x} cy={g.y} r={DOT_R} fill={ERAS[b.era].color} {...act(b.id, () => onSelect(b.id), b.name)}>
          <title>{b.name}</title>
        </circle>,
      );
      // a finger's touch circle (r 20) can lie over a marker next to it: the tap goes to the marker nearest the finger
      if (compact) hits.push(<circle key={`h-${b.id}`} className="mk hit" cx={g.x} cy={g.y} r={HIT_R} {...act(b.id, (e) => tapNearest(e, b.id))} />);
      singles.push({ b, x: g.x, y: g.y });
      continue;
    }
    if (g === selGroup) continue;
    targets.push({ x: g.x, y: g.y, r: size(g.items.length), go: () => onGroup(g.items.map((b) => b.id)) });
    const gr = size(g.items.length) + 6;
    taken.push([g.x - gr, g.y - gr, g.x + gr, g.y + gr]);
    const key = g.items.map((b) => b.id).join('~');
    const isHot = hot === key || g.items.some((b) => hotSet.has(b.id));
    marks.push(
      <g key={key} className={`mk num${isHot ? ' hot' : ''}${seenCls(g.items.map((x) => x.id))}`} transform={`translate(${g.x.toFixed(1)},${g.y.toFixed(1)})`} {...act(key, () => onGroup(g.items.map((b) => b.id)), `${g.items.length} Architectures`)}>
        <NumberPoint group={g} />
        <title>{`${g.items.length} Architectures`}</title>
      </g>,
    );
  }
  for (const d of singles) taken.push([d.x - DOT_R - 1, d.y - DOT_R - 1, d.x + DOT_R + 1, d.y + DOT_R + 1]);
  // The open building inside a number point: that number point is not drawn; the open building's own mark
  // stands alone and the other buildings of that point are left out until the map is zoomed in again
  const sp = selected ? proj(selected.lng, selected.lat) : null;
  // The open building's name is placed first and always shows: right of its mark, else left, else under,
  // else over; when every place is taken it still goes on the roomier side (over other markers, kept on the
  // map, shortened with … if the map is too narrow)
  if (sp && inView(sp.x, sp.y)) {
    taken.push([sp.x - SEL_HALO, sp.y - SEL_HALO, sp.x + SEL_HALO, sp.y + SEL_HALO]);
    const ch = LABEL_CHAR * SEL_SCALE;
    const gap = SEL_HALO + 3;
    const fit = (t: string) => (t.length > LABEL_MAX ? `${t.slice(0, LABEL_MAX - 1)}\u2026` : t);
    let text = fit(selected!.name);
    const { x, y } = sp;
    const left = padding.left + 4, right = W - padding.right - 4;
    let placed: { box: [number, number, number, number]; tx: number; anchor: 'start' | 'end' | 'middle' } | null = null;
    for (const side of [1, -1, 2, -2] as const) {
      const w = text.length * ch;
      const x0 = side === 1 ? x + gap : side === -1 ? x - gap - w : x - w / 2;
      const top = side === 2 ? y + SEL_HALO + 2 : side === -2 ? y - SEL_HALO - 22 : y - 10;
      const box: [number, number, number, number] = [x0, top, x0 + w, top + 20];
      if (box[0] < left || box[2] > right || box[1] < padding.top || box[3] > H - padding.bottom || taken.some((t) => box[0] < t[2] && box[2] > t[0] && box[1] < t[3] && box[3] > t[1])) continue;
      placed = { box, tx: side === 1 ? box[0] : side === -1 ? box[2] : x, anchor: side === 1 ? 'start' : side === -1 ? 'end' : 'middle' };
      break;
    }
    if (!placed) {
      const toRight = right - (x + gap) >= x - gap - left;
      const room = Math.max(0, toRight ? right - (x + gap) : x - gap - left);
      const most = Math.floor(room / ch);
      if (text.length > most) text = most > 2 ? `${text.slice(0, most - 1)}\u2026` : text;
      const w = text.length * ch;
      const x0 = toRight ? x + gap : x - gap - w;
      placed = { box: [x0, y - 10, x0 + w, y + 10], tx: toRight ? x0 : x0 + w, anchor: toRight ? 'start' : 'end' };
    }
    taken.push(placed.box);
    labels.push(
      <g key="sel-label" className="mk name" {...act(selected!.id, () => onSelect(selected!.id))}>
        <rect className="name-hit" x={placed.box[0] - 2} y={placed.box[1]} width={placed.box[2] - placed.box[0] + 4} height={20} />
        <text className="mk-label sel" x={placed.tx} y={placed.box[1] + 14.5} textAnchor={placed.anchor}>
          {text}
        </text>
      </g>,
    );
  }
  // (the open building's name is placed above) then the rows on screen in the list, then the rest in list order
  const rank = (b: Building) => (seen?.has(b.id) ? 1 : 2);
  for (const { b, x, y } of [...singles].filter((d) => named(d.b) && d.b.id !== selected?.id).sort((p, q) => rank(p.b) - rank(q.b))) {
    const text = b.name.length > LABEL_MAX ? `${b.name.slice(0, LABEL_MAX - 1)}\u2026` : b.name;
    const w = text.length * LABEL_CHAR;
    // right of the dot, else left; a name that would cover a marker or another name, run under a panel or leave the map is not drawn
    const gap = DOT_R + 4;
    for (const side of [1, -1] as const) {
      const x0 = side === 1 ? x + gap : x - gap - w;
      const box: [number, number, number, number] = [x0, y - 8, x0 + w, y + 8];
      if (box[0] < padding.left + 4 || box[2] > W - padding.right - 4 || box[1] < padding.top || box[3] > H - padding.bottom || taken.some((t) => box[0] < t[2] && box[2] > t[0] && box[1] < t[3] && box[3] > t[1])) continue;
      taken.push(box);
      // A name is part of its marker: pointing at it rings the dot, clicking it opens the card
      labels.push(
        <g key={`l-${b.id}`} className={`mk name${hotSet.has(b.id) ? ' hot' : ''}${seen && !seen.has(b.id) ? ' dim' : ''}`} {...act(b.id, () => onSelect(b.id))}>
          <rect className="name-hit" x={box[0] - 2} y={box[1]} width={w + 4} height={box[3] - box[1]} />
          <text className="mk-label" x={side === 1 ? box[0] : box[2]} y={y + 4} textAnchor={side === 1 ? 'start' : 'end'}>
            {text}
          </text>
        </g>,
      );
      break;
    }
  }
  // The open building is always marked (when merged, its number point carries the mark, above)
  if (selected) {
    const { x, y } = proj(selected.lng, selected.lat);
    if (inView(x, y)) {
      marks.push(
        <g key="sel" className="sel-mark" transform={`translate(${x},${y})`}>
          <circle r={SEL_HALO} fill={ERAS[selected.era].color} opacity={0.22} />
          <circle r={13} fill="#fff" style={{ stroke: 'var(--ink)' }} strokeWidth={3} />
          <circle r={DOT_R} fill={ERAS[selected.era].color} />
        </g>,
      );
    }
  }
  return createPortal(
    <svg className="overlay" width={W} height={H}>
      {marks}
      {labels}
      {hits}
    </svg>,
    layer,
  );
}

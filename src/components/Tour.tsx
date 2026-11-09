'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SHOTS, type GuideShot } from '../data/guide-shots';
import { load, save } from '../lib/storage';
import { Icon } from './Icons';

/**
 * Page guides: the first time each page (Map, Quiz, Progress, Settings) is opened, a large window in the middle
 * of the screen shows how it works, the rest of the screen dimmed. Each guide page is a screenshot of the site
 * with lines drawn out from its controls: on a computer to a few words beside the picture, on a phone (no room
 * beside it) to a hollow number, the words listed under the picture. Up to 4 pages; closed with the close
 * button, Done or Esc; Settings opens any of them again. The screenshots come from scripts/guide-shots.cjs.
 */
export type TourId = 'map' | 'quiz' | 'progress' | 'settings';
export const TOUR_LABEL: Record<TourId, string> = { map: 'Map', quiz: 'Quiz', progress: 'Progress', settings: 'Settings' };
export const TOURS: TourId[] = ['map', 'quiz', 'progress', 'settings'];
const KEY = 'tours-seen';

export function toursSeen(): TourId[] {
  const v = load<unknown>(KEY, []);
  return Array.isArray(v) ? v.filter((x): x is TourId => (TOURS as string[]).includes(x)) : [];
}
export function markSeen(id: TourId): void {
  const s = toursSeen();
  if (!s.includes(id)) save(KEY, [...s, id]);
}

interface Page {
  title: string;
  line: string;
  /** Screenshot name in SHOTS, without the d- / m- prefix */
  shot: string;
  /** A line of keys under the picture (computer only) */
  keys?: [string[], string][];
}

const PAGES: Record<TourId, (mobile: boolean) => Page[]> = {
  map: (m) => [
    { title: 'The map', line: 'Every building of the course, by place and style.', shot: 'map-main' },
    { title: 'Filters and list', line: 'Narrow the map; the list shows what is left.', shot: 'map-filters' },
    { title: 'A building', line: m ? 'Drag the card up or down; swipe it sideways for the next building.' : 'Click a building on the map or in a list.', shot: 'map-card' },
    {
      title: 'Search',
      line: 'Type a name, or pick up where you left off.',
      shot: 'map-search',
      keys: m
        ? undefined
        : [
            [['/'], 'Search'],
            [['F'], 'Filters'],
            [['←', '→'], 'Previous / next'],
            [['S'], 'Star'],
            [['Esc'], 'Close'],
          ],
    },
  ],
  quiz: () => [
    { title: 'Quiz', line: 'Questions on the city, architect and style of each building.', shot: 'quiz-home' },
    { title: 'Answering', line: 'Four choices, one right.', shot: 'quiz-run' },
    { title: 'The result', line: 'Skipped questions do not count.', shot: 'quiz-result' },
  ],
  progress: () => [{ title: 'Progress', line: 'A building is mastered when its city, architect and style are each right on 2 different days.', shot: 'progress' }],
  settings: () => [{ title: 'Settings', line: 'The guides again, and your progress on another device.', shot: 'settings' }],
};

export default function Tour({ id, mobile, onClose }: { id: TourId; mobile: boolean; onClose(): void }) {
  const pages = PAGES[id](mobile);
  const [i, setI] = useState(0);
  const p = pages[i]!;
  const last = i === pages.length - 1;
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      } else if (e.key === 'ArrowRight' && !last) setI(i + 1);
      else if (e.key === 'ArrowLeft' && i > 0) setI(i - 1);
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [i, last, onClose]);
  const shot = SHOTS[`${mobile ? 'm' : 'd'}-${p.shot}`];
  return createPortal(
    <div className="tour-bg">
      <div className={`tour${mobile ? ' m' : ''}`} role="dialog" aria-modal="true" aria-label={`${TOUR_LABEL[id]} guide`}>
        <div className="tour-h">
          <span className="tour-k">{TOUR_LABEL[id]} guide</span>
          <button type="button" className="tour-x" aria-label="Close" onClick={onClose}>
            <Icon name="close" size={14} />
          </button>
        </div>
        <div className="tour-bd" key={i}>
          <h2>{p.title}</h2>
          <p className="tour-line">{p.line}</p>
          {shot && (mobile ? <Spot shot={shot} /> : <Shot shot={shot} />)}
          {p.keys && (
            <p className="tour-keys">
              {p.keys.map(([ks, what]) => (
                <span key={what}>
                  {ks.map((k) => (
                    <kbd key={k}>{k}</kbd>
                  ))}
                  {what}
                </span>
              ))}
            </p>
          )}
        </div>
        <div className="tour-f">
          <button type="button" className="btn" disabled={i === 0} onClick={() => setI(i - 1)}>
            <Icon name="left" size={12} />
            Back
          </button>
          <span className="tour-n" aria-label={`Page ${i + 1} of ${pages.length}`}>
            {pages.map((_, k) => (
              <i key={k} className={k === i ? 'on' : ''} />
            ))}
            <b>
              {i + 1} / {pages.length}
            </b>
          </span>
          <button type="button" className="btn dark" onClick={() => (last ? onClose() : setI(i + 1))}>
            {last ? 'Done' : 'Next'}
            {!last && <Icon name="right" size={12} />}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Places items of the given sizes along a line, each as near its wish as it can without overlapping
 * (gap between neighbours), inside [lo, hi]. Wishes must be sorted.
 */
function spread(wish: number[], size: number[], gap: number, lo: number, hi: number): number[] {
  const out = wish.slice();
  const half = (k: number) => size[k]! / 2;
  for (let k = 0; k < out.length; k++) out[k] = Math.max(out[k]!, k ? out[k - 1]! + half(k - 1) + gap + half(k) : lo + half(k));
  for (let k = out.length - 1; k >= 0; k--) out[k] = Math.min(out[k]!, k < out.length - 1 ? out[k + 1]! - half(k + 1) - gap - half(k) : hi - half(k));
  return out.map((v, k) => Math.max(lo + half(k), v));
}

type Side = 't' | 'b' | 'l' | 'r';
type Mark = GuideShot['marks'][number];
/** The control's box as fractions of the picture */
const boxOf = (m: Mark): [number, number, number, number] => {
  const [x, y, w, h] = m.b ?? [m.x, m.y, 0, 0];
  // a control running past the edge of the picture: keep the part inside it
  const x0 = Math.max(0, x);
  const y0 = Math.max(0, y);
  return [x0, y0, Math.max(0, Math.min(1, x + w) - x0), Math.max(0, Math.min(1, y + h) - y0)];
};

/** Each control leads out through the nearest edge of the picture, so as little of the picture is crossed as can be */
function sides(marks: Mark[], w: number, h: number): Side[] {
  return marks.map((m) => {
    if (m.side) return m.side;
    const [bx, by, bw, bh] = boxOf(m);
    const d: [Side, number][] = [
      ['l', bx * w],
      ['r', (1 - bx - bw) * w],
      ['t', by * h],
      ['b', (1 - by - bh) * h],
    ];
    return d.sort((a, b) => a[1] - b[1])[0]![0];
  });
}

/** Ring: radius, and its fixed distance from the control's edge */
const RING = 4;
const RING_GAP = 4;
/** Label column beside the picture; band above and below it */
const SIDE = 226;
/** Where lines turn: between these distances from the picture's edge; labels start beyond */
const TURN = [8, 34] as const;
const TO_LABEL = 42;
const LABEL_W = 150;
const textWidth = (t: string) => Math.min(LABEL_W, t.length * 6.9 + 6);
const textLines = (t: string) => Math.ceil((t.length * 6.9 + 6) / LABEL_W);

interface Placed {
  k: number;
  label: string;
  side: Side;
  /** ring centre */
  rx: number;
  ry: number;
  /** label anchor */
  lx: number;
  ly: number;
  path: string;
}

/**
 * Lays out the marks of a picture drawn at (x, y, w, h): a ring a fixed distance outside each control, a line of
 * straight horizontal and vertical runs from the ring out of the picture to its label. Labels along one edge keep
 * the order of their controls; where a label has to move away from its control's line, the turns are staggered
 * so no two lines cross or overlap.
 */
function layout(marks: Mark[], x: number, y: number, w: number, h: number, W: number, H: number): Placed[] {
  const side = sides(marks, w, h);
  const out: Placed[] = [];
  for (const sd of ['l', 'r', 't', 'b'] as Side[]) {
    const group = marks.map((m, k) => ({ m, k })).filter((g) => side[g.k] === sd);
    if (!group.length) continue;
    const vertical = sd === 'l' || sd === 'r';
    const ring = group.map(({ m }) => {
      const [bx, by, bw, bh] = boxOf(m);
      const d = RING_GAP + RING;
      if (sd === 'l') return { rx: x + bx * w - d, ry: y + (by + bh / 2) * h };
      if (sd === 'r') return { rx: x + (bx + bw) * w + d, ry: y + (by + bh / 2) * h };
      if (sd === 't') return { rx: x + (bx + bw / 2) * w, ry: y + by * h - d };
      return { rx: x + (bx + bw / 2) * w, ry: y + (by + bh) * h + d };
    });
    const idx = group.map((_, i) => i).sort((a, b) => (vertical ? ring[a]!.ry - ring[b]!.ry : ring[a]!.rx - ring[b]!.rx));
    const along = idx.map((i) => (vertical ? ring[i]!.ry : ring[i]!.rx));
    const sizes = idx.map((i) => (vertical ? textLines(group[i]!.m.label) * 16 : textWidth(group[i]!.m.label)));
    const pos = vertical ? spread(along, sizes, 8, 10, H - 10) : spread(along, sizes, 14, 16, W - 16);
    // edge of the picture the lines leave by, and the direction away from it
    const edge = sd === 'l' ? x : sd === 'r' ? x + w : sd === 't' ? y : y + h;
    const out1 = sd === 'l' || sd === 't' ? -1 : 1;
    // turns: lines moved one way turn nearer the picture the further along they are, so none cross
    const moved = idx.map((_, j) => pos[j]! - along[j]!);
    const pos1 = idx.map((_, j) => j).filter((j) => moved[j]! > 0.5);
    const neg1 = idx.map((_, j) => j).filter((j) => moved[j]! < -0.5);
    const turn = new Map<number, number>();
    const step = (n: number) => (n > 1 ? (TURN[1] - TURN[0]) / (n - 1) : 0);
    pos1.forEach((j, q) => turn.set(j, TURN[1] - q * step(pos1.length)));
    neg1.forEach((j, q) => turn.set(j, TURN[0] + q * step(neg1.length)));
    idx.forEach((i, j) => {
      const { m } = group[i]!;
      const r = ring[i]!;
      const p = pos[j]!;
      const end = edge + out1 * TO_LABEL;
      const t = turn.get(j);
      let pts: [number, number][];
      if (vertical) {
        const sx = r.rx + out1 * RING;
        pts = t == null ? [[sx, r.ry], [end, r.ry]] : [[sx, r.ry], [edge + out1 * t, r.ry], [edge + out1 * t, p], [end, p]];
        out.push({ k: group[i]!.k, label: m.label, side: sd, rx: r.rx, ry: r.ry, lx: end, ly: t == null ? r.ry : p, path: pts.map((q) => q.join(',')).join(' ') });
      } else {
        const sy = r.ry + out1 * RING;
        pts = t == null ? [[r.rx, sy], [r.rx, end]] : [[r.rx, sy], [r.rx, edge + out1 * t], [p, edge + out1 * t], [p, end]];
        out.push({ k: group[i]!.k, label: m.label, side: sd, rx: r.rx, ry: r.ry, lx: t == null ? r.rx : p, ly: end, path: pts.map((q) => q.join(',')).join(' ') });
      }
    });
  }
  return out;
}

function useBox(shot: GuideShot) {
  const box = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const [size, setSize] = useState<{ W: number; H: number; x: number; y: number; w: number; h: number } | null>(null);
  const measure = useCallback(() => {
    const b = box.current;
    const im = img.current;
    if (!b || !im || !im.offsetWidth) return;
    setSize({ W: b.clientWidth, H: b.clientHeight, x: im.offsetLeft, y: im.offsetTop, w: im.offsetWidth, h: im.offsetHeight });
  }, []);
  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (box.current) ro.observe(box.current);
    if (img.current) ro.observe(img.current);
    return () => ro.disconnect();
  }, [measure, shot]);
  return { box, img, size, measure };
}

/** Computer: a screenshot with a line from each marked control out to a few words beside or above / below it */
function Shot({ shot }: { shot: GuideShot }) {
  const { box, img, size, measure } = useBox(shot);
  const side = sides(shot.marks, size?.w ?? shot.w, size?.h ?? shot.h);
  // band above / below: the line out of the picture, then the tallest label there, then a margin
  const band = (sd: Side) => {
    const ls = shot.marks.filter((_, k) => side[k] === sd).map((m) => textLines(m.label));
    return ls.length ? TO_LABEL + 3 + Math.max(...ls) * 16 + 14 : 0;
  };
  const placed = size ? layout(shot.marks, size.x, size.y, size.w, size.h, size.W, size.H) : [];
  return (
    <div className="tour-shot">
      <div className="ts-box" ref={box} style={{ padding: `${band('t')}px ${SIDE}px ${band('b')}px` }}>
        <img ref={img} src={shot.src} alt="" width={shot.w} height={shot.h} onLoad={measure} draggable={false} style={{ maxHeight: `min(560px, calc(100dvh - ${355 + band('t') + band('b')}px))` }} />
        {size && (
          <svg className="ts-lines" width={size.W} height={size.H} aria-hidden="true">
            {placed.map((m) => (
              <g key={m.k}>
                <polyline points={m.path} className="ts-halo" />
                <polyline points={m.path} className="ts-line" />
                <circle cx={m.rx} cy={m.ry} r={RING} className="ts-dot" />
              </g>
            ))}
          </svg>
        )}
        {placed.map((m) => (
          <span
            key={m.k}
            className={`ts-label ${m.side}`}
            style={
              m.side === 'l'
                ? { right: size!.W - m.lx + 6, top: m.ly }
                : m.side === 'r'
                  ? { left: m.lx + 6, top: m.ly }
                  : m.side === 't'
                    ? { left: m.lx, bottom: size!.H - m.ly + 3 }
                    : { left: m.lx, top: m.ly + 3 }
            }
          >
            {m.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Where a phone label may go, around its control */
type Rect = { x: number; y: number; w: number; h: number };
const hit = (a: Rect, b: Rect, m = 3) => a.x < b.x + b.w + m && b.x < a.x + a.w + m && a.y < b.y + b.h + m && b.y < a.y + a.h + m;
const PHONE_LABEL_W = 128;
/** Label box: text up to PHONE_LABEL_W wide, 14 px lines, plus its padding (5 px across, 3 px down) */
const phoneLabel = (t: string) => {
  const tw = t.length * 6.3 + 2;
  return { w: Math.min(PHONE_LABEL_W, tw) + 10, h: Math.ceil(tw / PHONE_LABEL_W) * 14 + 6 };
};

const PAD = 3;
const GAP = 5;
/** How far words may sit from their control before fewer controls are shown at a time */
const NEAR = 30;

/** Frames round the controls and the nearest free place for each one's words; ok when all are near */
function place(marks: Mark[], W: number, H: number) {
  const frames: Rect[] = marks.map((m) => {
    const [bx, by, bw, bh] = boxOf(m);
    return { x: bx * W - PAD, y: by * H - PAD, w: bw * W + PAD * 2, h: bh * H + PAD * 2 };
  });
  const labels: (Rect & { k: number })[] = [];
  let ok = true;
  // smaller controls first: they have the fewest good places
  const order = frames.map((_, k) => k).sort((a, b) => frames[a]!.w * frames[a]!.h - frames[b]!.w * frames[b]!.h);
  for (const k of order) {
    const f = frames[k]!;
    const { w, h } = phoneLabel(marks[k]!.label);
    const gapTo = (r: Rect) => {
      const dx = Math.max(0, f.x - (r.x + r.w), r.x - (f.x + f.w));
      const dy = Math.max(0, f.y - (r.y + r.h), r.y - (f.y + f.h));
      // straight below / above / beside reads best: a little extra for places off to a corner
      return Math.hypot(dx, dy) + (dx > 0 && dy > 0 ? 12 : 0);
    };
    let best: Rect | null = null;
    let bestCost = Infinity;
    for (let y = 4; y <= H - 4 - h; y += 3) {
      for (let x = 4; x <= W - 4 - w; x += 3) {
        const r = { x, y, w, h };
        const g = gapTo(r);
        if (g < GAP || g >= bestCost) continue;
        if (frames.some((o) => hit(r, o)) || labels.some((o) => hit(r, o, 4))) continue;
        bestCost = g;
        best = r;
      }
    }
    if (!best || bestCost > NEAR) ok = false;
    labels.push({ ...(best ?? { x: Math.max(4, Math.min(W - 4 - w, f.x)), y: Math.min(H - 4 - h, f.y + f.h + GAP), w, h }), k });
  }
  return { frames, labels, ok };
}

/**
 * Phone: no room beside the picture, so a few controls at a time: the picture dimmed but for them, each framed,
 * its words written in the dimmed part right next to it. As many at a time (up to 3) as leave every one's words
 * close by; the arrows (or a tap on the picture) show the next few.
 */
function Spot({ shot }: { shot: GuideShot }) {
  const img = useRef<HTMLImageElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const measure = useCallback(() => {
    const im = img.current;
    if (im && im.offsetWidth) setSize({ w: im.offsetWidth, h: im.offsetHeight });
  }, []);
  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (img.current) ro.observe(img.current);
    return () => ro.disconnect();
  }, [measure, shot]);
  const [at, setAt] = useState(0);
  useEffect(() => setAt(0), [shot]);

  const plan = useMemo(() => {
    if (!size) return null;
    const mid = (m: Mark) => boxOf(m)[1] + boxOf(m)[3] / 2;
    const all = shot.marks.slice().sort((a, b) => mid(a) - mid(b) || boxOf(a)[0] - boxOf(b)[0]);
    // in reading order, each control joins the current few if all their words still fit close by
    const groups: Mark[][] = [];
    for (const m of all) {
      const g = groups[groups.length - 1];
      if (g && g.length < 3 && place([...g, m], size.w, size.h).ok) g.push(m);
      else groups.push([m]);
    }
    return groups.map((g) => ({ marks: g, ...place(g, size.w, size.h) }));
  }, [shot, size]);
  const n = plan?.length ?? 0;
  const cur = plan?.[Math.min(at, n - 1)];
  const frames = cur?.frames ?? [];
  const labels = cur?.labels ?? [];
  const marks = cur?.marks ?? [];
  const id = `spot-${shot.w}-${shot.h}-${shot.marks.length}-${at}`;
  return (
    <div className="tour-shot spot">
      <div className="ts-frame" onClick={() => n > 1 && setAt((at + 1) % n)}>
        <img ref={img} src={shot.src} alt="" width={shot.w} height={shot.h} onLoad={measure} draggable={false} />
        {size && (
          <svg className="ts-dim" width={size.w} height={size.h} aria-hidden="true">
            <defs>
              <mask id={id}>
                <rect width={size.w} height={size.h} fill="#fff" />
                {frames.map((f, k) => (
                  <rect key={k} x={f.x} y={f.y} width={f.w} height={f.h} rx={5} fill="#000" />
                ))}
              </mask>
            </defs>
            <rect width={size.w} height={size.h} className="ts-shade" mask={`url(#${id})`} />
            {frames.map((f, k) => (
              <rect key={k} x={f.x} y={f.y} width={f.w} height={f.h} rx={5} className="ts-ring" />
            ))}
            {labels.map((l) => {
              // where the words sit away from their control, a line of straight runs joins them
              const f = frames[l.k]!;
              const ox = [Math.max(f.x, l.x + 4), Math.min(f.x + f.w, l.x + l.w - 4)] as const;
              const oy = [Math.max(f.y, l.y + 3), Math.min(f.y + f.h, l.y + l.h - 3)] as const;
              const below = l.y >= f.y + f.h;
              const above = l.y + l.h <= f.y;
              const right = l.x >= f.x + f.w;
              const gap = Math.max(below ? l.y - f.y - f.h : above ? f.y - l.y - l.h : 0, right ? l.x - f.x - f.w : l.x + l.w <= f.x ? f.x - l.x - l.w : 0);
              if (gap <= GAP + 4) return null;
              let pts: number[][];
              if (ox[0] <= ox[1] && (below || above)) {
                const x = (ox[0] + ox[1]) / 2;
                pts = [[x, below ? f.y + f.h : f.y], [x, below ? l.y : l.y + l.h]];
              } else if (oy[0] <= oy[1]) {
                const y = (oy[0] + oy[1]) / 2;
                pts = [[right ? f.x + f.w : f.x, y], [right ? l.x : l.x + l.w, y]];
              } else {
                // off to a corner: down (or up) out of the control, then across to the words
                const x = f.x + f.w / 2;
                const y = l.y + l.h / 2;
                pts = [[x, below ? f.y + f.h : f.y], [x, y], [right ? l.x : l.x + l.w, y]];
              }
              return <polyline key={l.k} points={pts.map((q) => q.join(',')).join(' ')} className="ts-tie" />;
            })}
          </svg>
        )}
        {labels.map((l) => (
          <span key={l.k} className="ts-note" style={{ left: l.x, top: l.y, width: l.w, minHeight: l.h }}>
            {marks[l.k]!.label}
          </span>
        ))}
      </div>
      {n > 1 && (
        <div className="ts-steps">
          <button type="button" className="ts-arrow" aria-label="Previous controls" disabled={at === 0} onClick={() => setAt(at - 1)}>
            <Icon name="left" size={13} />
          </button>
          <span aria-label={`${at + 1} of ${n}`}>
            {plan!.map((_, g) => (
              <i key={g} className={g === at ? 'on' : ''} />
            ))}
          </span>
          <button type="button" className="ts-arrow" aria-label="Next controls" disabled={at === n - 1} onClick={() => setAt(at + 1)}>
            <Icon name="right" size={13} />
          </button>
        </div>
      )}
    </div>
  );
}

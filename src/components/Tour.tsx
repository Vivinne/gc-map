'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
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
const boxOf = (m: Mark) => m.b ?? [m.x, m.y, 0, 0];

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
const SIDE = 190;
const BAND = 64;
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
    const pos = vertical ? spread(along, sizes, 8, 0, H) : spread(along, sizes, 14, 0, W);
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
  const hasT = side.includes('t');
  const hasB = side.includes('b');
  const placed = size ? layout(shot.marks, size.x, size.y, size.w, size.h, size.W, size.H) : [];
  return (
    <div className="tour-shot">
      <div className="ts-box" ref={box} style={{ padding: `${hasT ? BAND : 0}px ${SIDE}px ${hasB ? BAND : 0}px` }}>
        <img ref={img} src={shot.src} alt="" width={shot.w} height={shot.h} onLoad={measure} draggable={false} />
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

/**
 * Phone: no room beside the picture, so one control at a time: the picture is dimmed but for that control, its
 * words are under the picture, and arrows step to the previous and next control.
 */
function Spot({ shot }: { shot: GuideShot }) {
  // reading order: top to bottom, then left to right
  const mid = (m: Mark) => boxOf(m)[1] + boxOf(m)[3] / 2;
  const order = shot.marks.slice().sort((a, b) => mid(a) - mid(b) || boxOf(a)[0] - boxOf(b)[0]);
  const [at, setAt] = useState(0);
  useEffect(() => setAt(0), [shot]);
  const cur = order[at];
  const go = (d: number) => setAt((at + d + order.length) % order.length);
  const pad = 1.2; // % of the picture around the control
  const [bx, by, bw, bh] = cur ? boxOf(cur) : [0, 0, 0, 0];
  return (
    <div className="tour-shot spot">
      <div className="ts-frame">
        <img src={shot.src} alt="" width={shot.w} height={shot.h} draggable={false} />
        {cur && (
          <span
            className="ts-hole"
            key={at}
            style={{ left: `${bx * 100 - pad}%`, top: `calc(${by * 100}% - ${(pad * shot.w) / shot.h}%)`, width: `${bw * 100 + pad * 2}%`, height: `calc(${bh * 100}% + ${(pad * 2 * shot.w) / shot.h}%)` }}
          />
        )}
      </div>
      {cur && (
        <div className="ts-say">
          <button type="button" className="ts-arrow" aria-label="Previous" onClick={() => go(-1)}>
            <Icon name="left" size={14} />
          </button>
          <p aria-live="polite">
            {cur.label}
            <small>
              {at + 1} of {order.length}
            </small>
          </p>
          <button type="button" className="ts-arrow" aria-label="Next" onClick={() => go(1)}>
            <Icon name="right" size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

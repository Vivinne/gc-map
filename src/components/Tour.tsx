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
          {shot && <Shot shot={shot} numbered={mobile} />}
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
/** Each control leads out through the nearest edge of the picture, so as little of the picture is crossed as can be */
function sides(marks: GuideShot['marks'], w: number, h: number): Side[] {
  return marks.map((m) => {
    if (m.side) return m.side;
    const [bx, by, bw, bh] = m.b ?? [m.x, m.y, 0, 0];
    const d: [Side, number][] = [
      ['l', bx * w],
      ['r', (1 - bx - bw) * w],
      ['t', by * h],
      ['b', (1 - by - bh) * h],
    ];
    return d.sort((a, b) => a[1] - b[1])[0]![0];
  });
}

/** Room for labels: beside the picture (computer words / phone numbers) and above or below it */
const ROOM = { words: { side: 176, top: 40 }, numbers: { side: 30, top: 30 } };
/** Rough width of a label, to keep the ones above or below the picture apart */
const labelWidth = (t: string) => t.length * 7.2 + 4;

/**
 * A screenshot with a line from each marked control out of it: to words beside it (computer), or to a hollow
 * number (phone) with the words listed underneath.
 */
function Shot({ shot, numbered }: { shot: GuideShot; numbered: boolean }) {
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

  const room = numbered ? ROOM.numbers : ROOM.words;
  const side = sides(shot.marks, size?.w ?? shot.w, size?.h ?? shot.h);
  // the line starts at the edge of the control that faces its label, so the mark does not cover the control
  const marks = shot.marks.map((m, k) => {
    const sd = side[k]!;
    const [bx, by, bw, bh] = m.b ?? [m.x, m.y, 0, 0];
    const at = sd === 'l' ? { x: bx, y: by + bh / 2 } : sd === 'r' ? { x: bx + bw, y: by + bh / 2 } : sd === 't' ? { x: bx + bw / 2, y: by } : { x: bx + bw / 2, y: by + bh };
    return { ...m, ...at, k, side: sd };
  });
  const hasT = marks.some((m) => m.side === 't');
  const hasB = marks.some((m) => m.side === 'b');
  type Placed = (typeof marks)[number] & { px: number; py: number; lx: number; ly: number };
  const placed: Placed[] = [];
  if (size) {
    const { x, y, w, h, W } = size;
    for (const sd of ['l', 'r', 't', 'b'] as Side[]) {
      const group = marks.filter((m) => m.side === sd);
      if (!group.length) continue;
      if (sd === 'l' || sd === 'r') {
        group.sort((a, b) => a.y - b.y);
        const ys = spread(group.map((m) => y + m.y * h), group.map(() => (numbered ? 20 : 18)), numbered ? 4 : 10, y, y + h);
        const lx = sd === 'l' ? x - (numbered ? 15 : 34) : x + w + (numbered ? 15 : 34);
        // the ring sits just outside the control, not on it
        group.forEach((m, k) => placed.push({ ...m, px: x + m.x * w + (sd === 'l' ? -5 : 5), py: y + m.y * h, lx, ly: ys[k]! }));
      } else {
        group.sort((a, b) => a.x - b.x);
        const ws = group.map((m) => (numbered ? 20 : labelWidth(m.label)));
        const xs = spread(group.map((m) => x + m.x * w), ws, numbered ? 4 : 12, 0, W);
        const ly = sd === 't' ? y - room.top / 2 : y + h + room.top / 2;
        group.forEach((m, k) => placed.push({ ...m, px: x + m.x * w, py: y + m.y * h + (sd === 't' ? -5 : 5), lx: xs[k]!, ly }));
      }
    }
  }
  // numbers read in order around the picture: top, left, right, bottom; each top to bottom, left to right
  const rank: Record<Side, number> = { t: 0, l: 1, r: 2, b: 3 };
  const order = placed.slice().sort((a, b) => rank[a.side] - rank[b.side] || a.ly - b.ly || a.lx - b.lx);
  const num = new Map(order.map((m, k) => [m.k, k + 1]));

  const path = (m: Placed) => {
    if (m.side === 'l' || m.side === 'r') {
      // straight out along its own row to the edge, then bend in the margin to its label
      const edge = m.side === 'l' ? size!.x : size!.x + size!.w;
      const bend = m.side === 'l' ? Math.min(edge - 4, m.lx + 12) : Math.max(edge + 4, m.lx - 12);
      return `${m.px},${m.py} ${edge},${m.py} ${bend},${m.ly} ${m.lx},${m.ly}`;
    }
    // straight up or down to the edge, then bend in the margin to its label
    const edge = m.side === 't' ? size!.y : size!.y + size!.h;
    const end = m.side === 't' ? m.ly + (numbered ? 10 : 8) : m.ly - (numbered ? 10 : 8);
    return `${m.px},${m.py} ${m.px},${edge} ${m.lx},${end}`;
  };

  return (
    <div className={`tour-shot${numbered ? ' num' : ''}`}>
      <div className="ts-box" ref={box} style={{ padding: `${hasT ? room.top : 0}px ${room.side}px ${hasB ? room.top : 0}px` }}>
        <img ref={img} src={shot.src} alt="" width={shot.w} height={shot.h} onLoad={measure} draggable={false} />
        {size && (
          <svg className="ts-lines" width={size.W} height={size.H} aria-hidden="true">
            {placed.map((m) => (
              <g key={m.k}>
                <polyline points={path(m)} className="ts-halo" />
                <polyline points={path(m)} className="ts-line" />
                <circle cx={m.px} cy={m.py} r={4} className="ts-dot" />
                {numbered && (
                  <>
                    <circle cx={m.lx} cy={m.ly} r={10} className="ts-num" />
                    <text x={m.lx} y={m.ly + 3.8} textAnchor="middle" className="ts-numt">
                      {num.get(m.k)}
                    </text>
                  </>
                )}
              </g>
            ))}
          </svg>
        )}
        {size &&
          !numbered &&
          placed.map((m) => (
            <span
              key={m.k}
              className={`ts-label ${m.side}`}
              style={
                m.side === 'l'
                  ? { right: size.W - m.lx + 4, top: m.ly }
                  : m.side === 'r'
                    ? { left: m.lx + 4, top: m.ly }
                    : { left: m.lx, top: m.ly }
              }
            >
              {m.label}
            </span>
          ))}
      </div>
      {numbered && size && (
        <ol className="ts-legend">
          {order.map((m) => (
            <li key={m.k}>
              <i>{num.get(m.k)}</i>
              {m.label}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

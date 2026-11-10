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

/**
 * Phones get the page guides only once they are approved; until then a phone keeps the getting-started card,
 * the step-by-step help windows and the earlier Settings. scripts/guide-shots.cjs and the previews switch it on.
 */
export const PHONE_TOURS = true;
/** Whether this screen gets the page guides */
export const toursOn = (mobile: boolean) => !mobile || PHONE_TOURS;

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
  /** One line, never wrapping */
  line: string;
  /** Screenshot name in SHOTS, without the d- / m- prefix */
  shot: string;
  /** Phone: the marked controls this page explains (by their words), at most 3; computer: all of the picture's */
  marks?: string[];
  /** A line of keys under the picture (computer only) */
  keys?: [string[], string][];
}

const DESK_PAGES: Record<TourId, Page[]> = {
  map: [
    { title: 'The map', line: 'Every building of the course, by place and style.', shot: 'map-main' },
    { title: 'Filters and list', line: 'Narrow the map; the list shows what is left.', shot: 'map-filters' },
    { title: 'Architecture', line: 'Click a building on the map or in a list.', shot: 'map-card' },
    {
      title: 'Search',
      line: 'Type a name, or pick up where you left off.',
      shot: 'map-search',
      keys: [
        [['/'], 'Search'],
        [['F'], 'Filters'],
        [['←', '→'], 'Previous / next'],
        [['S'], 'Star'],
        [['Esc'], 'Close'],
      ],
    },
  ],
  quiz: [
    { title: 'Quiz', line: 'Questions on the city, architect and style of each building.', shot: 'quiz-home' },
    { title: 'Answering', line: 'Four choices, one right.', shot: 'quiz-run' },
    { title: 'The result', line: 'Skipped questions do not count.', shot: 'quiz-result' },
  ],
  progress: [{ title: 'Progress', line: 'A building is mastered when its city, architect and style are each right on 2 different days.', shot: 'progress' }],
  settings: [{ title: 'Settings', line: 'The guides again, and your progress on another device.', shot: 'settings' }],
};

/** Phone: each page one picture with up to 3 controls marked, every page complete in itself (nothing to step through) */
const PHONE_PAGES: Record<TourId, Page[]> = {
  map: [
    { title: 'The map', line: 'Every building of the course.', shot: 'map-main', marks: ['Opens filters and the list', 'Lists the buildings in a city', 'Opens a building'] },
    { title: 'Map buttons', line: 'Back to a wider view.', shot: 'map-main', marks: ['Shows the whole country', 'Shows the whole map'] },
    { title: 'Filters and list', line: 'Narrow the map to what you study.', shot: 'map-filters', marks: ['Tap tags to filter the map', 'Opens a building'] },
    { title: 'Architecture', line: 'Swipe the card for the next one.', shot: 'map-card', marks: ['Back to the city', 'Previous or next building', 'Shows all with this tag'] },
    { title: 'Architecture', line: 'Drag the card up for more.', shot: 'map-card', marks: ['Stars it or adds it to a list', 'Lists the others in this city'] },
  ],
  quiz: [
    { title: 'Quiz', line: 'City, architect and style.', shot: 'quiz-home', marks: ['Starts your own quiz', 'Chooses what to ask', 'Starts 5 quick questions'] },
    { title: 'Answering', line: 'Four choices, one right.', shot: 'quiz-run', marks: ['Pick one answer', 'Next, or skip if unsure', 'Ends the quiz at any time'] },
    { title: 'The result', line: 'Skipped questions do not count.', shot: 'quiz-result', marks: ['Right out of answered', 'Quizzes only the wrong ones', 'New questions of the same kind'] },
  ],
  progress: [{ title: 'Progress', line: 'Mastered: right on 2 different days.', shot: 'progress', marks: ['Lists those buildings', 'Lists every wrong answer'] }],
  settings: [{ title: 'Settings', line: 'Guides, and progress on another device.', shot: 'settings', marks: ['Opens a guide again', 'Saves your progress to a file', 'Loads it on another device'] }],
};

const PAGES = (id: TourId, mobile: boolean) => (mobile ? PHONE_PAGES : DESK_PAGES)[id];

/** Width of a line of text in the given CSS font (measured, so labels can be sized never to wrap) */
let ctx: CanvasRenderingContext2D | null = null;
function textW(t: string, font: string): number {
  if (typeof document !== 'undefined' && !ctx) ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return t.length * 7;
  ctx.font = font;
  return Math.ceil(ctx.measureText(t).width);
}
const FONT_FAMILY = () => (typeof document !== 'undefined' ? getComputedStyle(document.body).fontFamily : 'system-ui, sans-serif');

/** One guide page's picture (and keys) */
function PageBody({ p, mobile, fitH }: { p: Page; mobile: boolean; fitH?: number }) {
  const shot = SHOTS[`${mobile ? 'm' : 'd'}-${p.shot}`];
  return (
    <>
      {shot && (mobile ? <Spot shot={shot} only={p.marks} fitH={fitH} /> : <Shot shot={shot} fitH={fitH} />)}
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
    </>
  );
}

/** How long the window takes to fade away when closed */
const CLOSE_MS = 160;

export default function Tour({ id, mobile, onClose: close }: { id: TourId; mobile: boolean; onClose(): void }) {
  const pages = PAGES(id, mobile);
  const [i, setI] = useState(0);
  const p = pages[i]!;
  const last = i === pages.length - 1;
  // closing: the window fades out first, then goes
  const [leaving, setLeaving] = useState(false);
  const onClose = useCallback(() => {
    if (leaving) return;
    setLeaving(true);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.setTimeout(close, reduced ? 0 : CLOSE_MS);
  }, [close, leaving]);
  // every page's picture decoded up front, so turning a page never waits for one
  useEffect(() => {
    for (const pg of pages) {
      const sh = SHOTS[`${mobile ? 'm' : 'd'}-${pg.shot}`];
      if (!sh) continue;
      const im = new Image();
      im.src = sh.src;
      im.decode?.().catch(() => {});
    }
  }, [pages, mobile]);
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
  // Every page's copy is laid out unseen with its picture as large as the width allows. Each page is then its
  // picture plus the rest (title room, labels above and below, keys). All pages get one height: the smallest
  // that every page can reach, within the screen; each picture is sized to fill it, so no page has an empty band
  // and the window keeps one size from page to page.
  const pgs = useRef<HTMLDivElement>(null);
  const [imgH, setImgH] = useState<number[] | null>(null);
  const [pgH, setPgH] = useState(0);
  const [, setTick] = useState(0);
  useLayoutEffect(() => {
    setImgH(null);
    setPgH(0);
    const again = () => {
      setImgH(null);
      setPgH(0);
    };
    window.addEventListener('resize', again);
    return () => window.removeEventListener('resize', again);
  }, [id, mobile]);
  useLayoutEffect(() => {
    if (imgH) {
      // labels need their room: a page whose labels made it taller than planned sets the window instead
      const box = pgs.current;
      if (!box) return;
      const h = Math.max(...[...box.querySelectorAll<HTMLElement>('.tour-pg-m')].map((e) => e.offsetHeight));
      if (h > pgH + 1) setPgH(h);
      return;
    }
    const box = pgs.current;
    const win = box?.closest<HTMLElement>('.tour');
    if (!box || !win) return;
    const copies = [...box.querySelectorAll<HTMLElement>('.tour-pg-m')];
    const ims = copies.map((c) => c.querySelector('img')?.offsetHeight ?? 0);
    // pictures not laid out yet: look again next frame
    if (!ims.every((h) => h > 0) || !copies.length) {
      const f = requestAnimationFrame(() => setTick((t) => t + 1));
      return () => cancelAnimationFrame(f);
    }
    const rest = copies.map((c, k) => c.offsetHeight - ims[k]!);
    // everything in the window but the picture area: its top and foot, the title, the line, the gaps
    const bd = box.closest<HTMLElement>('.tour-bd')!;
    const chrome = win.offsetHeight - bd.clientHeight + (box.getBoundingClientRect().top - bd.getBoundingClientRect().top + bd.scrollTop) + parseFloat(getComputedStyle(bd).paddingBottom);
    const room = window.innerHeight - (mobile ? 16 : 48) - chrome;
    const t = Math.min(room, ...copies.map((_, k) => rest[k]! + ims[k]!));
    setImgH(rest.map((r) => Math.max(120, t - r)));
    setPgH(t);
  });
  const fit = (k: number) => (imgH ? imgH[k] : 4000);
  return createPortal(
    <div className={`tour-bg${leaving ? ' out' : ''}`}>
      <div className={`tour${mobile ? ' m' : ''}`} role="dialog" aria-modal="true" aria-label={`${TOUR_LABEL[id]} guide`}>
        <div className="tour-h">
          <span className="tour-k">{TOUR_LABEL[id]} guide</span>
          <button type="button" className="tour-x" aria-label="Close" onClick={onClose}>
            <Icon name="close" size={14} />
          </button>
        </div>
        {/* the window keeps one size for every page; only the page's words and picture change */}
        <div className="tour-bd">
          <h2>{p.title}</h2>
          <p className="tour-line">{p.line}</p>
          {/* the picture area is as tall as the tallest page's (measured from hidden copies of every page), so the
              window keeps one size from page to page and has no empty band */}
          <div className="tour-pgs" ref={pgs} style={pgH ? { height: pgH } : undefined}>
            <div className="tour-pg" key={i}>
              <PageBody p={pages[i]!} mobile={mobile} fitH={fit(i)} />
            </div>
            <div className="tour-measure" aria-hidden="true">
              {pages.map((pg, k) => (
                <div className="tour-pg-m" key={k}>
                  <PageBody p={pg} mobile={mobile} fitH={fit(k)} />
                </div>
              ))}
            </div>
          </div>
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
/** Room beside the picture for its widest one-line label: line out, gap, label, margin to the edge */
const sideRoom = (labels: string[]) => Math.max(120, TO_LABEL + 6 + Math.max(0, ...labels.map(textWidth)) + 18);
/** Where lines turn: between these distances from the picture's edge; labels start beyond */
const TURN = [8, 34] as const;
const TO_LABEL = 42;
/** Desktop labels: one line each, 12.5 px semibold */
const textWidth = (t: string) => textW(t, `600 12.5px ${FONT_FAMILY()}`) + 2;
const textLines = (_t: string) => 1;

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
function Shot({ shot, fitH }: { shot: GuideShot; fitH?: number }) {
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
      <div className="ts-box" ref={box} style={{ padding: `${band('t')}px ${sideRoom(shot.marks.filter((_, k) => side[k] === 'l' || side[k] === 'r').map((m) => m.label))}px ${band('b')}px` }}>
        <img ref={img} src={shot.src} alt="" width={shot.w} height={shot.h} onLoad={measure} draggable={false} style={{ maxHeight: fitH ? fitH : `min(560px, calc(100dvh - ${355 + band('t') + band('b')}px))` }} />
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
/** Tip bubble: one line of 11 px bold text, 6 px padding across, 3 px down */
const phoneLabel = (t: string) => ({ w: textW(t, `700 11px ${FONT_FAMILY()}`) + 18, h: 20 });

const PAD = 3;

type Tip = Rect & { k: number; side: Side; /** where the arrow touches the bubble, along its edge */ at: number };
/** Arrow of a tip bubble: its length out of the bubble, and the least distance from the bubble's corners */
const ARROW = 8;
/** Room left between the arrow's tip and the ring round the control */
const TIP_GAP = 5;
/** Bubble's distance from the control's frame: arrow, then the room */
const OUT = ARROW + TIP_GAP;
const ARROW_IN = 12;

/**
 * A tip bubble for each control, touching it with its arrow: below, above, right or left of it, slid along that
 * side so the arrow still points into the control, covering no other control or bubble. Nearest the middle wins;
 * below and above before beside. ok when every control got one.
 */
function place(marks: Mark[], W: number, H: number) {
  const frames: Rect[] = marks.map((m) => {
    const [bx, by, bw, bh] = boxOf(m);
    return { x: bx * W - PAD, y: by * H - PAD, w: bw * W + PAD * 2, h: bh * H + PAD * 2 };
  });
  const tips: Tip[] = [];
  let ok = true;
  const failed: string[] = [];
  // smaller controls first: they have the fewest good places
  const order = frames.map((_, k) => k).sort((a, b) => frames[a]!.w * frames[a]!.h - frames[b]!.w * frames[b]!.h);
  for (const k of order) {
    const f = frames[k]!;
    const { w, h } = phoneLabel(marks[k]!.label);
    const cx = f.x + f.w / 2;
    const cy = f.y + f.h / 2;
    let best: Tip | null = null;
    let bestCost = Infinity;
    const free = (r: Rect) =>
      r.x >= 4 && r.y >= 4 && r.x + r.w <= W - 4 && r.y + r.h <= H - 4 && !frames.some((o) => hit(r, o, TIP_GAP + 2)) && !tips.some((o) => hit(r, o, 6));
    const tryAt = (r: Rect, side: Side, at: number, cost: number) => {
      if (cost < bestCost && free(r)) {
        bestCost = cost;
        best = { ...r, k, side, at };
      }
    };
    // above / below: the arrow at the control's middle (or as near it as the bubble allows, still inside it)
    for (const side of ['b', 't'] as Side[]) {
      const y = side === 'b' ? f.y + f.h + OUT : f.y - OUT - h;
      for (let x = Math.floor(cx - w + ARROW_IN); x <= cx - ARROW_IN; x += 2) {
        const ax = Math.max(x + ARROW_IN, Math.min(x + w - ARROW_IN, cx));
        if (ax < f.x + 3 || ax > f.x + f.w - 3) continue;
        tryAt({ x, y, w, h }, side, ax - x, Math.abs(x + w / 2 - cx) / 3 + (side === 't' ? 1 : 0));
      }
    }
    for (const side of ['r', 'l'] as Side[]) {
      const x = side === 'r' ? f.x + f.w + OUT : f.x - OUT - w;
      for (let y = Math.floor(cy - h + 8); y <= cy - 8; y += 2) {
        const ay = Math.max(y + 8, Math.min(y + h - 8, cy));
        if (ay < f.y + 2 || ay > f.y + f.h - 2) continue;
        tryAt({ x, y, w, h }, side, ay - y, 8 + Math.abs(y + h / 2 - cy) / 3);
      }
    }
    if (!best) {
      ok = false;
      failed.push(marks[k]!.label);
      best = { x: Math.max(4, Math.min(W - 4 - w, cx - w / 2)), y: Math.min(H - 4 - h, f.y + f.h + OUT), w, h, k, side: 'b', at: w / 2 };
    }
    tips.push(best);
  }
  return { frames, labels: tips, ok, failed };
}

/**
 * Phone: a few controls per guide page (up to 3), as phone apps' coach marks do: the picture only lightly veiled
 * (it must stay readable), each control clear and ringed in the guide's own colour, and a one-line dark tip
 * bubble pointing at it. Nothing to step through inside a page.
 */
function Spot({ shot, only, fitH }: { shot: GuideShot; only?: string[]; fitH?: number }) {
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
  const marks = useMemo(() => (only ? only.map((t) => shot.marks.find((m) => m.label === t)).filter((m): m is Mark => !!m) : shot.marks), [shot, only]);
  const laid = useMemo(() => (size ? place(marks, size.w, size.h) : null), [marks, size]);
  const frames = laid?.frames ?? [];
  const labels = laid?.labels ?? [];
  const id = `spot-${shot.w}-${shot.h}-${marks.map((m) => m.label).join('|').length}`;
  return (
    <div className="tour-shot spot" data-crowded={laid && !laid.ok ? laid.failed.join(' / ') : undefined}>
      <div className="ts-frame">
        <img ref={img} src={shot.src} alt="" width={shot.w} height={shot.h} onLoad={measure} draggable={false} style={fitH ? { maxHeight: fitH } : undefined} />
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
          </svg>
        )}
        {labels.map((l) => (
          <span key={l.k} className={`ts-tip ${l.side}`} style={{ left: l.x, top: l.y, width: l.w, height: l.h }}>
            {marks[l.k]!.label}
            <i style={l.side === 't' || l.side === 'b' ? { left: l.at } : { top: l.at }} />
          </span>
        ))}
      </div>
    </div>
  );
}

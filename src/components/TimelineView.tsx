'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { BUILDINGS, COUNTRIES, ERAS, byYear, formatYear, type Building } from '../lib/model';
import Facts from './Facts';
import MiniMap from './MiniMap';

interface Props {
  list: Building[];
  range: [number, number] | null;
  selectedId: string;
  mobile: boolean;
  onOpen(id: string): void;
}

/**
 * Year scale: piecewise linear, giving the dense recent centuries more room than antiquity.
 * Each segment is [start year, end year, relative width]. Monotonic, so any span reads left to right.
 */
const SEGMENTS: [number, number, number][] = [
  [-700, 0, 1],
  [0, 1000, 1],
  [1000, 1400, 1.2],
  [1400, 1600, 1.5],
  [1600, 1800, 1.5],
  [1800, 1900, 1.5],
  [1900, 2030, 2.4],
];
const REF_END = SEGMENTS.reduce((s, x) => s + x[2], 0);
function X(y: number): number {
  let acc = 0;
  for (const [a, b, w] of SEGMENTS) {
    if (y <= b) return acc + (Math.max(y, a) - a) / (b - a) * w;
    acc += w;
  }
  return REF_END;
}
const STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
const LANE_LABEL = 92;
const ROW = 20;

const laneName = (c: string) => (c === 'United Kingdom' ? 'UK' : c === 'United States' ? 'US' : c);

export default function TimelineView({ list, range, selectedId, mobile, onOpen }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);
  const [hover, setHover] = useState<string>('');
  useEffect(() => {
    if (!box.current) return;
    const ro = new ResizeObserver(([e]) => e && setWidth(Math.max(mobile ? 760 : 520, e.contentRect.width)));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, [mobile]);

  const dated = useMemo(() => list.filter((b) => b.y0 != null).sort(byYear), [list]);

  // Domain in reference units: the band range if set, else the span of the shown buildings
  const [d0, d1] = useMemo(() => {
    if (range) return [X(range[0]), Math.max(X(range[0]) + 0.01, X(range[1]))];
    if (!dated.length) return [0, REF_END];
    const a = X(dated[0]!.y0 as number);
    const b = X(dated[dated.length - 1]!.y0 as number);
    const pad = Math.max(0.02, (b - a) * 0.03);
    return [Math.max(0, a - pad), Math.min(REF_END, b + pad)];
  }, [range, dated]);

  const inner = width - LANE_LABEL - 40;
  const sx = (y: number) => LANE_LABEL + 10 + ((X(y) - d0) / (d1 - d0)) * inner;

  const ticks = useMemo(() => {
    const out: { y: number; x: number }[] = [];
    const lo = yearAtRef(d0);
    const hi = yearAtRef(d1);
    for (const [sa, sb] of SEGMENTS) {
      const a = Math.max(sa, lo);
      const b = Math.min(sb, hi);
      if (a > b) continue;
      const ppy = (sx(sb) - sx(sa)) / (sb - sa);
      const step = STEPS.find((st) => st * ppy >= 70) ?? 1000;
      for (let y = Math.ceil(a / step) * step; y <= b; y += step) out.push({ y, x: sx(y) });
    }
    out.sort((p, q) => p.x - q.x);
    const kept: typeof out = [];
    for (const t of out) if (!kept.length || t.x - kept[kept.length - 1]!.x >= 52) kept.push(t);
    return kept;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d0, d1, width]);

  const lanes = useMemo(() => {
    return COUNTRIES.map((c) => {
      const items = dated.filter((b) => b.country === c);
      const placed: { b: Building; x: number; row: number; flip: boolean }[] = [];
      const ends: { x1: number; x2: number; row: number }[] = [];
      for (const b of items) {
        const x = sx(b.y0 as number);
        if (x < LANE_LABEL || x > width - 20) continue;
        const tw = b.name.length * 6.3 + 18;
        const flip = x + tw > width - 10;
        const x1 = flip ? x - tw : x - 6;
        const x2 = flip ? x + 6 : x + tw;
        let row = 0;
        while (ends.some((e) => e.row === row && x1 < e.x2 + 4 && x2 > e.x1 - 4)) row++;
        ends.push({ x1, x2, row });
        placed.push({ b, x, row, flip });
      }
      const rows = placed.reduce((m, p) => Math.max(m, p.row + 1), 0);
      return { c, items, placed, height: Math.max(64, rows * ROW + 24) };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dated, d0, d1, width]);

  const totalH = lanes.reduce((s, l) => s + l.height, 0) + 36;
  const hb = BUILDINGS.find((b) => b.id === (hover || selectedId));
  let y0 = 36;

  return (
    <div className="tl">
      <div className="tl-scroll" ref={box}>
        <svg width={width} height={totalH} className="tl-svg">
          {ticks.map((t) => (
            <g key={t.y}>
              <line x1={t.x} x2={t.x} y1={28} y2={totalH} className="tl-grid" />
              <text x={t.x} y={18} textAnchor="middle" className="tl-tick">
                {formatYear(t.y)}
              </text>
            </g>
          ))}
          {lanes.map((l, i) => {
            const top = y0;
            y0 += l.height;
            return (
              <g key={l.c} transform={`translate(0,${top})`}>
                {i % 2 === 0 && <rect x={0} y={0} width={width} height={l.height} className="tl-lane" />}
                <text x={16} y={22} className="tl-lane-n">
                  {laneName(l.c)}
                </text>
                <text x={16} y={39} className="tl-lane-c">
                  {l.items.length}
                </text>
                {l.placed.map(({ b, x, row, flip }) => {
                  const cy = 18 + row * ROW;
                  const on = b.id === hover || b.id === selectedId;
                  return (
                    <g
                      key={b.id}
                      className={`tl-item${on ? ' on' : ''}`}
                      onPointerEnter={() => setHover(b.id)}
                      onPointerLeave={() => setHover((h) => (h === b.id ? '' : h))}
                      onClick={() => onOpen(b.id)}
                      role="button"
                      tabIndex={0}
                      aria-label={`${b.name}, ${b.yearShort}`}
                      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpen(b.id)}
                      onFocus={() => setHover(b.id)}
                    >
                      <circle cx={x} cy={cy} r={on ? 7 : 5} fill={ERAS[b.era].color} stroke={on ? '#000' : '#fff'} strokeWidth={on ? 3 : 1.5} />
                      <text x={flip ? x - 10 : x + 10} y={cy + 4} textAnchor={flip ? 'end' : 'start'}>
                        {b.name}
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
        {list.length === 0 && <p className="empty tl-empty">0</p>}
      </div>
      {!mobile && (
        <aside className="tl-side">
          <MiniMap width={236} height={170} items={dated} hot={hover} />
          {hb && (
            <div className="tcard">
              <div className="th" style={{ background: ERAS[hb.era].color }}>
                {hb.name.toUpperCase()}
              </div>
              <Facts b={hb} />
            </div>
          )}
        </aside>
      )}
    </div>
  );
}

/** Inverse of X (used to clip tick years) */
function yearAtRef(x: number): number {
  let lo = -700;
  let hi = 2030;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (X(mid) < x) lo = mid;
    else hi = mid;
  }
  return Math.round(hi);
}

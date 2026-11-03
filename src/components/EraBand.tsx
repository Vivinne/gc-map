'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { blocks, scaleEnd, tickX, xOfYear, yearAt } from '../lib/band';
import { ERAS, formatYear, type Building } from '../lib/model';
import type { EraId } from '../lib/types';

interface Props {
  /** Buildings for the block sizes and counts (filters applied, except style and period) */
  base: Building[];
  /** Buildings drawn as ticks (all filters applied) */
  shown: Building[];
  styles: EraId[];
  range: [number, number] | null;
  /** Ticks drawn taller (current city or selection) */
  highlight: ReadonlySet<string>;
  compact?: boolean;
  /** Collapsed strip: 22 px blocks with names and counts, no ticks or axis */
  slim?: boolean;
  onToggleStyle(id: EraId): void;
  onRange(r: [number, number] | null): void;
}

const H = 44;

export default function EraBand({ base, shown, styles, range, highlight, compact, slim, onToggleStyle, onRange }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [drag, setDrag] = useState<{ mode: 'new' | 'a' | 'b'; x0: number; a: number; b: number; moved: boolean } | null>(null);

  useEffect(() => {
    if (!box.current) return;
    const ro = new ResizeObserver(([e]) => e && setWidth(Math.max(200, e.contentRect.width)));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);

  const bl = useMemo(() => blocks(width, base), [width, base]);
  const end = scaleEnd(bl);
  const shownSet = useMemo(() => new Set(shown.map((b) => b.id)), [shown]);

  // Brush in pixels: while dragging use the live drag, else the committed range
  const brush: [number, number] | null = drag && drag.moved ? [Math.min(drag.a, drag.b), Math.max(drag.a, drag.b)] : range ? [xOfYear(bl, range[0]), xOfYear(bl, range[1]) + 0.01] : null;

  const localX = (e: React.PointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    return Math.min(width, Math.max(0, e.clientX - r.left));
  };

  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const x = localX(e);
    (e.target as Element).setPointerCapture?.(e.pointerId);
    if (brush && Math.abs(x - brush[0]) < 9) setDrag({ mode: 'a', x0: x, a: brush[0], b: brush[1], moved: true });
    else if (brush && Math.abs(x - brush[1]) < 9) setDrag({ mode: 'b', x0: x, a: brush[0], b: brush[1], moved: true });
    else setDrag({ mode: 'new', x0: x, a: x, b: x, moved: false });
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const x = Math.min(end, localX(e));
    if (drag.mode === 'new') setDrag({ ...drag, b: x, moved: drag.moved || Math.abs(x - drag.x0) > 4 });
    else if (drag.mode === 'a') setDrag({ ...drag, a: x });
    else setDrag({ ...drag, b: x });
  };
  const onUp = (e: React.PointerEvent) => {
    if (!drag) return;
    const x = localX(e);
    if (!drag.moved) {
      const k = bl.find((b) => x >= b.x && x <= b.x + b.w);
      if (k) onToggleStyle(k.id);
    } else {
      const lo = Math.min(drag.a, drag.b);
      const hi = Math.max(drag.a, drag.b);
      if (hi - lo < 3) onRange(null);
      else onRange([yearAt(bl, lo), yearAt(bl, hi)]);
    }
    setDrag(null);
  };

  const label = (id: EraId) => (id === 'c19' ? '19th c.' : ERAS[id].label);

  if (slim) {
    return (
      <div className="band-svg-box slim" ref={box}>
        <svg width={width} height={22} className="band-svg" role="group" aria-label="Periods (point at the band to open it)">
          {bl.map((b) => {
            const off = styles.length > 0 && !styles.includes(b.id);
            return (
              <g key={b.id} opacity={off ? 0.3 : 1}>
                <rect x={b.x} y={0} width={b.w} height={22} fill={ERAS[b.id].color} />
                <text x={b.x + 6} y={15} className="band-n slim">
                  {b.w > 96 ? `${label(b.id)} ${b.count}` : b.count}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    );
  }

  return (
    <div className={`band-svg-box${compact ? ' compact' : ''}`} ref={box}>
      <svg
        width={width}
        height={H + (compact ? 16 : 20)}
        className="band-svg"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => setDrag(null)}
        onDoubleClick={() => onRange(null)}
        role="group"
        aria-label="Periods. Click a block to show one style, drag across to pick a time span, double-click to reset."
      >
        {bl.map((b) => {
          const off = styles.length > 0 && !styles.includes(b.id);
          return (
            <g key={b.id} className="blk" opacity={off ? 0.3 : 1}>
              <rect x={b.x} y={0} width={b.w} height={H} fill={ERAS[b.id].color} />
              {!compact && b.w > 74 && (
                <text x={b.x + 8} y={16} className="band-lbl">
                  {label(b.id)}
                </text>
              )}
              <text x={b.w > 34 ? b.x + 8 : b.x + b.w / 2} y={compact ? 28 : 33} textAnchor={b.w > 34 ? 'start' : 'middle'} className="band-n">
                {b.count}
              </text>
              {b.id !== 'others' && b.w > 46 && (
                <text x={b.x} y={H + (compact ? 13 : 16)} className="band-axis">
                  {formatYear(b.min)}
                </text>
              )}
            </g>
          );
        })}
        {shown.map((b) => {
          const x = tickX(bl, b);
          if (x == null || !shownSet.has(b.id)) return null;
          const hl = highlight.has(b.id);
          return <rect key={b.id} x={x - (hl ? 1 : 0.5)} y={hl ? H - 10 : H - 6} width={hl ? 2 : 1} height={hl ? 10 : 6} fill="#fff" opacity={hl ? 1 : 0.7} pointerEvents="none" />;
        })}
        {brush && (
          <g pointerEvents="none">
            <rect x={0} y={0} width={brush[0]} height={H} fill="#fff" opacity={0.72} />
            <rect x={brush[1]} y={0} width={Math.max(0, width - brush[1])} height={H} fill="#fff" opacity={0.72} />
            <rect x={brush[0]} y={1.5} width={Math.max(0, brush[1] - brush[0])} height={H - 3} fill="none" stroke="#000" strokeWidth={3} />
            {[brush[0], brush[1]].map((x, i) => (
              <g key={i}>
                <rect x={x - 5} y={9} width={10} height={26} fill="#000" />
                <rect x={x - 1} y={15} width={2} height={14} fill="#fff" />
              </g>
            ))}
          </g>
        )}
      </svg>
    </div>
  );
}

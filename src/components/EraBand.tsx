'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { blocks } from '../lib/band';
import { ERAS } from '../lib/model';
import type { Building } from '../lib/model';
import type { EraId } from '../lib/types';

interface Props {
  /** Buildings counted per period (every filter applied except style) */
  base: Building[];
  styles: EraId[];
  onToggleStyle(id: EraId): void;
}

/**
 * Period band: one solid block per style, width by the number of buildings, the number inside.
 * Click a block to show only that period (again to undo); the name appears on pointer.
 */
export default function EraBand({ base, styles, onToggleStyle }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  useEffect(() => {
    if (!box.current) return;
    const ro = new ResizeObserver(([e]) => e && setWidth(Math.max(160, e.contentRect.width)));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);
  const bl = useMemo(() => blocks(width, base), [width, base]);
  return (
    <div className="eb" ref={box} role="group" aria-label="Periods">
      {bl.map((b) => {
        const on = styles.includes(b.id);
        const off = styles.length > 0 && !on;
        return (
          <button
            type="button"
            key={b.id}
            className={`eb-blk${on ? ' on' : ''}${off ? ' off' : ''}`}
            style={{ left: b.x, width: b.w, background: ERAS[b.id].color }}
            aria-pressed={on}
            aria-label={`${ERAS[b.id].label} ${b.count}`}
            title={ERAS[b.id].label}
            onClick={() => onToggleStyle(b.id)}
          >
            {b.count}
          </button>
        );
      })}
    </div>
  );
}

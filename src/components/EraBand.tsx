'use client';

import { useMemo } from 'react';
import { ERAS, ERA_ORDER } from '../lib/model';
import type { Building } from '../lib/model';
import type { EraId } from '../lib/types';

interface Props {
  /** Buildings counted per period (every filter applied except style) */
  base: Building[];
  styles: EraId[];
  onToggleStyle(id: EraId): void;
}

/**
 * Period row: one tag per period with its colour, name and number of buildings. A tag shows only that
 * period (again to undo); the chosen ones turn black. Scrolls sideways on narrow screens.
 */
export default function EraBand({ base, styles, onToggleStyle }: Props) {
  const counts = useMemo(() => {
    const m = new Map<EraId, number>();
    for (const b of base) for (const e of b.eras) m.set(e, (m.get(e) ?? 0) + 1);
    return m;
  }, [base]);
  return (
    <div className="eb" role="group" aria-label="Periods">
      {ERA_ORDER.map((id) => {
        const n = counts.get(id) ?? 0;
        const on = styles.includes(id);
        return (
          <button type="button" key={id} className={`eb-tag${on ? ' on' : ''}`} aria-pressed={on} disabled={n === 0 && !on} onClick={() => onToggleStyle(id)}>
            <i style={{ background: ERAS[id].color }} />
            <span className="nm">{ERAS[id].label}</span>
            <span className="n">{n}</span>
          </button>
        );
      })}
    </div>
  );
}

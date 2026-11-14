'use client';

import { ERAS, type Building } from '../lib/model';
import { architectOf, builtOf, joinDot, shownStyle } from '../lib/style';

/**
 * One building in a list (preview, results, number point): a strip in its category colour, the name in bold,
 * built span · city, architect · style. Rows are split by thin grey rules (see .rows in globals.css).
 */
export default function ResultRow({ b, onOpen, onHover }: { b: Building; onOpen(id: string): void; onHover(id: string): void }) {
  return (
    <li data-id={b.id}>
      <button
        type="button"
        className="row"
        onClick={() => onOpen(b.id)}
        onPointerEnter={(e) => e.pointerType === 'mouse' && onHover(b.id)}
        onPointerLeave={(e) => e.pointerType === 'mouse' && onHover('')}
        // A finger on a row turns it light blue, and the phone keeps that colour on the last row touched (also while
        // the list scrolls) until something else is touched: the map rings that building for as long (cleared in App)
        onPointerDown={(e) => e.pointerType !== 'mouse' && onHover(b.id)}
        onFocus={(e) => e.currentTarget.matches(':focus-visible') && onHover(b.id)}
        onBlur={() => onHover('')}
      >
        <i className="strip" style={{ background: ERAS[b.era].color }} />
        <span className="row-t">
          <b>{b.name}</b>
          <span>{joinDot(builtOf(b), b.city)}</span>
          <span>{joinDot(architectOf(b), shownStyle(b))}</span>
        </span>
      </button>
    </li>
  );
}

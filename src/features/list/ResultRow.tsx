'use client';

import { ERAS, type Building } from '../../data';
import { isMouseHover } from '../../shared/device';
import { architectParts, builtOf, joinDot, shownStyle } from '../../data';
import { RemoveButton } from '../../shared/ui';

/**
 * One building in a list (preview, results, number point): a strip in its category colour, the name in bold,
 * built span · city, architect (underlined) · style. Rows are split by thin grey rules (see .rows in src/features/list/list.css).
 */
export default function ResultRow({ b, onOpen, onHover, onRemove }: { b: Building; onOpen(id: string): void; onHover(id: string): void; onRemove?(id: string): void }) {
  // each architect's name in bold; the joining "," and "and" stay plain (user, 2026-11-25). No architect: the style only
  const who = architectParts(b);
  return (
    <li data-id={b.id} className={onRemove ? 'has-x' : undefined}>
      <button
        type="button"
        className="row"
        // the second click of a double click (e.g. on a Category tag the list replaced) does not open a row
        onClick={(e) => e.detail < 2 && onOpen(b.id)}
        onPointerEnter={(e) => isMouseHover(e) && onHover(b.id)}
        onPointerLeave={(e) => isMouseHover(e) && onHover('')}
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
          <span>
            {who.length > 0 && (
              <>
                {who.map((p, i) => (p.search ? <u key={i} className="row-who">{p.text}</u> : p.text))}
                {' · '}
              </>
            )}
            {shownStyle(b)}
          </span>
        </span>
      </button>
      {onRemove && <RemoveButton label={b.name} onRemove={() => onRemove(b.id)} />}
    </li>
  );
}

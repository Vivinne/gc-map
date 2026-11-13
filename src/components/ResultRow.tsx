'use client';

import { ERAS, type Building } from '../lib/model';
import { architectOf, builtOf, shownStyle } from '../lib/style';

/** Two values joined by a middle dot, leaving out an empty one */
export const joinDot = (...parts: string[]): string => parts.filter(Boolean).join(' · ');

/**
 * One building in a list (preview, results, number point): a strip in its category colour, the name in bold,
 * built span · city, architect · style. Rows are split by thin grey rules (see .rows in globals.css).
 */
export default function ResultRow({ b, onOpen, onHover }: { b: Building; onOpen(id: string): void; onHover(id: string): void }) {
  return (
    <li>
      <button
        type="button"
        className="row"
        onClick={() => onOpen(b.id)}
        onPointerEnter={() => onHover(b.id)}
        onPointerLeave={() => onHover('')}
        onFocus={() => onHover(b.id)}
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

export function Rows({ list, onOpen, onHover }: { list: Building[]; onOpen(id: string): void; onHover(id: string): void }) {
  return (
    <ul className="rows">
      {list.map((b) => (
        <ResultRow key={b.id} b={b} onOpen={onOpen} onHover={onHover} />
      ))}
    </ul>
  );
}

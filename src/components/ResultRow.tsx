'use client';

import { useEffect, useRef } from 'react';
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
    <li data-id={b.id}>
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

/**
 * A list of buildings. `onVisible` reports the rows that are on screen in the list, top to bottom,
 * whenever the list scrolls, so the map can mark those buildings.
 */
export function Rows({ list, onOpen, onHover, onVisible }: { list: Building[]; onOpen(id: string): void; onHover(id: string): void; onVisible?(ids: string[]): void }) {
  const ul = useRef<HTMLUListElement>(null);
  const report = useRef(onVisible);
  report.current = onVisible;
  const on = !!onVisible;
  useEffect(() => {
    const el = ul.current;
    if (!on || !el) return undefined;
    const root = el.closest('.p-body');
    const seen = new Set<string>();
    const send = () => report.current?.([...el.querySelectorAll<HTMLElement>('li[data-id]')].map((li) => li.dataset.id!).filter((id) => seen.has(id)));
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const id = (e.target as HTMLElement).dataset.id!;
          if (e.isIntersecting) seen.add(id);
          else seen.delete(id);
        }
        send();
      },
      { root, threshold: 0.6 },
    );
    el.querySelectorAll('li[data-id]').forEach((li) => io.observe(li));
    return () => {
      io.disconnect();
      report.current?.([]);
    };
  }, [on, list]);
  return (
    <ul className="rows" ref={ul}>
      {list.map((b) => (
        <ResultRow key={b.id} b={b} onOpen={onOpen} onHover={onHover} />
      ))}
    </ul>
  );
}

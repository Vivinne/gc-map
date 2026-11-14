'use client';

import { useEffect, useRef } from 'react';
import { BY_COUNTRY_MIN, byCountry } from '../lib/country';
import type { Building } from '../lib/model';
import ResultRow from './ResultRow';

interface RowsProps {
  list: Building[];
  onOpen(id: string): void;
  /** Building(s) pointed at: an id, several joined by "~", or '' */
  onHover(ids: string): void;
  onVisible?(ids: string[]): void;
  /** Split the list by country under headings; clicking a heading frames that country's buildings */
  onCountry?(items: Building[]): void;
  /** The search's other matches (Polish 13): an "Other Possible Outcomes" button at the end of the list shows them below */
  more?: { list: Building[]; open: boolean; onOpen(): void };
}

/**
 * A list of buildings, split by country when `onCountry` is given and the list is long. `onVisible` reports
 * the rows that are on screen in the list, top to bottom, whenever the list scrolls, so the map can mark them.
 */
export default function ResultList({ list, onOpen, onHover, onVisible, onCountry, more }: RowsProps) {
  const ul = useRef<HTMLUListElement>(null);
  const report = useRef(onVisible);
  report.current = onVisible;
  const on = !!onVisible;
  const split = !!onCountry && list.length >= BY_COUNTRY_MIN;
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
  }, [on, list, split, more?.open]);
  // the other matches: first a button, then (once pressed) a grey line and their rows, in search order
  const tail =
    more && more.list.length > 0
      ? more.open
        ? [
            <li key="more-line" className="country">
              <span className="c-head more-line">
                Other Possible Outcomes <span className="n">{more.list.length}</span>
              </span>
            </li>,
            ...more.list.map((b) => <ResultRow key={b.id} b={b} onOpen={onOpen} onHover={onHover} />),
          ]
        : [
            <li key="more-btn" className="more">
              <button type="button" className="more-btn" onClick={more.onOpen}>
                Other Possible Outcomes
              </button>
            </li>,
          ]
      : [];
  if (!split) {
    return (
      <ul className="rows" ref={ul}>
        {list.map((b) => (
          <ResultRow key={b.id} b={b} onOpen={onOpen} onHover={onHover} />
        ))}
        {tail}
      </ul>
    );
  }
  return (
    <ul className="rows by-country" ref={ul}>
      {byCountry(list).map(({ country, items }) => {
        const ids = items.map((b) => b.id).join('~');
        return [
          <li key={`c-${country}`} className="country">
            <button
              type="button"
              className="c-head"
              onClick={() => onCountry!(items)}
              onPointerEnter={(e) => e.pointerType === 'mouse' && onHover(ids)}
              onPointerLeave={() => onHover('')}
            >
              <span>{country}</span>
              <span className="n">{items.length}</span>
            </button>
          </li>,
          ...items.map((b) => <ResultRow key={b.id} b={b} onOpen={onOpen} onHover={onHover} />),
        ];
      })}
      {tail}
    </ul>
  );
}

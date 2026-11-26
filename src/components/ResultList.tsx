'use client';

import { isMouseHover } from '../shared/device';
import { useEffect, useRef, type ReactNode } from 'react';
import { BY_COUNTRY_MIN, byCountry } from '../data';
import type { Building } from '../data';
import { Icon } from '../shared/ui';
import ResultRow from './ResultRow';

interface RowsProps {
  list: Building[];
  onOpen(id: string): void;
  /** Recent buildings: each row ends in a small × that takes it off the recent list */
  onRemove?(id: string): void;
  /** Building(s) pointed at: an id, several joined by "~", or '' */
  onHover(ids: string): void;
  onVisible?(ids: string[]): void;
  /** Split the list by country under headings; clicking a heading frames that country's buildings */
  onCountry?(items: Building[]): void;
  /** The search's other matches (Polish 13): an "Other Possible Outcomes" button at the end of the list shows them below */
  more?: { list: Building[]; open: boolean; onOpen(): void; onClose(): void };
  /** Whether the map already shows these buildings framed: their line is then not clickable */
  framed?(items: Building[]): boolean;
}

/** No match: other words can be tried, or the search cleared */
export function NoResults() {
  return (
    <div className="none">
      <p>No Results</p>
      <p className="none-hint">Try other words, or clear the search with ×.</p>
    </div>
  );
}

/**
 * A list of buildings, split by country when `onCountry` is given and the list is long. `onVisible` reports
 * the rows that are on screen in the list, top to bottom, whenever the list scrolls, so the map can mark them.
 */
export default function ResultList({ list, onOpen, onHover, onVisible, onCountry, more, framed, onRemove }: RowsProps) {
  // A line that frames a group on the map (a country, the other possible outcomes): clickable only while the map
  // does not already show that group framed (moved away, zoomed out, or never framed)
  const groupLine = (key: string, label: string, items: Building[], extra = '', tail?: ReactNode) => {
    const off = !onCountry || (framed?.(items) ?? false);
    const ids = items.map((b) => b.id).join('~');
    return (
      <li key={key} className="country">
        <button
          type="button"
          className={`c-head${off ? ' off' : ''}${extra}`}
          aria-disabled={off}
          onClick={() => !off && onCountry?.(items)}
          onPointerEnter={(e) => isMouseHover(e) && onHover(ids)}
          onPointerLeave={() => onHover('')}
        >
          <span>{label}</span>
          <span className="n">{items.length}</span>
        </button>
        {tail}
      </li>
    );
  };
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
            groupLine(
              'more-line',
              'Other Possible Outcomes',
              more.list,
              ' more-line',
              <button type="button" className="fold-btn" aria-label="Fold away" title="Fold away" onClick={more.onClose}>
                <Icon name="up" size={13} />
              </button>,
            ),
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
        {/* a search with only other possible outcomes: No Results, then the button */}
        {list.length === 0 && (
          <li key="none" className="none-row">
            <NoResults />
          </li>
        )}
        {list.map((b) => (
          <ResultRow key={b.id} b={b} onOpen={onOpen} onHover={onHover} onRemove={onRemove} />
        ))}
        {tail}
      </ul>
    );
  }
  return (
    <ul className="rows by-country" ref={ul}>
      {byCountry(list).map(({ country, items }) => {
        return [
          groupLine(`c-${country}`, country, items),
          ...items.map((b) => <ResultRow key={b.id} b={b} onOpen={onOpen} onHover={onHover} />),
        ];
      })}
      {tail}
    </ul>
  );
}

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ERAS, whoOf } from '../lib/model';
import { search, type Hit } from '../lib/search';
import { examLine } from './DetailPanel';
import { Icon } from './Icons';

interface Props {
  initial: string;
  mobile: boolean;
  onClose(): void;
  onOpen(id: string): void;
  onArchitect(who: string): void;
  onCity(city: string): void;
  /** Keep the text as a list filter */
  onKeep(q: string): void;
}

export default function SearchPalette({ initial, mobile, onClose, onOpen, onArchitect, onCity, onKeep }: Props) {
  const [q, setQ] = useState(initial);
  const [cur, setCur] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const res = useMemo(() => search(q), [q]);

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  useEffect(() => setCur(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector('[data-cur="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [cur]);

  const choose = (h: Hit | undefined) => {
    if (!h) return;
    if (h.kind === 'building') onOpen(h.b.id);
    else if (h.kind === 'architect') onArchitect(h.who);
    else onCity(h.city);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCur((c) => Math.min(res.flat.length - 1, c + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCur((c) => Math.max(0, c - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(res.flat[cur]);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      if (q.trim() && res.matched.length) onKeep(q.trim());
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  const focus = res.flat[cur];
  const preview = focus?.kind === 'building' ? focus.b : focus ? focus.items[0] : null;
  let i = -1;
  const item = (h: Hit) => {
    i += 1;
    const idx = i;
    const on = idx === cur;
    const common = { 'data-cur': on, className: `hit${on ? ' on' : ''}`, onMouseMove: () => setCur(idx), onClick: () => choose(h), role: 'option', 'aria-selected': on } as const;
    if (h.kind === 'architect') {
      const ys = h.items.map((b) => b.y0).filter((y): y is number => y != null);
      return (
        <button type="button" key={`a-${h.who}`} {...common}>
          <span className="av">{initials(h.who)}</span>
          <span className="nm">{h.who}</span>
          <span className="loc">
            {h.items.length} building{h.items.length > 1 ? 's' : ''}
            {ys.length ? `, ${Math.min(...ys)} to ${Math.max(...ys)}` : ''}
          </span>
          {!mobile && <span className="act">Show all</span>}
        </button>
      );
    }
    if (h.kind === 'city') {
      return (
        <button type="button" key={`c-${h.city}`} {...common}>
          <span className="av city">
            <Icon name="map" size={14} />
          </span>
          <span className="nm">{h.city}</span>
          <span className="loc">{h.items.length} buildings</span>
          {!mobile && <span className="act">Go to city</span>}
        </button>
      );
    }
    const b = h.b;
    return (
      <button type="button" key={b.id} {...common}>
        <i className="sq" style={{ background: ERAS[b.era].color }} />
        <span className="nm">{b.name}</span>
        <span className="loc">{b.city}</span>
        <span className="yr">{b.yearShort}</span>
        <span className={`ex${b.exams.length ? '' : ' ghost'}`}>{b.exams.length ? 'E' : ''}</span>
      </button>
    );
  };

  return (
    <div className="scrim" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="pal" role="dialog" aria-label="Search" onKeyDown={onKey}>
        <div className="pal-in">
          <Icon name="search" size={18} />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search buildings, architects, cities, notes"
            aria-label="Search"
            role="combobox"
            aria-expanded={res.flat.length > 0}
            aria-controls="pal-results"
            autoComplete="off"
            spellCheck={false}
          />
          {q && <span className="cnt">{res.matched.length + res.architects.length + res.cities.length} results</span>}
          <button type="button" className="kbd-btn" onClick={onClose} aria-label="Close search">
            {mobile ? <Icon name="close" size={14} /> : <kbd>Esc</kbd>}
          </button>
        </div>
        <div className="pal-body">
          <div className="pal-res" id="pal-results" role="listbox" ref={listRef}>
            {!q.trim() && <p className="pal-empty">Type a building, an architect, a city or any word from the notes.</p>}
            {q.trim() && res.flat.length === 0 && <p className="pal-empty">Nothing matches &ldquo;{q}&rdquo;. Try fewer letters or another spelling.</p>}
            {res.architects.length > 0 && <h5>Architect</h5>}
            {res.architects.map(item)}
            {res.cities.length > 0 && <h5>City</h5>}
            {res.cities.map(item)}
            {res.buildings.length > 0 && <h5>Buildings</h5>}
            {res.buildings.map(item)}
            {res.matched.length > res.buildings.length && <p className="pal-more">{res.matched.length - res.buildings.length} more. Press Tab to list them all.</p>}
          </div>
          {!mobile && (
            <div className="pal-prev">
              {preview && (
                <>
                  <div className="pv-head" style={{ background: ERAS[preview.era].color }}>
                    <h2>{preview.name.toUpperCase()}</h2>
                    <p>{[preview.year, preview.locLabel].filter(Boolean).join(', ').toLowerCase()}</p>
                  </div>
                  <p className="who">{whoOf(preview)}</p>
                  <p className="sum">{preview.summary}</p>
                  {preview.exams.length > 0 && <p className="exam">{examLine(preview)}</p>}
                </>
              )}
            </div>
          )}
        </div>
        {!mobile && (
          <div className="pal-foot">
            <span>
              <kbd>{'\u2191'}</kbd>
              <kbd>{'\u2193'}</kbd> Move
            </span>
            <span>
              <kbd>Enter</kbd> Open
            </span>
            <span>
              <kbd>Tab</kbd> Keep as list filter
            </span>
            <span className="r">Matches names, places, architects and note text</span>
          </div>
        )}
        {mobile && q.trim() && res.matched.length > 0 && (
          <button type="button" className="btn dark pal-keep" onClick={() => onKeep(q.trim())}>
            Show {res.matched.length} on the map
          </button>
        )}
      </div>
    </div>
  );
}

function initials(name: string): string {
  const parts = name.replace(/\(.*?\)/g, '').split(/[\s,&]+/).filter((w) => /^[A-Z]/.test(w));
  const a = parts[0] ?? name;
  const z = parts[parts.length - 1] ?? '';
  return (parts.length > 1 ? (a[0] ?? '') + (z[0] ?? '') : a.slice(0, 2)).toUpperCase();
}

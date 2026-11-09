'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ERAS, ascii, shortYear, type Building } from '../lib/model';
import { type EraId } from '../lib/types';
import { search, type Hit } from '../lib/search';
import Facts from './Facts';
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
  /** Buildings opened, newest first: shown while nothing is typed */
  recent: Building[];
  /** A style picked from the examples: show its buildings */
  onStyle(e: EraId): void;
}

/** What the search finds, said where it is typed */
export const SEARCH_HINT = 'Search';

/** Fixed examples while nothing is typed: one architect, one city, one style; each opens its result */
const EXAMPLES: { kind: 'architect' | 'city' | 'style'; label: string; value: string }[] = [
  { kind: 'architect', label: 'Le Corbusier', value: 'Le Corbusier' },
  { kind: 'city', label: 'Rome', value: 'Rome' },
  { kind: 'style', label: 'Baroque', value: 'baroque' },
];


// Last kind of input on the page, to tell keyboard use from pointer use
let lastInput: 'key' | 'pointer' = 'pointer';
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', () => (lastInput = 'key'), true);
  window.addEventListener('pointerdown', () => (lastInput = 'pointer'), true);
}

export default function SearchPalette({ initial, mobile, onClose, onOpen, onArchitect, onCity, onKeep, recent, onStyle }: Props) {
  const [q, setQ] = useState(initial);
  const [cur, setCur] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // Keyboard users: when the palette closes, focus goes back to the search button instead of being lost on the page
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    // only when the palette was opened from the keyboard ("/" or Enter on the button): after a click or a tap
    // no focus ring is left on the search bar
    const byKey = lastInput === 'key';
    return () => {
      window.requestAnimationFrame(() => {
        if (!byKey) return;
        if (document.activeElement && document.activeElement !== document.body) return;
        const back = opener?.isConnected ? opener : document.querySelector<HTMLElement>('.search, .m-search');
        back?.focus({ preventScroll: true });
      });
    };
  }, []);
  const res = useMemo(() => search(q), [q]);
  // Nothing typed: the buildings opened lately (a phone shows 3, more on request) and the examples
  const idle = !q.trim();
  const [moreRecent, setMoreRecent] = useState(false);
  const recentShown = recent.slice(0, mobile && !moreRecent ? 3 : 5);
  const idleRun: (() => void)[] = [
    ...recentShown.map((b) => () => onOpen(b.id)),
    ...EXAMPLES.map((x) => () => (x.kind === 'architect' ? onArchitect(x.value) : x.kind === 'city' ? onCity(x.value) : onStyle(x.value as EraId))),
  ];
  const count = idle ? idleRun.length : res.flat.length;

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  useEffect(() => {
    setCur(0);
  }, [q]);
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
      setCur((c) => Math.min(count - 1, c + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCur((c) => Math.max(0, c - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (idle) idleRun[cur]?.();
      else choose(res.flat[cur]);
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
          <span className="loc">{ys.length ? `${Math.min(...ys)}\u2013${Math.max(...ys)}` : ''}</span>
          <span className="cnt-n">{h.items.length}</span>
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
          <span className="loc" />
          <span className="cnt-n">{h.items.length}</span>
        </button>
      );
    }
    const b = h.b;
    return (
      <button type="button" key={b.id} {...common}>
        <i className="sq" style={{ background: ERAS[b.era].color }} />
        <span className="nm">{b.name}</span>
        {h.why && <span className="why">{h.why}</span>}
        <span className="loc">{b.city}</span>
        <span className="yr">{ascii(shortYear(b.built))}</span>
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
            placeholder={SEARCH_HINT}
            aria-label="Search"
            role="combobox"
            aria-expanded={count > 0}
            aria-controls="pal-results"
            autoComplete="off"
            spellCheck={false}
          />
          <button type="button" className="kbd-btn" onClick={onClose} aria-label="Close search">
            <Icon name="close" size={14} />
          </button>
        </div>
        <div className="pal-body">
          <div className="pal-res" id="pal-results" role="listbox" ref={listRef}>
            {idle && (
              <>
                {recentShown.length > 0 && <h5>Recently opened</h5>}
                {recentShown.map((b, k) => (
                  <button type="button" key={`r-${b.id}`} data-cur={cur === k} className={`hit${cur === k ? ' on' : ''}`} onMouseMove={() => setCur(k)} onClick={() => onOpen(b.id)} role="option" aria-selected={cur === k}>
                    <i className="sq" style={{ background: ERAS[b.era].color }} />
                    <span className="nm">{b.name}</span>
                    <span className="loc">{b.city}</span>
                  </button>
                ))}
                {mobile && !moreRecent && recent.length > 3 && (
                  <button type="button" className="pal-more-b" onClick={() => setMoreRecent(true)}>
                    Show {Math.min(5, recent.length) - 3} more
                  </button>
                )}
                <h5>Try</h5>
                {EXAMPLES.map((x, j) => {
                  const k = recentShown.length + j;
                  return (
                    <button type="button" key={`x-${x.value}`} data-cur={cur === k} className={`hit${cur === k ? ' on' : ''}`} onMouseMove={() => setCur(k)} onClick={() => idleRun[k]?.()} role="option" aria-selected={cur === k}>
                      {x.kind === 'architect' ? (
                        <span className="av">{initials(x.label)}</span>
                      ) : x.kind === 'city' ? (
                        <span className="av city">
                          <Icon name="map" size={14} />
                        </span>
                      ) : (
                        <i className="sq" style={{ background: ERAS[x.value as EraId].color }} />
                      )}
                      <span className="nm">{x.label}</span>
                      <span className="loc">{x.kind === 'architect' ? 'Architect' : x.kind === 'city' ? 'City' : 'Style'}</span>
                    </button>
                  );
                })}
              </>
            )}
            {q.trim() && res.flat.length === 0 && (
              <div className="pal-empty">
                <b>No results for "{q.trim()}"</b>
                <span>Try the name of a city or an architect.</span>
              </div>
            )}
            {res.buildings.length > 0 && <h5>Buildings</h5>}
            {res.buildings.map(item)}
            {res.architects.length > 0 && <h5>Architects</h5>}
            {res.architects.map(item)}
            {res.cities.length > 0 && <h5>Cities</h5>}
            {res.cities.map(item)}
            {res.others.length > 0 && <h5>Also mentioning "{q.trim()}"</h5>}
            {res.others.map(item)}
            {res.matched.length > res.buildings.length + res.others.length && <p className="pal-more">{res.matched.length - res.buildings.length - res.others.length} more</p>}
          </div>
          {!mobile && (
            <div className="pal-prev">
              {preview && (
                <>
                  <div className="pv-head" style={{ background: ERAS[preview.era].color }}>
                    <h2>{preview.name.toUpperCase()}</h2>
                  </div>
                  <Facts b={preview} />
                </>
              )}
            </div>
          )}
        </div>
        {mobile && q.trim() && res.matched.length > 0 && (
          <button type="button" className="btn dark pal-keep" onClick={() => onKeep(q.trim())}>
            <Icon name="map" size={16} />
            {res.matched.length}
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

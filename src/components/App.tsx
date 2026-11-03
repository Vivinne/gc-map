'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { EMPTY, apply, describe, isEmpty, tagCounts, type Filters } from '../lib/filter';
import { DEFAULT_STATE, formatHash, parseHash, type Mode } from '../lib/hash';
import { BUILDINGS, BY_ID, ERAS, ERA_ORDER, byYear, type Building } from '../lib/model';
import type { Deck } from '../lib/review';
import { nearest } from '../lib/geo';
import { load, save } from '../lib/storage';
import type { EraId } from '../lib/types';
import DetailPanel from './DetailPanel';
import EraBand from './EraBand';
import { Icon } from './Icons';
import IndexPanel, { type CitySort } from './IndexPanel';
import MapView, { type MapHandle, type Padding } from './MapView';
import ReviewView from './ReviewView';
import SearchPalette from './SearchPalette';
import TimelineList from './TimelineList';
import TimelineView from './TimelineView';

const MOBILE_QUERY = '(max-width: 900px)';
// The view state lives in the address (#m=...&b=...) so a view can be bookmarked or shared.
// Hosts that only pass a plain #name (claude.ai artifacts) build with GC_HASH=off.
const HASH_STATE = process.env.GC_HASH !== 'off';
const TOTAL = BUILDINGS.length;

interface Toast {
  id: number;
  text: string;
  undo?: Filters;
}

function useMedia(q: string): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const m = window.matchMedia(q);
    const f = () => setOn(m.matches);
    f();
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, [q]);
  return on;
}

export default function App() {
  const initial = useMemo(() => (typeof window === 'undefined' || !HASH_STATE ? DEFAULT_STATE : parseHash(window.location.hash)), []);
  const [mode, setMode] = useState<Mode>(initial.mode);
  const [selId, setSelId] = useState(BY_ID.has(initial.b) ? initial.b : '');
  const [city, setCity] = useState(initial.city);
  const [filters, setFiltersRaw] = useState<Filters>(initial.filters);
  const [citySort, setCitySort] = useState<CitySort>('year');
  const [seen, setSeen] = useState<Set<string>>(() => new Set(load<string[]>('seen', [])));
  const [starred, setStarred] = useState<Set<string>>(() => new Set(load<string[]>('starred', [])));
  const [last, setLast] = useState<string>(() => load<string>('last', ''));
  const [palette, setPalette] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [hoverCity, setHoverCity] = useState('');
  const [sheet, setSheet] = useState(false);
  const [resumeHidden, setResumeHidden] = useState(false);
  const mobile = useMedia(MOBILE_QUERY);
  const reducedMotion = useMedia('(prefers-reduced-motion: reduce)');
  const mapRef = useRef<MapHandle>(null);
  const [mapReady, setMapReady] = useState(false);

  // Derived lists (deferred so chips respond at once and the map follows)
  const dFilters = useDeferredValue(filters);
  const results = useMemo(() => apply(dFilters, starred).sort(byYear), [dFilters, starred]);
  const counts = useMemo(() => tagCounts(filters, starred), [filters, starred]);
  const bandBase = useMemo(() => apply({ ...dFilters, styles: [], range: null }, starred), [dFilters, starred]);
  const selected = selId ? (BY_ID.get(selId) ?? null) : null;

  const cityItems = useMemo(() => {
    if (!city) return [];
    const items = results.filter((b) => b.city === city);
    if (citySort === 'az') return [...items].sort((a, b) => a.name.localeCompare(b.name));
    if (citySort === 'asked') return [...items].sort((a, b) => Number(b.exams.length > 0) - Number(a.exams.length > 0) || byYear(a, b));
    return items;
  }, [city, results, citySort]);

  // Order used by Previous / Next and the "n of N" line
  const nav = useMemo(() => {
    if (!selected) return null;
    let list: Building[];
    let label: string;
    if (city && cityItems.some((b) => b.id === selected.id)) {
      list = cityItems;
      label = `in ${city}`;
    } else if (!isEmpty(filters) && results.some((b) => b.id === selected.id)) {
      list = results;
      label = 'in this list';
    } else {
      list = BUILDINGS.filter((b) => b.city === selected.city).sort(byYear);
      label = `in ${selected.city}`;
      // A city with one building: step through the nearest buildings instead
      if (list.length < 2) {
        list = [selected, ...nearest(selected, BUILDINGS, 9).map((n) => n.b)];
        label = 'nearby';
      }
    }
    return { list, index: list.findIndex((b) => b.id === selected.id), label };
  }, [selected, city, cityItems, filters, results]);

  // ---------- persistence ----------
  useEffect(() => save('seen', [...seen]), [seen]);
  useEffect(() => save('starred', [...starred]), [starred]);
  useEffect(() => {
    if (!HASH_STATE) return;
    const h = formatHash({ mode, b: selId, city, filters });
    const url = `${window.location.pathname}${window.location.search}${h}`;
    if (url !== `${window.location.pathname}${window.location.search}${window.location.hash}`) window.history.replaceState(null, '', url);
  }, [mode, selId, city, filters]);

  const showToast = useCallback((text: string, undo?: Filters) => setToast({ id: Date.now(), text, undo }), []);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const setFilters = useCallback(
    (next: Filters, note?: (count: number) => string) => {
      const prev = filters;
      setFiltersRaw(next);
      if (note) showToast(note(apply(next, starred).length), prev);
    },
    [filters, starred, showToast],
  );

  // ---------- map padding (panels that cover the map) ----------
  const padding: Padding = mobile
    ? { top: 8, right: 0, bottom: selected && mode === 'map' ? Math.round(window.innerHeight * 0.48) : 0, left: 0 }
    : { top: 0, right: selected ? 380 : 0, bottom: 0, left: 0 };

  // ---------- actions ----------
  const select = useCallback(
    (id: string, opts: { fly?: boolean } = {}) => {
      const b = BY_ID.get(id);
      if (!b) return;
      setSelId(id);
      setSeen((s) => (s.has(id) ? s : new Set(s).add(id)));
      setLast(id);
      save('last', id);
      setSheet(false);
      if (opts.fly !== false) window.requestAnimationFrame(() => mapRef.current?.showBuilding(b));
    },
    [],
  );

  const focusCity = useCallback(
    (c: string) => {
      setCity(c);
      setSheet(false);
      const items = results.filter((b) => b.city === c);
      mapRef.current?.fitTo(items.length ? items : BUILDINGS.filter((b) => b.city === c));
    },
    [results],
  );

  const closeDetail = useCallback(() => setSelId(''), []);
  const step = useCallback(
    (d: number) => {
      if (!nav || nav.list.length < 2) return;
      const i = (nav.index + d + nav.list.length) % nav.list.length;
      select(nav.list[i]!.id);
    },
    [nav, select],
  );
  const toggleStar = useCallback((id: string) => {
    setStarred((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);
  const toggleStyle = useCallback((id: EraId) => {
    setFiltersRaw((f) => ({ ...f, styles: f.styles.includes(id) ? f.styles.filter((x) => x !== id) : [...f.styles, id] }));
  }, []);
  const setRange = useCallback(
    (r: [number, number] | null) => {
      setFilters({ ...filters, range: r }, (n) => (r ? `Showing ${n} buildings, ${describe({ ...EMPTY, range: r })}` : `Period reset, ${n} buildings`));
    },
    [filters, setFilters],
  );
  const clearAll = useCallback(() => {
    setFilters(EMPTY, () => `Filters cleared, ${TOTAL} buildings`);
    setCity('');
  }, [setFilters]);

  // Show the selection from the address once the map can move
  useEffect(() => {
    if (mapReady && selected && mode === 'map') {
      mapRef.current?.showBuilding(selected);
      setSeen((s) => (s.has(selected.id) ? s : new Set(s).add(selected.id)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady]);

  // ---------- keyboard ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = !!t?.closest('input, textarea, [contenteditable="true"]');
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        e.preventDefault();
        setPalette('');
        return;
      }
      if (typing || palette !== null || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Escape') {
        if (sheet) setSheet(false);
        else if (selId) closeDetail();
        else if (city) setCity('');
        return;
      }
      if (mode === 'review') {
        if (e.key === 'm') setMode('map');
        if (e.key === 't') setMode('timeline');
        return;
      }
      if (e.key === 'm') setMode('map');
      else if (e.key === 't') setMode('timeline');
      else if (e.key === 'r') setMode('review');
      else if (e.key === 'ArrowRight' && selId) step(1);
      else if (e.key === 'ArrowLeft' && selId) step(-1);
      else if (e.key === 's' && selId) toggleStar(selId);
      else if (e.key === 'f' && mode === 'map') mapRef.current?.fitAll(results);
      else if (/^[1-8]$/.test(e.key)) toggleStyle(ERA_ORDER[Number(e.key) - 1]!);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [palette, sheet, selId, city, mode, step, toggleStar, toggleStyle, results, closeDetail]);

  // ---------- pieces ----------
  const highlight = useMemo(() => {
    const s = new Set<string>();
    if (city) for (const b of cityItems) s.add(b.id);
    if (selected) s.add(selected.id);
    return s;
  }, [city, cityItems, selected]);

  const reviewKnown = load<Deck | null>('deck-all', null)?.known.length ?? 0;
  const lastB = last ? BY_ID.get(last) : undefined;

  const modes: [Mode, string, 'map' | 'time' | 'cards', string][] = [
    ['map', 'Map', 'map', 'M'],
    ['timeline', 'Timeline', 'time', 'T'],
    ['review', 'Review', 'cards', 'R'],
  ];

  const index = (
    <IndexPanel
      filters={filters}
      counts={counts}
      results={results}
      city={city}
      cityItems={cityItems}
      citySort={citySort}
      selectedId={selId}
      seen={seen}
      onFilters={(f) => setFiltersRaw(f)}
      onClear={clearAll}
      onCity={focusCity}
      onLeaveCity={() => {
        setCity('');
        mapRef.current?.fitAll(results);
      }}
      onCitySort={setCitySort}
      onSelect={(id) => {
        if (mode !== 'map') setMode('map');
        select(id);
      }}
      onHoverCity={setHoverCity}
    />
  );

  const band = mode !== 'review' && (
    <footer className="band">
      {!mobile && (
        <div className="band-meta">
          <b>{filters.range ? describe({ ...EMPTY, range: filters.range }) : filters.styles.length ? filters.styles.map((s) => ERAS[s].label).join(', ') : 'All periods'}</b>
          <span>{filters.range ? 'Drag the handles to change the span. Double-click the band to reset.' : 'Click a block to show one style. Drag across the band to pick a span.'}</span>
        </div>
      )}
      <EraBand base={bandBase} shown={results} styles={filters.styles} range={filters.range} highlight={highlight} compact={mobile} onToggleStyle={toggleStyle} onRange={setRange} />
    </footer>
  );

  return (
    <div className={`app mode-${mode}${mobile ? ' is-mobile' : ''}`}>
      {!mobile ? (
        <header className="top">
          <div className="brand">
            <b>GC Atlas</b>
            <span>{TOTAL} buildings</span>
          </div>
          <button type="button" className="search" onClick={() => setPalette('')}>
            <Icon name="search" size={17} />
            <span className="ph">Search buildings, architects, cities</span>
            <kbd>/</kbd>
          </button>
          <nav className="modes" aria-label="Views">
            {modes.map(([m, label, icon, key]) => (
              <button type="button" key={m} className={mode === m ? 'on' : ''} aria-current={mode === m} onClick={() => setMode(m)}>
                <Icon name={icon} size={18} />
                {label}
                <kbd>{key}</kbd>
              </button>
            ))}
          </nav>
          <div className="seen" title="Buildings you have opened">
            <div className="t">
              {seen.size} seen <span>of {TOTAL}</span>
            </div>
            <div className="bar">
              <i style={{ width: `${(seen.size / TOTAL) * 100}%` }} />
            </div>
          </div>
        </header>
      ) : (
        mode !== 'review' && (
          <header className="m-top">
            <button type="button" className="m-search" onClick={() => setPalette('')}>
              <Icon name="search" size={17} />
              <span>{filters.q ? filters.q : 'Search buildings, architects, cities'}</span>
              <span className="m-seen">
                {seen.size}/{TOTAL}
              </span>
            </button>
            <div className="m-chips">
              <button type="button" className={`chip${filters.exam ? ' on' : ''}`} onClick={() => setFiltersRaw({ ...filters, exam: !filters.exam, examYears: [] })}>
                Asked <span className="n">{counts.exam}</span>
              </button>
              {ERA_ORDER.map((e) => (
                <button type="button" key={e} className={`chip${filters.styles.includes(e) ? ' on' : ''}`} onClick={() => toggleStyle(e)}>
                  <i className="sw" style={{ background: ERAS[e].color }} />
                  {ERAS[e].label}
                </button>
              ))}
              <button type="button" className={`chip${!isEmpty(filters) ? ' on' : ''}`} onClick={() => setSheet(true)} aria-label="All filters and list">
                <Icon name="filter" size={15} />
                List
              </button>
            </div>
          </header>
        )
      )}

      {!mobile && mode !== 'review' && index}

      <main className="main">
        <div className={`pane map-pane${mode === 'map' ? ' on' : ''}`} aria-hidden={mode !== 'map'}>
          <MapView
            ref={mapRef}
            buildings={results}
            selected={selected}
            hoverCity={hoverCity}
            padding={padding}
            reducedMotion={reducedMotion}
            compact={mobile}
            onSelect={(id) => select(id, { fly: false })}
            onCity={focusCity}
            onReady={() => setMapReady(true)}
          />
          {!mobile && !selected && !resumeHidden && mode === 'map' && (
            <div className="resume">
              <button type="button" className="r-close" aria-label="Hide" onClick={() => setResumeHidden(true)}>
                <Icon name="close" size={11} />
              </button>
              {lastB ? (
                <button type="button" className="r-row" onClick={() => select(lastB.id)}>
                  <i className="sq" style={{ background: ERAS[lastB.era].color }} />
                  <span className="r-tx">
                    <span className="r-k">Continue where you stopped</span>
                    <span className="r-t">{lastB.name}</span>
                    <span className="r-s">{[lastB.yearShort, lastB.city].filter(Boolean).join(', ')}</span>
                  </span>
                </button>
              ) : (
                <button type="button" className="r-row" onClick={() => setPalette('')}>
                  <i className="sq dark">
                    <Icon name="search" size={14} />
                  </i>
                  <span className="r-tx">
                    <span className="r-k">Start anywhere</span>
                    <span className="r-t">Search a name or click a city</span>
                    <span className="r-s">Press / from any view</span>
                  </span>
                </button>
              )}
              <button type="button" className="r-row" onClick={() => setMode('review')}>
                <i className="sq dark">
                  <Icon name="cards" size={14} />
                </i>
                <span className="r-tx">
                  <span className="r-k">Review</span>
                  <span className="r-t">All {TOTAL} buildings</span>
                  <span className="r-s">{reviewKnown ? `${reviewKnown} known so far` : 'Clue first, name second'}</span>
                </span>
                <kbd>R</kbd>
              </button>
            </div>
          )}
          {selected && mode === 'map' && (
            <DetailPanel
              b={selected}
              position={nav ? { index: nav.index + 1, total: nav.list.length, label: nav.label } : null}
              starred={starred.has(selected.id)}
              mobile={mobile}
              onPrev={() => step(-1)}
              onNext={() => step(1)}
              onClose={closeDetail}
              onStar={() => toggleStar(selected.id)}
              onSelect={(id) => select(id)}
            />
          )}
        </div>
        {mode === 'timeline' && (
          <div className="pane on">
            {mobile ? (
              <TimelineList
                list={results}
                selectedId={selId}
                onOpen={(id) => {
                  setMode('map');
                  select(id);
                }}
              />
            ) : (
              <TimelineView
                list={results}
                range={filters.range}
                selectedId={selId}
                mobile={false}
                onOpen={(id) => {
                  setMode('map');
                  select(id);
                }}
              />
            )}
          </div>
        )}
        {mode === 'review' && (
          <div className="pane on">
            <ReviewView
              mobile={mobile}
              onSeen={(id) => setSeen((s) => (s.has(id) ? s : new Set(s).add(id)))}
              onOpen={(id) => {
                setMode('map');
                select(id);
              }}
              onExit={() => setMode('map')}
            />
          </div>
        )}
      </main>

      {band}

      {mobile && (
        <nav className="tabbar" aria-label="Views">
          {modes.map(([m, label, icon]) => (
            <button type="button" key={m} className={mode === m ? 'on' : ''} aria-current={mode === m} onClick={() => setMode(m)}>
              <Icon name={icon} size={20} />
              {label}
            </button>
          ))}
        </nav>
      )}

      {mobile && sheet && (
        <div className="m-sheet" role="dialog" aria-label="Filters and list">
          <div className="m-sheet-h">
            <b>{results.length} buildings</b>
            <button type="button" className="btn dark" onClick={() => setSheet(false)}>
              Done
            </button>
          </div>
          {index}
        </div>
      )}

      {toast && (
        <div className="toast" role="status" key={toast.id}>
          <Icon name="check" size={14} />
          <span>{toast.text}</span>
          {toast.undo && (
            <button
              type="button"
              onClick={() => {
                setFiltersRaw(toast.undo!);
                setToast(null);
              }}
            >
              Undo
            </button>
          )}
        </div>
      )}

      {palette !== null && (
        <SearchPalette
          initial={palette}
          mobile={mobile}
          onClose={() => setPalette(null)}
          onOpen={(id) => {
            setPalette(null);
            if (mode !== 'map') setMode('map');
            select(id);
          }}
          onArchitect={(who) => {
            setPalette(null);
            setCity('');
            setMode('map');
            const next = { ...filters, who, q: '' };
            setFilters(next, (n) => `Showing ${n} buildings by ${who}`);
            window.requestAnimationFrame(() => mapRef.current?.fitTo(apply(next, starred), 13));
          }}
          onCity={(c) => {
            setPalette(null);
            setMode('map');
            focusCity(c);
          }}
          onKeep={(q) => {
            setPalette(null);
            const next = { ...filters, q };
            setFilters(next, (n) => `Showing ${n} matches for "${q}"`);
            if (mode === 'map') window.requestAnimationFrame(() => mapRef.current?.fitTo(apply(next, starred), 13));
          }}
        />
      )}
    </div>
  );
}

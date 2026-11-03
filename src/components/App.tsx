'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { EMPTY, apply, isEmpty, tagCounts, type Filters } from '../lib/filter';
import { DEFAULT_STATE, formatHash, parseHash, type Mode } from '../lib/hash';
import { BUILDINGS, BY_ID, CITY_BUILDINGS, ERAS, ERA_ORDER, byYear, type Building } from '../lib/model';
import { load, save } from '../lib/storage';
import type { EraId } from '../lib/types';
import { BuildingCard, CityPanel, cityOrder } from './DetailPanel';
import EraBand from './EraBand';
import { Icon } from './Icons';
import IndexPanel from './IndexPanel';
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
  const [seen, setSeen] = useState<Set<string>>(() => new Set(load<string[]>('seen', [])));
  const [starred, setStarred] = useState<Set<string>>(() => new Set(load<string[]>('starred', [])));
  const [palette, setPalette] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [hoverCity, setHoverCity] = useState('');
  const [sheet, setSheet] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [hoverId, setHoverId] = useState('');
  const mobile = useMedia(MOBILE_QUERY);
  const reducedMotion = useMedia('(prefers-reduced-motion: reduce)');
  const mapRef = useRef<MapHandle>(null);
  const mainRef = useRef<HTMLElement>(null);
  const [mainHeight, setMainHeight] = useState(600);
  useEffect(() => {
    if (!mainRef.current) return;
    const ro = new ResizeObserver(([e]) => e && setMainHeight(e.contentRect.height));
    ro.observe(mainRef.current);
    return () => ro.disconnect();
  }, []);
  const [mapReady, setMapReady] = useState(false);

  // Derived lists (deferred so chips respond at once and the map follows)
  const dFilters = useDeferredValue(filters);
  const results = useMemo(() => apply(dFilters, starred).sort(byYear), [dFilters, starred]);
  const counts = useMemo(() => tagCounts(filters, starred), [filters, starred]);
  const bandBase = useMemo(() => apply({ ...dFilters, styles: [] }, starred), [dFilters, starred]);
  const selected = selId ? (BY_ID.get(selId) ?? null) : null;


  // Order used by Previous / Next: the city's list (style groups, then year); a one-building city steps
  // through the same country by year
  const nav = useMemo(() => {
    if (!selected) return null;
    let list = cityOrder(selected.city);
    if (list.length < 2) list = BUILDINGS.filter((b) => b.country === selected.country).sort(byYear);
    return { list, index: list.findIndex((b) => b.id === selected.id) };
  }, [selected]);
  const panelOpen = mode === 'map' && (!!selected || !!city);

  // ---------- persistence ----------
  useEffect(() => {
    save('seen', [...seen]);
  }, [seen]);
  useEffect(() => {
    save('starred', [...starred]);
  }, [starred]);
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
    ? { top: 8, right: 48, bottom: panelOpen ? Math.round(mainHeight * 0.46) : 0, left: 0 }
    : { top: 0, right: panelOpen ? 372 : 0, bottom: 60, left: filtersOpen ? 352 : 0 };

  // ---------- actions ----------
  const select = useCallback(
    (id: string, opts: { fly?: boolean } = {}) => {
      const b = BY_ID.get(id);
      if (!b) return;
      setSelId(id);
      setCity(b.city);
      setSeen((s) => (s.has(id) ? s : new Set(s).add(id)));
      setSheet(false);
      if (opts.fly !== false) window.requestAnimationFrame(() => mapRef.current?.showBuilding(b));
    },
    [],
  );

  const focusCity = useCallback(
    (c: string) => {
      setCity(c);
      setSelId('');
      setSheet(false);
      setFiltersOpen(false);
      mapRef.current?.showCity(c);
    },
    [],
  );

  const closeDetail = useCallback(() => setSelId(''), []);
  const closeCity = useCallback(() => {
    setSelId('');
    setCity('');
  }, []);
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
  const clearAll = useCallback(() => {
    setFilters(EMPTY, () => `${TOTAL} buildings`);
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
        else if (filtersOpen) setFiltersOpen(false);
        else if (selId) closeDetail();
        else if (city) closeCity();
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
      else if (e.key === 'f') setFiltersOpen((o) => !o);
      else if (/^[1-8]$/.test(e.key)) toggleStyle(ERA_ORDER[Number(e.key) - 1]!);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [palette, sheet, selId, city, mode, step, toggleStar, toggleStyle, results, closeDetail, closeCity, filtersOpen]);

  // ---------- pieces ----------
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
      selectedId={selId}
      onFilters={(f) => setFiltersRaw(f)}
      onClear={clearAll}
      onCity={focusCity}
      onSelect={(id) => {
        if (mode !== 'map') setMode('map');
        select(id);
      }}
      onHoverCity={setHoverCity}
    />
  );

  const activeFilters = [filters.styles.length, filters.countries.length, filters.exam, filters.starred, filters.range, filters.q, filters.who].filter(Boolean).length;
  const band = mode !== 'review' && (
    <footer
      className={`band${mobile ? '' : ' dock'}`}
      style={!mobile ? { left: (filtersOpen ? 352 : 0) + 16, right: (panelOpen ? 372 : 0) + 16 } : undefined}
    >
      <EraBand base={bandBase} styles={filters.styles} onToggleStyle={toggleStyle} />
    </footer>
  );

  return (
    <div className={`app mode-${mode}${mobile ? ' is-mobile' : ''}`}>
      {!mobile ? (
        <header className="top">
          <div className="brand">GC Atlas</div>
          <button type="button" className={`fbtn${filtersOpen ? ' open' : ''}${activeFilters ? ' on' : ''}`} aria-expanded={filtersOpen} aria-label="Filters" onClick={() => setFiltersOpen((o) => !o)} title="Filters (F)">
            <Icon name="filter" size={16} />
            {activeFilters > 0 && <span className="badge">{activeFilters}</span>}
          </button>
          <button type="button" className="search" onClick={() => setPalette('')} title="Search (/)">
            <Icon name="search" size={16} />
            <span className="ph">{filters.q || 'Search'}</span>
          </button>
          <nav className="modes" aria-label="Views">
            {modes.map(([m, label, icon, key]) => (
              <button type="button" key={m} className={mode === m ? 'on' : ''} aria-current={mode === m} onClick={() => setMode(m)} title={`${label} (${key})`}>
                <Icon name={icon} size={17} />
                {label}
              </button>
            ))}
          </nav>
          <div className="seen" title="Buildings opened">
            <span>
              {seen.size}/{TOTAL}
            </span>
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
              <span>{filters.q || 'Search'}</span>
              <span className="m-seen">
                {seen.size}/{TOTAL}
              </span>
            </button>
            <div className="m-chips">
              <button type="button" className={`chip${filters.exam ? ' on' : ''}`} onClick={() => setFiltersRaw({ ...filters, exam: !filters.exam, examYears: [] })}>
                TEST-ARCHED <span className="n">{counts.exam}</span>
              </button>
              {ERA_ORDER.map((e) => (
                <button type="button" key={e} className={`chip${filters.styles.includes(e) ? ' on' : ''}`} onClick={() => toggleStyle(e)}>
                  <i className="sw" style={{ background: ERAS[e].color }} />
                  {ERAS[e].label}
                </button>
              ))}
              <button type="button" className={`chip${!isEmpty(filters) ? ' on' : ''}`} onClick={() => setSheet(true)} aria-label="All filters and list">
                <Icon name="filter" size={15} />
              </button>
            </div>
          </header>
        )
      )}


      <main className="main" ref={mainRef}>
        {!mobile && filtersOpen && mode !== 'review' && (
          <div className="drawer">
            <div className="drawer-h">
              <b>{results.length}</b>
              <button type="button" className="icon-btn" aria-label="Close filters" onClick={() => setFiltersOpen(false)}>
                <Icon name="close" size={13} />
              </button>
            </div>
            {index}
          </div>
        )}
        {!mobile && band}
        <div className={`pane map-pane${mode === 'map' ? ' on' : ''}`} aria-hidden={mode !== 'map'}>
          <MapView
            ref={mapRef}
            buildings={results}
            selected={selected}
            hoverCity={hoverCity}
            hoverId={hoverId}
            insetCity={selected?.city ?? city}
            padding={padding}
            reducedMotion={reducedMotion}
            compact={mobile}
            onSelect={(id) => select(id, { fly: false })}
            onCity={focusCity}
            onReady={() => setMapReady(true)}
          />
          {mode === 'map' && selected && (
            <BuildingCard
              b={selected}
              starred={starred.has(selected.id)}
              mobile={mobile}
              canStep={!!nav && nav.list.length > 1}
              onPrev={() => step(-1)}
              onNext={() => step(1)}
              onClose={closeCity}
              onStar={() => toggleStar(selected.id)}
              onBack={() => {
                setSelId('');
                mapRef.current?.showCity(selected.city);
              }}
              onSelect={(id) => select(id)}
              onHover={setHoverId}
            />
          )}
          {mode === 'map' && !selected && city && CITY_BUILDINGS.has(city) && (
            <CityPanel
              city={city}
              mobile={mobile}
              selectedId={selId}
              onSelect={(id) => select(id)}
              onClose={closeCity}
              onWhole={() => mapRef.current?.showCity(city)}
              onHover={setHoverId}
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

      {mobile && band}

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
            <b>{results.length}</b>
            <button type="button" className="icon-btn" aria-label="Close" onClick={() => setSheet(false)}>
              <Icon name="close" size={14} />
            </button>
          </div>
          {index}
        </div>
      )}

      {toast && (
        <div className="toast" role="status" key={toast.id}>
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
            setFilters(next, (n) => `${who}: ${n}`);
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
            setFilters(next, (n) => `${q}: ${n}`);
            if (mode === 'map') window.requestAnimationFrame(() => mapRef.current?.fitTo(apply(next, starred), 13));
          }}
        />
      )}
    </div>
  );
}

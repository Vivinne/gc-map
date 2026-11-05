'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { EMPTY, apply, isEmpty, tagCounts, type Filters } from '../lib/filter';
import { DEFAULT_STATE, type Mode } from '../lib/hash';
import { BUILDINGS, BY_ID, CITY_BUILDINGS, ERAS, ERA_ORDER, byYear, type Building } from '../lib/model';
import * as Col from '../lib/collections';
import { cleanQuiz, EMPTY_QUIZ, type QuizStore } from '../lib/quiz';
import { load, save } from '../lib/storage';
import type { EraId } from '../lib/types';
import { BuildingCard, CityPanel, cityOrder } from './DetailPanel';
import EraBand from './EraBand';
import { Icon } from './Icons';
import IndexPanel from './IndexPanel';
import MeView from './MeView';
import QuizView, { type QuizRequest } from './QuizView';
import MapView, { type MapHandle, type Padding } from './MapView';
import SearchPalette from './SearchPalette';

const MOBILE_QUERY = '(max-width: 900px)';
const LANDSCAPE_QUERY = '(max-width: 900px) and (orientation: landscape) and (max-height: 500px)';
/** Width of the side card on a sideways phone (kept in step with globals.css) */
const SIDE_CARD = 0.46;
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
  // A reload is a reset: the page always opens on the full map with nothing selected and no filters.
  // Personal data (seen, stars, collections, quiz results) stays.
  const initial = DEFAULT_STATE;
  const [mode, setMode] = useState<Mode>(initial.mode);
  const [selId, setSelId] = useState(BY_ID.has(initial.b) ? initial.b : '');
  const [city, setCity] = useState(initial.city);
  const [filters, setFiltersRaw] = useState<Filters>(initial.filters);
  const [seen, setSeen] = useState<Set<string>>(() => new Set(load<string[]>('seen', [])));
  const [starred, setStarred] = useState<Set<string>>(() => new Set(load<string[]>('starred', [])));
  const [collections, setCollections] = useState<Col.Collection[]>(() => {
    try {
      return Col.fromFile(Col.toFile({ seen: [], starred: [], collections: load<Col.Collection[]>('collections', []), quiz: null })).collections;
    } catch {
      return [];
    }
  });
  const [quizReq, setQuizReq] = useState<QuizRequest | null>(null);
  // Mounted from the first visit of the Quiz tab on
  const [quizUsed, setQuizUsed] = useState(false);
  useEffect(() => {
    if (mode === 'quiz') setQuizUsed(true);
  }, [mode]);
  const [quiz, setQuiz] = useState<QuizStore>(() => cleanQuiz(load<unknown>('quiz', EMPTY_QUIZ), new Set(BY_ID.keys())));
  const [palette, setPalette] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [hoverCity, setHoverCity] = useState('');
  const [sheet, setSheet] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [hoverId, setHoverId] = useState('');
  const mobile = useMedia(MOBILE_QUERY);
  // A phone held sideways: the card sits at the right of the map instead of over its bottom
  const wide = useMedia(LANDSCAPE_QUERY);
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


  // Previous / Next step through the buildings of the same city (map numbers), and only show when the
  // city has other buildings; a one-building city lists its nearest landmarks in the card instead
  const nav = useMemo(() => {
    if (!selected) return null;
    const list = cityOrder(selected.city);
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
    save('collections', collections);
    // A collection filter follows its collection (renamed, emptied or deleted)
    setFiltersRaw((f) => {
      if (!f.col) return f;
      const c = collections.find((x) => x.id === f.col!.id);
      if (!c) return { ...f, col: null };
      if (c.name === f.col.name && c.ids.join() === f.col.ids.join()) return f;
      return { ...f, col: { id: c.id, name: c.name, ids: c.ids } };
    });
  }, [collections]);
  useEffect(() => {
    save('quiz', quiz);
  }, [quiz]);
  useEffect(() => {
    // Clear any old view address (#m=...&b=...) so a reload never restores it
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname + window.location.search);
    // A page restored from the back/forward cache is a reload too
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) window.location.reload();
    };
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, []);

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
    ? wide
      ? { top: 8, right: panelOpen ? Math.round(window.innerWidth * SIDE_CARD) + 8 : 56, bottom: 44, left: 0 }
      : { top: 8, right: 56, bottom: panelOpen ? Math.round(mainHeight * 0.44) : 44, left: 0 }
    : { top: 0, right: panelOpen ? 372 : 0, bottom: 60, left: filtersOpen ? 352 : 0 };

  // ---------- actions ----------
  // The camera before a card or city list opened: closing them goes back to it
  const before = useRef<ReturnType<MapHandle['view']>>(null);
  const openRef = useRef(false);
  const cityRef = useRef('');
  cityRef.current = city;
  openRef.current = !!selId || !!city;
  const remember = () => {
    if (!openRef.current) before.current = mapRef.current?.view() ?? null;
  };
  // Camera moves wait for the panel to open, so the map is fitted to the area the panel leaves free
  // (a timer, not animation frames: those can stall on phones)
  const afterPanel = (f: () => void) => window.setTimeout(f, 80);
  const select = useCallback(
    (id: string, opts: { fly?: boolean } = {}) => {
      const b = BY_ID.get(id);
      if (!b) return;
      remember();
      setSelId(id);
      setCity(b.city);
      setSeen((s) => (s.has(id) ? s : new Set(s).add(id)));
      setSheet(false);
      if (opts.fly !== false) afterPanel(() => mapRef.current?.showBuilding(b));
    },
    [],
  );

  const focusCity = useCallback(
    (c: string) => {
      remember();
      setCity(c);
      setSelId('');
      setSheet(false);
      setFiltersOpen(false);
      afterPanel(() => mapRef.current?.showCity(c));
    },
    [],
  );

  // The panorama is the map at its plainest: nothing selected, no filters, no panels (Full map, or a
  // zoom out to the 500 km scale)
  const clearView = useCallback(() => {
    before.current = null;
    setSelId('');
    setCity('');
    setFiltersRaw(EMPTY);
    setFiltersOpen(false);
    setSheet(false);
    setHoverId('');
    setHoverCity('');
  }, []);
  // Card back to its city list: the map moves to the whole city
  const closeDetail = useCallback(() => {
    setSelId('');
    const c = cityRef.current;
    if (c) afterPanel(() => mapRef.current?.showCity(c));
  }, []);
  const closeCity = useCallback(() => {
    setSelId('');
    setCity('');
    // back to the view from before the panel opened
    const v = before.current;
    before.current = null;
    if (v) afterPanel(() => mapRef.current?.restore(v));
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
  const showOnMap = useCallback(
    (next: Filters) => {
      setFiltersRaw(next);
      setSelId('');
      setCity('');
      setMode('map');
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => mapRef.current?.fitTo(apply(next, starred), 13)));
    },
    [starred],
  );
  // Inside a claude.ai artifact the browser download is blocked; the host's downloads capability saves instead
  const hostSave = useRef<{ save(r: { filename: string; data: string }): Promise<unknown> } | null>(null);
  useEffect(() => {
    const host = (window as unknown as { claude?: { use?(n: string): Promise<unknown> } }).claude;
    host?.use?.('downloads').then((d) => {
      hostSave.current = (d as typeof hostSave.current) ?? null;
    }, () => undefined);
  }, []);
  const exportFile = useCallback(() => {
    const text = Col.toFile({ seen: [...seen], starred: [...starred], collections, quiz });
    const filename = `gc-atlas-${new Date().toISOString().slice(0, 10)}.json`;
    if (hostSave.current) {
      hostSave.current.save({ filename, data: text }).catch((e: { code?: string }) => {
        if (e?.code !== 'declined') setToast({ id: Date.now(), text: 'Export failed' });
      });
      return;
    }
    // In-app browsers (LINE, Facebook, Messenger, Instagram, WeChat) drop file downloads without a word
    if (/\bLine\/|FBAN|FBAV|FB_IAB|Instagram|MicroMessenger/i.test(navigator.userAgent)) {
      setToast({ id: Date.now(), text: 'This app cannot save files. Open the page in Safari or Chrome to export.' });
      return;
    }
    try {
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setToast({ id: Date.now(), text: 'Export failed' });
    }
  }, [seen, starred, collections, quiz]);
  const importFile = useCallback((text: string) => {
    try {
      const p = Col.fromFile(text);
      // Import adds to what is here: union of seen and stars, collections with the same name are merged
      setSeen((s) => new Set([...s, ...p.seen]));
      setStarred((s) => new Set([...s, ...p.starred]));
      setCollections((cur) => {
        let out = [...cur];
        for (const c of p.collections) {
          const same = out.find((x) => x.name === c.name);
          if (same) out = out.map((x) => (x === same ? { ...x, ids: [...new Set([...x.ids, ...c.ids])] } : x));
          else out = [...out, { ...c, id: Col.newId(out, Date.now() + out.length) }];
        }
        return out;
      });
      if (p.quiz) setQuiz(cleanQuiz(p.quiz, new Set(BY_ID.keys())));
      setToast({ id: Date.now(), text: `Imported: ${p.collections.length} collections, ${p.starred.length} starred` });
    } catch {
      setToast({ id: Date.now(), text: 'Not a GC Atlas file' });
    }
  }, []);
  // A category tag (style block, filter chip) was chosen: once the list follows, the map frames what it
  // now shows, so the user sees where that category is; an open card or city closes
  const fitNext = useRef(false);
  const pickCategory = useCallback((next: Filters | ((f: Filters) => Filters)) => {
    fitNext.current = true;
    before.current = null;
    setSelId('');
    setCity('');
    setFiltersRaw(next);
  }, []);
  useEffect(() => {
    if (!fitNext.current) return;
    fitNext.current = false;
    if (mode === 'map' && results.length && !isEmpty(dFilters)) mapRef.current?.fitAll(results);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results]);
  const toggleStyle = useCallback((id: EraId) => {
    fitNext.current = true;
    before.current = null;
    setSelId('');
    setCity('');
    setFiltersRaw((f) => ({ ...f, styles: f.styles.includes(id) ? f.styles.filter((x) => x !== id) : [...f.styles, id] }));
  }, []);
  const clearAll = useCallback(() => {
    setFilters(EMPTY, () => `${TOTAL} buildings`);
    setCity('');
  }, [setFilters]);


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
      if (mode === 'me' || mode === 'quiz') {
        if (e.key === 'm') setMode('map');
        if (e.key === 'q' && mode === 'me') setMode('quiz');
        if (e.key === 'u' && mode === 'quiz') setMode('me');
        return;
      }
      if (e.key === 'm') setMode('map');
      else if (e.key === 'u') setMode('me');
      else if (e.key === 'q') setMode('quiz');
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
  const modes: [Mode, string, 'map' | 'cards' | 'me', string][] = [
    ['map', 'Map', 'map', 'M'],
    ['quiz', 'Quiz', 'cards', 'Q'],
    ['me', 'Me', 'me', 'U'],
  ];

  const index = (
    <IndexPanel
      filters={filters}
      counts={counts}
      results={results}
      collections={collections}
      selectedId={selId}
      onFilters={pickCategory}
      onClear={clearAll}
      onCity={focusCity}
      onSelect={(id) => {
        if (mode !== 'map') setMode('map');
        select(id);
      }}
      onHoverCity={setHoverCity}
    />
  );

  const activeFilters = [filters.styles.length, filters.countries.length, filters.exam, filters.starred, filters.range, filters.q, filters.who, filters.col].filter(Boolean).length;
  // Phone: the band floats over the bottom of the map and steps aside while a sheet is open
  const band = mode === 'map' && !(mobile && panelOpen) && (
    <footer className={`band dock${mobile ? ' m' : ''}`} style={!mobile ? { left: 16, right: 16 } : undefined}>
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
        mode === 'map' && (
          <header className="m-top">
            <button type="button" className="m-search" onClick={() => setPalette('')}>
              <Icon name="search" size={17} />
              <span>{filters.q || 'Search'}</span>
              <span className="m-seen">
                {seen.size}/{TOTAL}
              </span>
            </button>
            <button type="button" className={`m-fbtn${activeFilters ? ' on' : ''}`} onClick={() => setSheet(true)} aria-label="All filters and list">
              <Icon name="filter" size={17} />
              {activeFilters > 0 && <span className="badge">{activeFilters}</span>}
            </button>
          </header>
        )
      )}


      <main className="main" ref={mainRef}>
        {!mobile && filtersOpen && mode === 'map' && (
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
        {band}
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
            onSelect={(id) => {
              // A pin picked on the map is the building to read about: keep it and its surroundings in view
              select(id, { fly: false });
              const b = BY_ID.get(id);
              // after the panel has opened and the map padding follows it (a timer: animation frames can stall on phones)
              if (b) window.setTimeout(() => mapRef.current?.focus(b), 80);
            }}
            onCity={focusCity}
            onReady={() => setMapReady(true)}
            onHome={() => {
              clearView();
              window.requestAnimationFrame(() => mapRef.current?.home());
            }}
            onPanorama={clearView}
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
              collections={collections}
              onToggleCol={(id) => setCollections((c) => Col.toggleIn(c, id, selected.id))}
              onCreateCol={(name) =>
                setCollections((c) => {
                  const next = Col.create(c, name);
                  const made = next[next.length - 1];
                  return made && next.length > c.length ? Col.toggleIn(next, made.id, selected.id) : next;
                })
              }
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
        {/* The quiz stays mounted while another tab is open, so a quiz in progress is still there on return */}
        {quizUsed && (
          <div className={`pane quizv${mode === 'quiz' ? ' on' : ''}`} hidden={mode !== 'quiz'}>
            <QuizView
              active={mode === 'quiz'}
              mobile={mobile}
              starred={starred}
              collections={collections}
              quiz={quiz}
              request={quizReq}
              onQuiz={setQuiz}
              onOpen={(id) => {
                setMode('map');
                select(id);
              }}
            />
          </div>
        )}
        {mode === 'me' && (
          <div className="pane on">
            <MeView
              mobile={mobile}
              seen={seen}
              starred={starred}
              collections={collections}
              quiz={quiz}
              onQuiz={(r) => {
                setQuizReq({ ...r, nonce: Date.now() });
                setMode('quiz');
              }}
              onMap={showOnMap}
              onCreate={(name) => setCollections((c) => Col.create(c, name))}
              onRename={(id, name) => setCollections((c) => Col.rename(c, id, name))}
              onDelete={(id) => setCollections((c) => Col.remove(c, id))}
              onExport={exportFile}
              onImport={importFile}
            />
          </div>
        )}
      </main>


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

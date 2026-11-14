'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BUILDINGS, BY_ID, type Building } from '../lib/model';
import { EMPTY_SCREEN, canGoBack, fromQuery, isEmptyScreen, saveStack, startStack, toQuery, type Screen, type View } from '../lib/nav';
import { addRecentBuilding, addRecentText, recentBuildings, recentTexts } from '../lib/recent';
import { search } from '../lib/search';
import BuildingCard from './BuildingCard';
import CategoryList from './CategoryList';
import { HeadBar } from './HeadBar';
import { Icon } from './Icons';
import Leave from './Leave';
import MapView, { type MapHandle, type Padding } from './MapView';
import Panel from './Panel';
import { Rows } from './ResultRow';
import SearchBox from './SearchBox';

const MOBILE_QUERY = '(max-width: 900px)';
/** Wait for a panel to take its size before the map frames what it shows */
const PANEL_WAIT = 60;
/** How many rows the search preview lists while typing */
const PREVIEW_MAX = 30;
/** Width the zoom buttons take from the right edge (32 px buttons + 16 px inset) */
const ZOOM_W = 48;
const NO_PAD: Padding = { top: 0, right: 0, bottom: 0, left: 0 };

function useMedia(q: string): boolean {
  const [on, setOn] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const f = () => setOn(m.matches);
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, [q]);
  return on;
}

/** Address and history at the start: what the page address names (reload or shared link) */
const START = typeof window !== 'undefined' ? fromQuery(window.location.search) : { screen: EMPTY_SCREEN, view: null };

export default function App() {
  const mobile = useMedia(MOBILE_QUERY);
  const reducedMotion = useMedia('(prefers-reduced-motion: reduce)');
  const [stack, setStack] = useState<Screen[]>(() => startStack(START.screen));
  const top = stack[stack.length - 1]!;
  // Text in the search box while the preview is open (typed, not yet submitted)
  const [draft, setDraft] = useState(top.q);
  const [hoverId, setHoverId] = useState('');
  // Buildings of the list rows on screen; the map names them and dims the rest
  const [seenIds, setSeenIds] = useState<string[]>([]);
  const [recentT, setRecentT] = useState<string[]>(() => recentTexts());
  const [recentB, setRecentB] = useState<string[]>(() => recentBuildings());
  const [mapDown, setMapDown] = useState(false);
  const [padding, setPadding] = useState<Padding>(NO_PAD);
  const mapRef = useRef<MapHandle>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const appRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const viewRef = useRef<View | null>(START.view);

  const results = useMemo(() => (top.q ? search(top.q) : []), [top.q]);
  const preview = useMemo(() => (draft.trim() ? search(draft) : []), [draft]);
  const selected = top.b ? (BY_ID.get(top.b) ?? null) : null;
  const group = useMemo(() => top.group.map((id) => BY_ID.get(id)).filter((b): b is Building => !!b), [top.group]);
  const back = canGoBack(stack);

  // The address and the history follow the screen, so a reload or a shared link opens the same screen
  const writeAddress = useCallback((s: Screen) => {
    const url = window.location.pathname + toQuery(s, viewRef.current) + window.location.hash;
    window.history.replaceState(window.history.state, '', url);
  }, []);
  useEffect(() => {
    writeAddress(top);
    saveStack(stack);
  }, [stack, top, writeAddress]);

  /** Run after the panels have their new size */
  const afterPanel = (f: () => void) => window.setTimeout(f, PANEL_WAIT);

  /** Open a new screen; the screen it leaves keeps the map view, so ＜ can bring the map back to it */
  const push = (s: Screen) => {
    const view = mapRef.current?.view() ?? undefined;
    setStack((st) => {
      const cur = st[st.length - 1]!;
      return [...st.slice(0, -1), { ...cur, view, ...(cur.list === 'preview' ? { draft } : {}) }, s];
    });
  };

  /** ＜: the previous screen comes back with its lists, its search and the map as it was then */
  const goBack = () => {
    if (stack.length < 2) return;
    const prev = stack[stack.length - 2]!;
    setStack((st) => st.slice(0, -1));
    setDraft(prev.draft ?? prev.q);
    if (prev.view) {
      const v = prev.view;
      afterPanel(() => mapRef.current?.moveTo(v));
    } else if (prev.q && prev.q !== top.q) afterPanel(() => mapRef.current?.fitTo(search(prev.q)));
  };

  /** × and Esc: everything closes, the text and results go; the map stays where it is */
  const closeAll = () => {
    setStack([EMPTY_SCREEN]);
    setDraft('');
    inputRef.current?.blur();
  };

  const openPreview = () => {
    if (top.list === 'preview' && !top.b) return;
    setDraft(top.q);
    push({ q: top.q, list: 'preview', group: [], b: '' });
  };

  const submit = (text: string) => {
    const t = text.trim();
    if (!t) return;
    const found = search(t);
    // no result: nothing is submitted, the preview says No Results
    if (!found.length) return;
    inputRef.current?.blur();
    setDraft(t);
    setRecentT(addRecentText(t));
    const next: Screen = { q: t, list: 'results', group: [], b: '' };
    // The search preview is only the typing step: the submitted search takes its place in the history,
    // so ＜ goes back to the screen before the typing (e.g. the previous search's results), not to the half-typed text
    if (top.list === 'preview' && !top.b) setStack((st) => [...st.slice(0, -1), next]);
    else push(next);
    afterPanel(() => mapRef.current?.fitTo(found));
  };

  const openCard = (id: string) => {
    const b = BY_ID.get(id);
    if (!b) return;
    inputRef.current?.blur();
    setRecentB(addRecentBuilding(id));
    push({ ...top, b: id });
    afterPanel(() => mapRef.current?.focus(b));
  };

  const openGroup = (ids: string[]) => {
    const items = ids.map((id) => BY_ID.get(id)).filter((b): b is Building => !!b);
    if (!items.length) return;
    push({ q: top.q, list: 'group', group: ids, b: '' });
    // the map zooms in beside the list it opened, just far enough for each of its buildings to stand alone
    afterPanel(() => mapRef.current?.split(items));
  };

  const toggleCategory = () => {
    if (top.list === 'category' && !top.b) goBack();
    else push({ q: top.q, list: 'category', group: [], b: '' });
  };

  // Keys: "/" opens the search, Esc closes everything
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeAll();
      } else if (e.key === '/' && document.activeElement !== inputRef.current) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // The part of the map the search box and the open panel cover: the map frames buildings beside them
  useLayoutEffect(() => {
    const measure = () => {
      const app = appRef.current?.getBoundingClientRect();
      const bar = appRef.current?.querySelector('.topbar')?.getBoundingClientRect();
      // Offsets, not the drawn box: a panel still sliding in (or being dragged) is measured where it comes to rest
      const el = panelRef.current;
      const p = el ? { left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight } : null;
      if (!app) return;
      // Desktop: the zoom buttons sit along the right edge, so framed buildings stay clear of them
      const next = { ...NO_PAD, top: bar ? bar.bottom - app.top : 0, right: mobile ? 0 : ZOOM_W };
      if (p && p.width && p.height) {
        if (!mobile) next.left = p.left + p.width;
        else if (p.top > app.height / 3) next.bottom = app.height - p.top;
        else next.top = Math.max(next.top, p.top + p.height);
      }
      setPadding((o) => (o.top === next.top && o.left === next.left && o.bottom === next.bottom && o.right === next.right ? o : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (panelRef.current) ro.observe(panelRef.current);
    if (appRef.current) ro.observe(appRef.current);
    return () => ro.disconnect();
  });

  // A shared link or reload with a search but no saved view: frame the results once the map is there
  useEffect(() => {
    if (!START.view && top.q) afterPanel(() => mapRef.current?.fitTo(search(top.q)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const editing = top.list === 'preview' && !top.b;
  // the typed text stays in the box while a card opened from the preview is on top of it
  const boxText = top.list === 'preview' ? draft : top.q;
  const anything = !isEmptyScreen(top) || !!boxText;

  // The panel on screen: the card over everything, else the open list (one at a time)
  let panel: React.ReactNode = null;
  if (selected) {
    panel = <BuildingCard ref={panelRef} key="card" b={selected} mobile={mobile} canBack={back} onBack={goBack} onClose={closeAll} onArchitect={submit} />;
  } else if (top.list === 'preview' && (draft.trim() || recentT.length > 0 || recentB.some((id) => BY_ID.has(id)))) {
    const recentList = recentB.map((id) => BY_ID.get(id)).filter((b): b is Building => !!b);
    panel = (
      <Panel ref={panelRef} key="preview" mobile={mobile} place="top" fill label="Search" className="preview" resetKey="preview" head={null}>
        {draft.trim() ? (
          preview.length ? (
            <Rows list={preview.slice(0, PREVIEW_MAX)} onOpen={openCard} onHover={setHoverId} />
          ) : (
            <p className="none">No Results</p>
          )
        ) : (
          <>
            {recentT.length > 0 && (
              <ul className="rows recent">
                {recentT.map((t) => (
                  <li key={t}>
                    <button type="button" className="row text" onClick={() => submit(t)}>
                      <Icon name="clock" size={14} />
                      <span>{t}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {recentList.length > 0 && <Rows list={recentList} onOpen={openCard} onHover={setHoverId} />}
          </>
        )}
      </Panel>
    );
  } else if (top.list === 'category') {
    panel = (
      <Panel ref={panelRef} key="category" mobile={mobile} place="top" label="Category" className="category" resetKey="category" head={<HeadBar canBack={back} onBack={goBack} onClose={closeAll} title="Category" />}>
        <CategoryList onPick={submit} />
      </Panel>
    );
  } else if (top.list === 'group' && group.length) {
    panel = (
      <Panel ref={panelRef} key={`group-${top.group.join('~')}`} mobile={mobile} place="sheet" label="Architectures" className="group" resetKey={top.group.join('~')} head={<HeadBar canBack={back} onBack={goBack} onClose={closeAll} title={`${group.length} Architectures`} />}>
        <Rows list={group} onOpen={openCard} onHover={setHoverId} onVisible={setSeenIds} />
      </Panel>
    );
  } else if (top.list === 'results' && results.length) {
    panel = (
      <Panel ref={panelRef} key="results" mobile={mobile} place="sheet" label="Results" className="results" resetKey={top.q} head={null}>
        <Rows list={results} onOpen={openCard} onHover={setHoverId} onVisible={setSeenIds} onCountry={(items) => mapRef.current?.fitTo(items)} />
      </Panel>
    );
  }

  return (
    <div className={`app${mobile ? ' is-mobile' : ''}`} ref={appRef}>
      <main className="main">
        <MapView
          ref={mapRef}
          buildings={top.q ? results : BUILDINGS}
          searched={!!top.q}
          selected={selected}
          hoverId={hoverId}
          seenIds={!selected && (top.list === 'results' || top.list === 'group') ? seenIds : null}
          padding={padding}
          reducedMotion={reducedMotion}
          compact={mobile}
          start={START.view}
          onSelect={openCard}
          onGroup={openGroup}
          onView={(v) => {
            viewRef.current = v;
            writeAddress(top);
          }}
          onFail={() => setMapDown(true)}
          fallback={
            <div className="map-down">
              <h2>The map can&apos;t be shown in this browser.</h2>
              <details>
                <summary>Details</summary>
                <p>The map draws with WebGL (3D graphics in the browser), which is turned off or blocked here. Turning on hardware acceleration in the browser settings, or another browser, usually brings it back.</p>
              </details>
              <Rows list={top.q ? results : BUILDINGS} onOpen={openCard} onHover={setHoverId} />
            </div>
          }
        />
        <SearchBox
          ref={inputRef}
          value={boxText}
          showClear={anything}
          categoryOpen={top.list === 'category' && !top.b}
          onBack={top.list === 'results' && !top.b && back ? goBack : undefined}
          onFocus={openPreview}
          onChange={(t) => {
            if (!editing) openPreview();
            setDraft(t);
          }}
          onSubmit={() => submit(draft)}
          onClear={closeAll}
          onCategory={toggleCategory}
        />
        <Leave show={!!panel}>{panel}</Leave>
      </main>
      {mapDown && <span className="sr-only">Map unavailable</span>}
    </div>
  );
}

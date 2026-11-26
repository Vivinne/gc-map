'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fromQuery, setAddress, toQuery } from '../core/address';
import { EMPTY_SCREEN, canGoBack, isEmptyScreen, useHistory, type Screen, type View } from '../core/history';
import { usePointing } from '../core/pointing';
import { MOBILE_QUERY, useMedia } from '../shared/device';
import { BUILDINGS, BY_ID, ERA_ORDER, byYear, type Building } from '../data';
import { useRecent, useSearchText } from '../features/search';
import { loadFolded, useDesktopPanel, useMapRoom, usePanelSlide } from '../layout';
import { clearBox, closeAll, closeMore, foldPanel, frameGroup, goBack, isFramed, listOf, mapReady, mapStopped, openCard, openGroup, openMore, openPreview, pickTag, railCategory, railSearch, searchClose, submitSearch, toggleCategory, toggleFold, typeText, useKeys, type Ctx } from '../flows';
import { RemoveButton } from '../shared/ui';
import { searchSplit } from '../features/search';
import { BuildingCard } from '../features/card';
import { CategoryList } from '../features/category';
import { HeadBar } from '../shared/ui';
import { Icon } from '../shared/ui';
import { Leave } from '../layout';
import { MapView, useKeyboardFraming, type MapHandle } from '../features/map';
import { Panel } from '../layout';
import { Rail, type RailPage } from '../features/rail';
import { ResultList, NoResults } from '../features/list';
import { SearchBox } from '../features/search';
import { RAIL_W } from '../shared/tokens';

/** How many rows the search preview lists while typing */
const PREVIEW_MAX = 30;
/** Width the zoom buttons take from the right edge (32 px buttons + 16 px inset) */
const ZOOM_W = 48;

/** Address and history at the start: what the page address names (reload or shared link) */
const START = typeof window !== 'undefined' ? fromQuery(window.location.search) : { screen: EMPTY_SCREEN, view: null };

export default function App() {
  const mobile = useMedia(MOBILE_QUERY);
  const reducedMotion = useMedia('(prefers-reduced-motion: reduce)');
  const history = useHistory(START.screen);
  const { stack, stackRef } = history;
  /** The stack the page opened with (the map frames a later screen when it arrives) */
  const [startedWith] = useState(stack);
  const top = stack[stack.length - 1]!;

  // Text in the search box: typed and not yet sent, and text left typed when another screen opened (F1)
  const text = useSearchText(top.list, top.q);
  const { draft, unsent } = text;

  const [, setViewTick] = useState(0);
  /** The last group line clicked (country, other outcomes) and the map view its framing came to rest at */
  const frameClick = useRef<{ ids: string; view: View | null } | null>(null);
  // What is pointed at, and the list rows on screen (the map rings, names and dims by them); a new screen ends the ring
  const { hoverId, setHoverId, seenIds, setSeenIds, foldSeen, keepSeen } = usePointing(top);
  const recent = useRecent();
  const [mapDown, setMapDown] = useState(false);
  const mapRef = useRef<MapHandle>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const appRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  // Phone: results sent with the keyboard up are framed once it has gone (F5a)
  const keyboard = useKeyboardFraming(mapRef, inputRef);
  // The part of the map the search box, the open panel, the rail and the zoom buttons cover (L1)
  const padding = useMapRoom(appRef, panelRef, mobile, { left: RAIL_W, right: ZOOM_W });
  const viewRef = useRef<View | null>(START.view);
  // Desktop content panel beside the rail: open or folded (L1)
  const dock = useDesktopPanel(!isEmptyScreen(START.screen) && !loadFolded(), !isEmptyScreen(top));
  const panelOpen = dock.open;
  /**
   * Desktop: with nothing open, the panel shows the menu page; the search page once Search was chosen (rail or
   * menu). Closing the panel keeps this, so it opens again on the page that was left; × starts over at the menu.
   */
  const [searchPage, setSearchPage] = useState(false);

  // A search's main matches first; its other matches join below (list and map) after Other Possible Outcomes (Polish 13)
  const found = useMemo(() => (top.q ? listOf(top.q, top.list) : { main: [], more: [] }), [top.q, top.list]);
  const [moreOpen, setMoreOpen] = useState('');
  const moreView = useRef<View | null>(null);
  // another search on screen folds the other outcomes away: ＜ back to this search shows them folded
  useEffect(() => {
    if (moreOpen && moreOpen !== top.q) setMoreOpen('');
  }, [moreOpen, top.q]);
  // With no main match the list says No Results; the other matches still wait behind Other Possible Outcomes
  const moreList = found.more;
  const results = useMemo(() => (moreOpen === top.q ? [...found.main, ...found.more] : found.main), [found, moreOpen, top.q]);
  // the preview while typing shows main matches only
  const preview = useMemo(() => (draft.trim() ? searchSplit(draft).main : []), [draft]);
  const selected = top.b ? (BY_ID.get(top.b) ?? null) : null;
  // Number point list: by category in the ring's order (Ancient → Others), then oldest first inside each
  const group = useMemo(
    () =>
      top.group
        .map((id) => BY_ID.get(id))
        .filter((b): b is Building => !!b)
        .sort((a, b) => ERA_ORDER.indexOf(a.era) - ERA_ORDER.indexOf(b.era) || byYear(a, b)),
    [top.group],
  );
  const back = canGoBack(stack);

  // The address and the history follow the screen, so a reload or a shared link opens the same screen
  const writeAddress = useCallback((s: Screen) => {
    setAddress(window.location.pathname + toQuery(s, viewRef.current) + window.location.hash);
  }, []);
  useEffect(() => writeAddress(top), [stack, top, writeAddress]);

  // Desktop content panel: which page it shows, for the rail's lit button
  const menuPage = isEmptyScreen(top) && !searchPage;
  const railPage: RailPage = top.b || top.list === 'group' || menuPage ? 'other' : top.list === 'category' || top.list === 'era' ? 'category' : 'search';

  /** The cards waiting for their map view, and the last group line clicked (see flows) */
  const cardHome = useRef('');
  // The session the flows act on, built on every render so each action sees the newest screen and text
  const ctx: Ctx = {
    top,
    stack,
    stackRef,
    history,
    text,
    recent,
    dock,
    searchPage,
    setSearchPage,
    menuPage,
    railPage,
    mobile,
    map: mapRef,
    panel: panelRef,
    input: inputRef,
    keyboard,
    more: { open: moreOpen, set: setMoreOpen, view: moreView },
    found,
    keepSeen,
    cardHome,
    frameClick,
    view: viewRef,
    writeAddress,
    redrawLines: () => setViewTick((n) => n + 1),
    start: { view: START.view, stack: startedWith },
  };
  useKeys(ctx);

  const editing = top.list === 'preview' && !top.b;
  // ＜ in the search box only while the box is opened again over a submitted search (it goes back to the
  // screen from before the box was clicked); submitted results carry their ＜ and × in the list's own top row
  const prevScreen = stack.length > 1 ? stack[stack.length - 2]! : null;
  const boxBack = back && editing && !!prevScreen?.q;
  // the typed text stays in the box while a card opened from the preview is on top of it
  // over Category the text typed and not sent stays in the box (user, 2026-11-25)
  const boxText = top.list === 'preview' ? draft : top.list === 'era' ? '' : top.list === 'category' ? (unsent.current ?? top.q) : top.q;
  // × in the search box only while typing (the search preview is open): it clears the text, or closes the
  // empty preview. Every other screen closes with the × in its own top row
  const showClear = editing;
  // The map gets callbacks that never change, each calling this render's own function (R8): typing in the search
  // box then does not redraw every marker, and a click still acts on the newest screen and typed text
  const live = useRef(ctx);
  live.current = ctx;
  const mapSelect = useCallback((id: string) => openCard(live.current, id, true), []);
  const mapGroup = useCallback((ids: string[]) => openGroup(live.current, ids), []);
  const mapView = useCallback((v: View) => mapStopped(live.current, v), []);
  const mapFail = useCallback(() => setMapDown(true), []);
  const mapReadyStable = useCallback(() => mapReady(live.current), []);
  /** Desktop search page: ＜ as on the results list; while typing, back to the screen the page was opened over */
  // the typing page gets ＜ whenever it was opened over another screen than the plain map (card, list, Category;
  // user, 2026-11-25), not only over a submitted search as the phone box does
  const searchBack = editing ? back && !!prevScreen && !isEmptyScreen(prevScreen) : back;
  const searchBox = (docked: boolean) => (
    <SearchBox
      ref={inputRef}
      docked={docked}
      value={boxText}
      showClear={docked || showClear}
      categoryOpen={top.list === 'category' && !top.b}
      onBack={(docked ? searchBack : boxBack) ? () => (inputRef.current?.blur(), goBack(ctx)) : undefined}
      onFocus={() => openPreview(ctx)}
      onChange={(t) => typeText(ctx, t)}
      onSubmit={() => submitSearch(ctx, draft)}
      onClear={() => (docked ? searchClose(ctx) : clearBox(ctx))}
      onCategory={() => toggleCategory(ctx)}
    />
  );

  // The panel on screen: the card over everything, else the open list (one at a time)
  const recentList = recent.buildings.map((id) => BY_ID.get(id)).filter((b): b is Building => !!b);
  const hasPreview = !!draft.trim() || recent.texts.length > 0 || recentList.length > 0;
  // The search preview (typing matches, or the recent texts and buildings)
  const previewBody = (
    <>
      {draft.trim() ? (
        preview.length ? (
          <ResultList list={preview.slice(0, PREVIEW_MAX)} onOpen={(id) => openCard(ctx, id)} onHover={setHoverId} />
        ) : (
          <NoResults />
        )
      ) : (
        <>
          {recent.texts.length > 0 && (
            <ul className="rows recent">
              {recent.texts.map((t) => (
                <li key={t} className="has-x">
                  <button type="button" className="row text" onClick={() => submitSearch(ctx, t)}>
                    <Icon name="clock" size={14} />
                    <span>{t}</span>
                  </button>
                  <RemoveButton label={t} onRemove={() => recent.removeText(t)} />
                </li>
              ))}
            </ul>
          )}
          {recentList.length > 0 && (
            // recent buildings: name with built span · city, then architect · style (see .recent-b)
            <div className="recent-b">
              <ResultList list={recentList} onOpen={(id) => openCard(ctx, id)} onHover={setHoverId} onRemove={recent.removeBuilding} />
            </div>
          )}
        </>
      )}
    </>
  );
  // A submitted search's results list
  const resultsBody = (
    <ResultList
      list={found.main}
      onOpen={(id) => openCard(ctx, id)}
      onHover={setHoverId}
      onVisible={setSeenIds}
      onCountry={(items) => frameGroup(ctx, items)}
      framed={(items) => isFramed(ctx, items)}
      more={{
        list: moreList,
        open: moreOpen === top.q,
        onOpen: () => openMore(ctx),
        onClose: () => closeMore(ctx),
      }}
    />
  );

  let panel: React.ReactNode = null;
  if (selected) {
    panel = <BuildingCard ref={panelRef} key="card" scroll={top.scroll} b={selected} mobile={mobile} canBack={back} onBack={() => goBack(ctx)} onClose={() => closeAll(ctx)} onArchitect={(t) => submitSearch(ctx, t)} />;
  } else if (top.list === 'preview' && hasPreview) {
    panel = (
      <Panel ref={panelRef} scroll={top.scroll} key="preview" mobile={mobile} place="top" label="Search" className="preview" resetKey="preview" head={null}>
        {previewBody}
      </Panel>
    );
  } else if (top.list === 'category') {
    // opened from the plain map, ＜ would only close it, like ×: only × shows
    panel = (
      <Panel ref={panelRef} scroll={top.scroll} key="category" mobile={mobile} place="top" label="Category" className="category" resetKey="category" head={<HeadBar canBack={back && !(prevScreen && isEmptyScreen(prevScreen))} onBack={() => goBack(ctx)} onClose={() => closeAll(ctx)} title="Category" />}>
        <CategoryList onPick={(label) => pickTag(ctx, label)} />
      </Panel>
    );
  } else if (top.list === 'group' && group.length) {
    panel = (
      <Panel ref={panelRef} scroll={top.scroll} key={`group-${top.group.join('~')}`} mobile={mobile} place="sheet" label="Architectures" className="group" resetKey={top.group.join('~')} head={<HeadBar canBack={back} onBack={() => goBack(ctx)} onClose={() => closeAll(ctx)} title={`${group.length} Architectures`} />}>
        <ResultList list={group} onOpen={(id) => openCard(ctx, id)} onHover={setHoverId} onVisible={setSeenIds} />
      </Panel>
    );
  } else if (top.list === 'era' && top.q) {
    // a picked Category tag: its name is the title, ＜ goes back to the tags
    panel = (
      <Panel ref={panelRef} scroll={top.scroll} key="era" mobile={mobile} place="sheet" label={top.q} className="results" resetKey={`era:${top.q}`} head={<HeadBar canBack={back && !(prevScreen && isEmptyScreen(prevScreen))} onBack={() => goBack(ctx)} onClose={() => closeAll(ctx)} title={top.q} />}>
        {resultsBody}
      </Panel>
    );
  } else if (top.list === 'results' && top.q) {
    panel = (
      <Panel ref={panelRef} scroll={top.scroll} key="results" mobile={mobile} place="sheet" label="Results" className="results" resetKey={top.q} head={<HeadBar canBack={back} onBack={() => goBack(ctx)} onClose={() => closeAll(ctx)} />}>
        {resultsBody}
      </Panel>
    );
  }
  // Desktop content panel: the page the panel shows (a new page mounts a new panel, with its own entry animation)
  const dockKey = menuPage && !selected ? 'menu' : selected ? 'card' : top.list === 'category' ? 'category' : top.list === 'era' ? `era-${top.q}` : top.list === 'group' && group.length ? `group-${top.group.join('~')}` : 'search';
  // the page the panel opened on slides in; once another page opens, nothing slides until the next opening
  const slideIn = usePanelSlide(dock, dockKey);
  // Desktop: every page sits in one content panel beside the rail. Closed: nothing shows (the screen is kept).
  // The search page keeps one panel from the empty page to typing to results, so the box never loses its focus
  if (!mobile) {
    if (!panelOpen) panel = null;
    else if (!selected && top.list !== 'category' && top.list !== 'era' && !(top.list === 'group' && group.length)) {
      panel = (
        <Panel
          ref={panelRef}
          scroll={top.scroll}
          key="search"
          mobile={false}
          place="top"
          label="Search"
          className="search"
          resetKey={`${top.list}:${top.q}`}
          head={
            <>
              {/* the search box is the page's top row (user, 2026-11-24): ＜ and × sit in the box, no title */}
              {searchBox(true)}
            </>
          }
        >
          {editing ? hasPreview && previewBody : top.list === 'results' && top.q ? resultsBody : null}
        </Panel>
      );
    }
    // one wrapper that is always there (display: contents), so adding or dropping its class never mounts the panel again
    if (panel) panel = <div className={`dock${slideIn ? ' slide-in' : ''}`}>{panel}</div>;
  }


  return (
    <div className={`app${mobile ? ' is-mobile' : ''}`} ref={appRef}>
      <main className="main">
        {/* phone: the search box and Category stay top left; desktop: the rail, and the box in the content panel */}
        {mobile ? searchBox(false) : <Rail open={panelOpen} page={railPage} onFold={() => foldPanel(ctx)} canFold={panelOpen ? !!panel : !isEmptyScreen(top)} onToggle={() => toggleFold(ctx)} onSearch={() => railSearch(ctx)} onCategory={() => railCategory(ctx)} />}
        <Leave show={!!panel} slide={!mobile && !panelOpen}>{panel}</Leave>
        {/* last in the page order (Tab: search box, then the open panel, then the map); drawn under both */}
        <MapView
          ref={mapRef}
          buildings={top.q ? results : BUILDINGS}
          searched={!!top.q}
          selected={selected}
          hoverId={hoverId}
          seenIds={!selected && (top.list === 'results' || top.list === 'era' || top.list === 'group') ? (mobile || panelOpen ? seenIds : foldSeen) : null}
          padding={padding}
          reducedMotion={reducedMotion}
          compact={mobile}
          start={START.view}
          onSelect={mapSelect}
          onGroup={mapGroup}
          onView={mapView}
          onFail={mapFail}
          onReady={mapReadyStable}
          down={mapDown}
          fallback={
            // kept clear of the search box and the open panel; while a panel lists buildings, the page does not list them again
            <div className="map-down" style={{ marginTop: padding.top, marginLeft: padding.left, marginBottom: padding.bottom }}>
              <h2>The map can&apos;t be shown in this browser.</h2>
              <details>
                <summary>Details</summary>
                <p>The map draws with WebGL (3D graphics in the browser), which is turned off or blocked here. Turning on hardware acceleration in the browser settings, or another browser, usually brings it back.</p>
              </details>
              {!panel && <ResultList list={top.q ? results : BUILDINGS} onOpen={(id) => openCard(ctx, id)} onHover={setHoverId} />}
            </div>
          }
        />
      </main>
      {mapDown && <span className="sr-only">Map unavailable</span>}
      {/* read out by screen readers when a search is sent: how many results, or No Results (A3) */}
      <p className="sr-only" role="status" aria-live="polite">
        {(top.list === 'results' || top.list === 'era') && top.q && !top.b ? (found.main.length ? `${found.main.length} ${found.main.length === 1 ? 'result' : 'results'}` : 'No Results') : ''}
      </p>
    </div>
  );
}

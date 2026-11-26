'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fromQuery, setAddress, toQuery } from '../core/address';
import { EMPTY_SCREEN, canGoBack, isEmptyScreen, useHistory, type Screen, type View } from '../core/history';
import { usePointing } from '../core/pointing';
import { MOBILE_QUERY, useMedia } from '../shared/device';
import { BUILDINGS, BY_ID, ERA_ORDER, byYear, type Building } from '../data';
import { useRecent, useSearchText } from '../features/search';
import { loadFolded, useDesktopPanel, useMapRoom, usePanelSlide } from '../layout';
import { listOf } from '../flows/lists';
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

/** One key for a group of buildings */
const idsOf = (list: Building[]) => list.map((b) => b.id).join('~');
/** Two map views are the same place and zoom (a move of the map makes them differ) */
const sameView = (a: View, b: View) => Math.abs(a.zoom - b.zoom) < 0.01 && Math.abs(a.lng - b.lng) < 1e-5 && Math.abs(a.lat - b.lat) < 1e-5;
/** Wait for a panel to take its size before the map frames what it shows */
const PANEL_WAIT = 60;
/** Longest camera move (1600 ms) and a little: a card that did not move the map notes its view by then */
const CARD_SETTLE = 1800;
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
  const { draft, setDraft, unsent } = useSearchText(top.list, top.q);

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
  /** Desktop: hide the panel only (not ×): the screen, the search and the map stay as they are */
  const foldPanel = () => {
    keepSeen();
    dock.close();
  };
  const openPanel = dock.show;

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

  /** Run after the panels have their new size */
  const afterPanel = (f: () => void) => window.setTimeout(f, PANEL_WAIT);

  /** Open a new screen; the screen it leaves keeps the map view, so ＜ can bring the map back to it */
  const push = (s: Screen) => {
    const view = mapRef.current?.view() ?? undefined;
    const scroll = panelRef.current?.querySelector('.p-body')?.scrollTop ?? undefined;
    // the screen already on top (the open card or number point clicked again, a double click): no new step
    history.push(s, (cur) => ({ view, scroll, ...(cur.list === 'preview' ? { draft } : {}) }));
  };

  /** ＜: the previous screen comes back with its lists, its search and the map as it was then */
  const goBack = () => {
    if (stack.length < 2) return;
    const prev = stack[stack.length - 2]!;
    history.back();
    setDraft(prev.draft ?? prev.q);
    // A results list or a number point list comes back with all its buildings framed (as when it opened);
    // a card comes back with its building in sight, as it was when the card opened (the map may have been
    // moved away from it before the next card was opened); other screens come back with the map as it was left
    if (!prev.b && (prev.list === 'results' || prev.list === 'era' || prev.list === 'group')) {
      let items: Building[];
      if (prev.list === 'group') items = prev.group.map((id) => BY_ID.get(id)).filter((b): b is Building => !!b);
      else {
        const f = listOf(prev.q, prev.list);
        items = [...f.main, ...(moreOpen === prev.q ? f.more : [])];
      }
      if (items.length) {
        afterPanel(() => (prev.list === 'group' ? mapRef.current?.split(items) : mapRef.current?.fitTo(items)));
        return;
      }
    }
    const target = prev.b && prev.home ? prev.home : prev.view;
    if (target) {
      const v = target;
      afterPanel(() => mapRef.current?.moveTo(v));
    } else if (prev.q && prev.q !== top.q) afterPanel(() => mapRef.current?.fitTo(listOf(prev.q, prev.list).main));
  };

  /** × and Esc: everything closes, the text and results go; the map stays where it is */
  const closeAll = () => {
    // the map stops where it is, also in the middle of a move (Q6), and no framing waits to run after it
    mapRef.current?.stop();
    keyboard.cancel();
    setMoreOpen('');
    history.reset(EMPTY_SCREEN);
    unsent.current = null;
    setDraft('');
    inputRef.current?.blur();
    // desktop: nothing is open after ×, so the content panel closes too (the menu shows when it opens again)
    dock.close();
    setSearchPage(false);
  };

  const openPreview = () => {
    if (top.list === 'preview' && !top.b) return;
    // a picked Category tag is not a search: the box opens over it with no search
    const q = top.list === 'era' ? '' : top.q;
    setDraft(unsent.current ?? q);
    push({ q, list: 'preview', group: [], b: '' });
  };

  const submit = (text: string) => {
    const t = text.trim();
    if (!t) return;
    const split = searchSplit(t);
    // no match at all: nothing is submitted, the preview says No Results
    if (!split.main.length && !split.more.length) return;
    unsent.current = null;
    const found = split.main;
    inputRef.current?.blur();
    setDraft(t);
    recent.addText(t);
    setMoreOpen('');
    const next: Screen = { q: t, list: 'results', group: [], b: '' };
    // The search preview is only the typing step: the submitted search takes its place in the history,
    // so ＜ goes back to the screen before the typing (e.g. the previous search's results), not to the half-typed text
    // The same search sent again from the box over its own results goes back to those results: no second,
    // identical step (R1, ＜ would seem to do nothing)
    if (top.list === 'preview' && !top.b)
      history.replace(next);
    else push(next);
    if (found.length) {
      // Sent with a keyboard that made the page shorter: the map waits until the keyboard has gone and the page
      // keeps one height, then frames the results once (R3; framing at each step of the keyboard closing made
      // the map start again and again). Without such a keyboard the map frames them at once.
      if (keyboard.keyboardUp()) keyboard.frameAfterKeyboard(found);
      else afterPanel(() => mapRef.current?.fitTo(found));
    }
  };

  /**
   * A tag picked in the Category page is not a search (user, 2026-11-25): exactly that category's buildings, oldest
   * first; the search box and the recent searches are left alone, ＜ goes back to the tags. Desktop: inside Category,
   * Category stays lit. Phone: Category folds away and the list rises from the bottom (2026-11-25, was a search).
   */
  const pickEra = (label: string) => {
    const items = listOf(label, 'era').main;
    if (!items.length) return;
    setMoreOpen('');
    push({ q: label, list: 'era', group: [], b: '' });
    afterPanel(() => mapRef.current?.fitTo(items));
  };


  /** The card waiting for its map view (noted when the map stops after opening it) */
  const cardHome = useRef('');
  const noteHome = (id: string) => {
    if (cardHome.current !== id) return;
    cardHome.current = '';
    const v = mapRef.current?.view();
    if (!v) return;
    history.update((last) => (last.b === id && !last.home ? { ...last, home: v } : last));
  };

  /** Open a building's card: the map brings it to the middle of its free part, from a list row as from a marker (zoom kept) */
  const openCard = (id: string, centre = true) => {
    const b = BY_ID.get(id);
    if (!b) return;
    inputRef.current?.blur();
    recent.addBuilding(id);
    openPanel();
    push({ ...top, b: id });
    afterPanel(() => {
      cardHome.current = id;
      mapRef.current?.focus(b, centre);
      // the map may not need to move at all: then the view right now is the card's view
      window.setTimeout(() => noteHome(id), CARD_SETTLE);
    });
  };

  const openGroup = (ids: string[]) => {
    const items = ids.map((id) => BY_ID.get(id)).filter((b): b is Building => !!b);
    if (!items.length) return;
    openPanel();
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
        // desktop: the search box lives in the content panel, which opens on the search page first
        if (!mobile && (!panelOpen || railPage !== 'search')) {
          railSearch();
          afterPanel(() => inputRef.current?.focus());
        } else inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });


  // A shared link or reload with a search but no saved view: frame the results once the map is there.
  // The map loads after the page, so a search sent before then is framed when it arrives.
  const mapReady = () => {
    const s = stackRef.current[stackRef.current.length - 1]!;
    const items = s.list === 'group' ? s.group.map((id) => BY_ID.get(id)).filter((b): b is Building => !!b) : s.q ? listOf(s.q, s.list).main : [];
    const card = s.b ? BY_ID.get(s.b) : undefined;
    if (card && (!START.view || stackRef.current !== startedWith)) afterPanel(() => mapRef.current?.focus(card, false));
    else if (items.length && (!START.view || stackRef.current !== startedWith)) afterPanel(() => mapRef.current?.fitTo(items));
  };

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
  const clearBox = () => {
    if (!draft) return closeAll();
    unsent.current = null;
    setDraft('');
    // × drops the submitted search the box was opened over (user, 2026-11-23): the typing screen no longer carries
    // it, so a card opened next, or the box opened again, does not bring it back; the map shows every building
    if (top.q) history.update((t) => ({ ...t, q: '' }));
    inputRef.current?.focus();
  };

  // The map gets callbacks that never change, each calling this render's own function (R8): typing in the search
  // box then does not redraw every marker, and a click still acts on the newest screen and typed text
  const live = useRef({ openCard, openGroup, mapReady, onView: (v: View) => void v });
  live.current = {
    openCard,
    openGroup,
    mapReady,
    onView: (v: View) => {
      viewRef.current = v;
      writeAddress(top);
      if (cardHome.current) noteHome(cardHome.current);
      // the map stopped after a group line's click: that is the group's framed view
      if (frameClick.current && !frameClick.current.view) frameClick.current.view = v;
      // lines that frame groups on the map are clickable or not by what the map now shows
      setViewTick((n) => n + 1);
    },
  };
  const mapSelect = useCallback((id: string) => live.current.openCard(id, true), []);
  const mapGroup = useCallback((ids: string[]) => live.current.openGroup(ids), []);
  const mapView = useCallback((v: View) => live.current.onView(v), []);
  const mapFail = useCallback(() => setMapDown(true), []);
  const mapReadyStable = useCallback(() => live.current.mapReady(), []);
  // Desktop content panel: which page it shows, for the rail's lit button
  const menuPage = isEmptyScreen(top) && !searchPage;
  const railPage: RailPage = top.b || top.list === 'group' || menuPage ? 'other' : top.list === 'category' || top.list === 'era' ? 'category' : 'search';
  /** Rail search: the panel opens on the search page (the submitted search's results, else the empty search page) */
  const railSearch = () => {
    openPanel();
    setSearchPage(true);
    if (railPage === 'search') return;
    // with no search, the typing screen itself goes on top (no extra empty step that ＜ would stop at, 2026-11-25)
    // a picked Category tag is not a search: the search page opens empty over it
    const q = top.list === 'era' ? '' : top.q;
    // text typed and not sent comes back in the box, with the typing screen (user, 2026-11-25)
    const typing = unsent.current !== null && unsent.current !== q;
    if (!menuPage) {
      if (typing) setDraft(unsent.current!);
      else if (!q) setDraft('');
      push({ q, list: q && !typing ? 'results' : 'preview', group: [], b: '' });
    }
    // no search on screen: the box takes the cursor, so the recent searches show at once and typing can start
    if (!q || typing) afterPanel(() => inputRef.current?.focus());
  };
  const railCategory = () => {
    openPanel();
    if (railPage === 'category') return;
    push({ q: top.q, list: 'category', group: [], b: '' });
  };
  /** Desktop search page: ＜ as on the results list; while typing, back to the screen the page was opened over */
  // the typing page gets ＜ whenever it was opened over another screen than the plain map (card, list, Category;
  // user, 2026-11-25), not only over a submitted search as the phone box does
  const searchBack = editing ? back && !!prevScreen && !isEmptyScreen(prevScreen) : back;
  /** Desktop search page ×: while typing it clears the text (as the box × did); otherwise it closes everything */
  const searchClose = () => {
    if (editing) return clearBox();
    // a submitted search (user, 2026-11-24): the × sits in the box, so it clears the search and opens the box for a
    // new one (the map shows every building); a second × closes everything
    if (top.q) {
      unsent.current = null;
      setDraft('');
      setMoreOpen('');
      history.update(() => ({ q: '', list: 'preview', group: [], b: '' }));
      // after the typing screen is on: focusing sooner would reopen the box over the old search
      requestAnimationFrame(() => inputRef.current?.focus());
      return;
    }
    closeAll();
  };
  const searchBox = (docked: boolean) => (
    <SearchBox
      ref={inputRef}
      docked={docked}
      value={boxText}
      showClear={docked || showClear}
      categoryOpen={top.list === 'category' && !top.b}
      onBack={(docked ? searchBack : boxBack) ? () => (inputRef.current?.blur(), goBack()) : undefined}
      onFocus={openPreview}
      onChange={(t) => {
        if (!editing) openPreview();
        unsent.current = t;
        setDraft(t);
      }}
      onSubmit={() => submit(draft)}
      onClear={docked ? searchClose : clearBox}
      onCategory={toggleCategory}
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
          <ResultList list={preview.slice(0, PREVIEW_MAX)} onOpen={openCard} onHover={setHoverId} />
        ) : (
          <NoResults />
        )
      ) : (
        <>
          {recent.texts.length > 0 && (
            <ul className="rows recent">
              {recent.texts.map((t) => (
                <li key={t} className="has-x">
                  <button type="button" className="row text" onClick={() => submit(t)}>
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
              <ResultList list={recentList} onOpen={openCard} onHover={setHoverId} onRemove={recent.removeBuilding} />
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
      onOpen={openCard}
      onHover={setHoverId}
      onVisible={setSeenIds}
      onCountry={(items) => {
        // the view this click leads to is noted when the map stops: while the map stays there, the line is off
        frameClick.current = { ids: idsOf(items), view: null };
        mapRef.current?.fitTo(items);
      }}
      framed={(items) => {
        const f = frameClick.current;
        const v = viewRef.current;
        if (f && f.view && v && f.ids === idsOf(items) && sameView(f.view, v)) return true;
        return mapRef.current?.framed(items) ?? false;
      }}
      more={{
        list: moreList,
        open: moreOpen === top.q,
        onOpen: () => {
          // the map as it was before, so folding the other outcomes away can bring it back
          moreView.current = mapRef.current?.view() ?? null;
          setMoreOpen(top.q);
          afterPanel(() => mapRef.current?.fitTo([...found.main, ...found.more]));
        },
        onClose: () => {
          setMoreOpen('');
          const v = moreView.current;
          moreView.current = null;
          if (v) afterPanel(() => mapRef.current?.moveTo(v));
        },
      }}
    />
  );

  let panel: React.ReactNode = null;
  if (selected) {
    panel = <BuildingCard ref={panelRef} key="card" scroll={top.scroll} b={selected} mobile={mobile} canBack={back} onBack={goBack} onClose={closeAll} onArchitect={submit} />;
  } else if (top.list === 'preview' && hasPreview) {
    panel = (
      <Panel ref={panelRef} scroll={top.scroll} key="preview" mobile={mobile} place="top" label="Search" className="preview" resetKey="preview" head={null}>
        {previewBody}
      </Panel>
    );
  } else if (top.list === 'category') {
    // opened from the plain map, ＜ would only close it, like ×: only × shows
    panel = (
      <Panel ref={panelRef} scroll={top.scroll} key="category" mobile={mobile} place="top" label="Category" className="category" resetKey="category" head={<HeadBar canBack={back && !(prevScreen && isEmptyScreen(prevScreen))} onBack={goBack} onClose={closeAll} title="Category" />}>
        <CategoryList onPick={pickEra} />
      </Panel>
    );
  } else if (top.list === 'group' && group.length) {
    panel = (
      <Panel ref={panelRef} scroll={top.scroll} key={`group-${top.group.join('~')}`} mobile={mobile} place="sheet" label="Architectures" className="group" resetKey={top.group.join('~')} head={<HeadBar canBack={back} onBack={goBack} onClose={closeAll} title={`${group.length} Architectures`} />}>
        <ResultList list={group} onOpen={openCard} onHover={setHoverId} onVisible={setSeenIds} />
      </Panel>
    );
  } else if (top.list === 'era' && top.q) {
    // a picked Category tag: its name is the title, ＜ goes back to the tags
    panel = (
      <Panel ref={panelRef} scroll={top.scroll} key="era" mobile={mobile} place="sheet" label={top.q} className="results" resetKey={`era:${top.q}`} head={<HeadBar canBack={back && !(prevScreen && isEmptyScreen(prevScreen))} onBack={goBack} onClose={closeAll} title={top.q} />}>
        {resultsBody}
      </Panel>
    );
  } else if (top.list === 'results' && top.q) {
    panel = (
      <Panel ref={panelRef} scroll={top.scroll} key="results" mobile={mobile} place="sheet" label="Results" className="results" resetKey={top.q} head={<HeadBar canBack={back} onBack={goBack} onClose={closeAll} />}>
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
        {mobile ? searchBox(false) : <Rail open={panelOpen} page={railPage} onFold={foldPanel} canFold={panelOpen ? !!panel : !isEmptyScreen(top)} onToggle={() => (panelOpen ? foldPanel() : openPanel())} onSearch={railSearch} onCategory={railCategory} />}
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
              {!panel && <ResultList list={top.q ? results : BUILDINGS} onOpen={openCard} onHover={setHoverId} />}
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

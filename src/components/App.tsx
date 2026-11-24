'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { setAddress } from '../lib/address';
import { BUILDINGS, BY_ID, ERA_ORDER, byYear, type Building } from '../lib/model';
import { EMPTY_SCREEN, canGoBack, fromQuery, isEmptyScreen, loadDraft, loadFolded, sameScreen, saveDraft, saveFolded, saveStack, startStack, toQuery, type Screen, type View } from '../lib/nav';
import { addRecentBuilding, addRecentText, recentBuildings, recentTexts, removeRecentBuilding, removeRecentText } from '../lib/recent';
import RemoveButton from './RemoveButton';
import { searchSplit } from '../lib/search';
import BuildingCard from './BuildingCard';
import CategoryList from './CategoryList';
import { HeadBar } from './HeadBar';
import { Icon } from './Icons';
import Leave from './Leave';
import MapView, { type MapHandle, type Padding } from './MapView';
import Panel from './Panel';
import Rail, { type RailPage } from './Rail';
import RailMenu from './RailMenu';
import ResultList from './ResultList';
import SearchBox from './SearchBox';
import { RAIL_W } from '../styles/tokens';

const MOBILE_QUERY = '(max-width: 900px)';
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
/** A phone keyboard closes within this time after a search is sent (ms): the map frames the results by then */
const KEYBOARD_WAIT = 1500;
/** The page height has stayed put this long (ms): the keyboard has finished moving */
const KEYBOARD_SETTLE = 150;
/** The page is at least this much shorter than its full height (px): a keyboard is up */
const KEYBOARD_MIN = 80;
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
  const stackRef = useRef(stack);
  stackRef.current = stack;
  /** The stack the page opened with (the map frames a later screen when it arrives) */
  const [startedWith] = useState(stack);
  const top = stack[stack.length - 1]!;
  // Text in the search box while the preview is open (typed, not yet submitted)
  // a reload while typing keeps the text typed so far (Q4)
  const [draft, setDraft] = useState(() => (top.list === 'preview' ? (loadDraft() ?? top.q) : top.q));
  useEffect(() => saveDraft(top.list === 'preview' ? draft : null), [draft, top.list]);
  const [hoverId, setHoverId] = useState('');
  const [, setViewTick] = useState(0);
  /** The last group line clicked (country, other outcomes) and the map view its framing came to rest at */
  const frameClick = useRef<{ ids: string; view: View | null } | null>(null);
  // Buildings of the list rows on screen; the map names them and dims the rest
  const [seenIds, setSeenIds] = useState<string[]>([]);
  /** Desktop: the rows on screen when the panel was folded; the map keeps dimming the rest while it is folded */
  const [foldSeen, setFoldSeen] = useState<string[]>([]);
  const [recentT, setRecentT] = useState<string[]>(() => recentTexts());
  const [recentB, setRecentB] = useState<string[]>(() => recentBuildings());
  const [mapDown, setMapDown] = useState(false);
  const [padding, setPadding] = useState<Padding>(NO_PAD);
  const mapRef = useRef<MapHandle>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const appRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const viewRef = useRef<View | null>(START.view);
  /**
   * Desktop: the content panel beside the rail is open. A fresh visit opens with it closed; a reload or a shared
   * link that names a screen opens it on that screen. Closing it keeps the screen (and the map), so opening it
   * again shows the screen that was left. The phone layout does not use it (its panels are always shown).
   */
  const [panelOpen, setPanelOpen] = useState(() => !isEmptyScreen(START.screen) && !loadFolded());
  // a panel folded with Menu stays folded over a reload in this tab (user, 2026-11-23); × or opening it ends that
  useEffect(() => saveFolded(!panelOpen && !isEmptyScreen(top)), [panelOpen, top]);
  /**
   * The panel has just been opened from the rail or the map: it slides out from behind the rail. Set to true on
   * opening; the page shown then keeps the slide-in class until another page opens (removing the class sooner
   * would restart the panel's own entry animation), so the panel is never mounted again for it.
   */
  const [slideKey, setSlideKey] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  /**
   * Desktop: with nothing open, the panel shows the menu page; the search page once Search was chosen (rail or
   * menu). Closing the panel keeps this, so it opens again on the page that was left; × starts over at the menu.
   */
  const [searchPage, setSearchPage] = useState(false);
  /** Desktop: hide the panel only (not ×): the screen, the search and the map stay as they are */
  const foldPanel = () => {
    setFoldSeen(seenIds);
    setPanelOpen(false);
  };
  const openPanel = () => {
    if (panelOpen) return;
    setPanelOpen(true);
    setOpening(true);
  };

  // A search's main matches first; its other matches join below (list and map) after Other Possible Outcomes (Polish 13)
  const found = useMemo(() => (top.q ? searchSplit(top.q) : { main: [], more: [] }), [top.q]);
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

  // A row that goes away with its screen gets no pointer-leave: a new screen (card, list, ×, ＜) ends the ring
  // that row put on the map, so it never stays on a building nothing is pointing at
  useEffect(() => setHoverId(''), [top]);

  // The address and the history follow the screen, so a reload or a shared link opens the same screen
  const writeAddress = useCallback((s: Screen) => {
    setAddress(window.location.pathname + toQuery(s, viewRef.current) + window.location.hash);
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
    const scroll = panelRef.current?.querySelector('.p-body')?.scrollTop ?? undefined;
    setStack((st) => {
      const cur = st[st.length - 1]!;
      // the screen already on top (the open card or number point clicked again, a double click): no new step
      if (sameScreen(cur, s)) return st;
      return [...st.slice(0, -1), { ...cur, view, scroll, ...(cur.list === 'preview' ? { draft } : {}) }, s];
    });
  };

  /** ＜: the previous screen comes back with its lists, its search and the map as it was then */
  const goBack = () => {
    if (stack.length < 2) return;
    const prev = stack[stack.length - 2]!;
    setStack((st) => st.slice(0, -1));
    setDraft(prev.draft ?? prev.q);
    // A results list or a number point list comes back with all its buildings framed (as when it opened);
    // a card comes back with its building in sight, as it was when the card opened (the map may have been
    // moved away from it before the next card was opened); other screens come back with the map as it was left
    if (!prev.b && (prev.list === 'results' || prev.list === 'group')) {
      let items: Building[];
      if (prev.list === 'group') items = prev.group.map((id) => BY_ID.get(id)).filter((b): b is Building => !!b);
      else {
        const f = searchSplit(prev.q);
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
    } else if (prev.q && prev.q !== top.q) afterPanel(() => mapRef.current?.fitTo(searchSplit(prev.q).main));
  };

  /** × and Esc: everything closes, the text and results go; the map stays where it is */
  const closeAll = () => {
    // the map stops where it is, also in the middle of a move (Q6), and no framing waits to run after it
    mapRef.current?.stop();
    refit.current = null;
    window.clearTimeout(refitTimer.current);
    setMoreOpen('');
    setStack([EMPTY_SCREEN]);
    setDraft('');
    inputRef.current?.blur();
    // desktop: nothing is open after ×, so the content panel closes too (the menu shows when it opens again)
    setPanelOpen(false);
    setSearchPage(false);
  };

  const openPreview = () => {
    if (top.list === 'preview' && !top.b) return;
    setDraft(top.q);
    push({ q: top.q, list: 'preview', group: [], b: '' });
  };

  const submit = (text: string) => {
    const t = text.trim();
    if (!t) return;
    const split = searchSplit(t);
    // no match at all: nothing is submitted, the preview says No Results
    if (!split.main.length && !split.more.length) return;
    const found = split.main;
    inputRef.current?.blur();
    setDraft(t);
    setRecentT(addRecentText(t));
    setMoreOpen('');
    const next: Screen = { q: t, list: 'results', group: [], b: '' };
    // The search preview is only the typing step: the submitted search takes its place in the history,
    // so ＜ goes back to the screen before the typing (e.g. the previous search's results), not to the half-typed text
    // The same search sent again from the box over its own results goes back to those results: no second,
    // identical step (R1, ＜ would seem to do nothing)
    if (top.list === 'preview' && !top.b)
      setStack((st) => (st.length > 1 && sameScreen(st[st.length - 2]!, next) ? st.slice(0, -1) : [...st.slice(0, -1), next]));
    else push(next);
    if (found.length) {
      // Sent with a keyboard that made the page shorter: the map waits until the keyboard has gone and the page
      // keeps one height, then frames the results once (R3; framing at each step of the keyboard closing made
      // the map start again and again). Without such a keyboard the map frames them at once.
      if (window.innerHeight < fullHeight.current - KEYBOARD_MIN) {
        refit.current = { items: found, until: performance.now() + KEYBOARD_WAIT };
        refitLater(KEYBOARD_WAIT);
      } else afterPanel(() => mapRef.current?.fitTo(found));
    }
  };

  /** Results waiting to be framed until a closing keyboard has gone */
  const refit = useRef<{ items: Building[]; until: number } | null>(null);
  const refitTimer = useRef(0);
  /** Frame the waiting results after `ms` with no change of the page's height */
  const refitLater = (ms: number) => {
    window.clearTimeout(refitTimer.current);
    refitTimer.current = window.setTimeout(() => {
      const r = refit.current;
      refit.current = null;
      if (r) mapRef.current?.fitTo(r.items);
    }, ms);
  };
  /** The page's height with no keyboard (taken while the search box is not being typed in) */
  const fullHeight = useRef(typeof window !== 'undefined' ? window.innerHeight : 0);
  useEffect(() => {
    const onResize = () => {
      if (document.activeElement !== inputRef.current) fullHeight.current = Math.max(window.innerHeight, refit.current ? fullHeight.current : 0);
      const r = refit.current;
      if (!r) return;
      // the keyboard is still moving: wait for the height to stay put (or for the longest wait to end)
      refitLater(Math.max(0, Math.min(KEYBOARD_SETTLE, r.until - performance.now())));
    };
    // a finger or mouse on the page ends the wait: the map is the person's now
    const stop = () => {
      refit.current = null;
      window.clearTimeout(refitTimer.current);
    };
    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    window.addEventListener('pointerdown', stop, true);
    return () => {
      window.clearTimeout(refitTimer.current);
      window.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
      window.removeEventListener('pointerdown', stop, true);
    };
  }, []);

  /** The card waiting for its map view (noted when the map stops after opening it) */
  const cardHome = useRef('');
  const noteHome = (id: string) => {
    if (cardHome.current !== id) return;
    cardHome.current = '';
    const v = mapRef.current?.view();
    if (!v) return;
    setStack((st) => {
      const last = st[st.length - 1]!;
      return last.b === id && !last.home ? [...st.slice(0, -1), { ...last, home: v }] : st;
    });
  };

  /** Open a building's card: the map brings it to the middle of its free part, from a list row as from a marker (zoom kept) */
  const openCard = (id: string, centre = true) => {
    const b = BY_ID.get(id);
    if (!b) return;
    inputRef.current?.blur();
    setRecentB(addRecentBuilding(id));
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

  // A finger rings the last list row it touched (that row keeps its light blue); touching anything else ends it
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' && !(e.target as Element | null)?.closest?.('.row')) setHoverId('');
    };
    window.addEventListener('pointerdown', onDown, true);
    return () => window.removeEventListener('pointerdown', onDown, true);
  }, []);

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
      // and the rail along the left edge
      const next = { ...NO_PAD, top: bar ? bar.bottom - app.top : 0, right: mobile ? 0 : ZOOM_W, left: mobile ? 0 : RAIL_W };
      if (p && p.width && p.height) {
        if (!mobile) next.left = p.left + p.width;
        else if (p.top > app.height / 3) next.bottom = app.height - p.top;
        else next.top = Math.max(next.top, p.top + p.height);
      }
      setPadding((o) => (o.top === next.top && o.left === next.left && o.bottom === next.bottom && o.right === next.right ? o : next));
    };
    measure();
    // measured in the next frame: a size set inside the observer's own callback loops it (B8, WebKit)
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    });
    if (panelRef.current) ro.observe(panelRef.current);
    if (appRef.current) ro.observe(appRef.current);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  });

  // A shared link or reload with a search but no saved view: frame the results once the map is there.
  // The map loads after the page, so a search sent before then is framed when it arrives.
  const mapReady = () => {
    const s = stackRef.current[stackRef.current.length - 1]!;
    const items = s.list === 'group' ? s.group.map((id) => BY_ID.get(id)).filter((b): b is Building => !!b) : s.q ? searchSplit(s.q).main : [];
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
  const boxText = top.list === 'preview' ? draft : top.q;
  // × in the search box only while typing (the search preview is open): it clears the text, or closes the
  // empty preview. Every other screen closes with the × in its own top row
  const showClear = editing;
  const clearBox = () => {
    if (!draft) return closeAll();
    setDraft('');
    // × drops the submitted search the box was opened over (user, 2026-11-23): the typing screen no longer carries
    // it, so a card opened next, or the box opened again, does not bring it back; the map shows every building
    if (top.q) setStack((st) => [...st.slice(0, -1), { ...st[st.length - 1]!, q: '' }]);
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
  const railPage: RailPage = top.b || top.list === 'group' || menuPage ? 'other' : top.list === 'category' ? 'category' : 'search';
  /** Rail search: the panel opens on the search page (the submitted search's results, else the empty search page) */
  const railSearch = () => {
    openPanel();
    setSearchPage(true);
    if (railPage === 'search') return;
    if (!menuPage) push({ q: top.q, list: top.q ? 'results' : '', group: [], b: '' });
    // no search on screen: the box takes the cursor, so the recent searches show at once and typing can start
    if (!top.q) afterPanel(() => inputRef.current?.focus());
  };
  const railCategory = () => {
    openPanel();
    if (railPage === 'category') return;
    push({ q: top.q, list: 'category', group: [], b: '' });
  };
  /** Desktop search page: ＜ as on the results list, or (box opened again over a submitted search) as in the box */
  const searchBack = editing ? boxBack : back;
  /** Desktop search page ×: while typing it clears the text (as the box × did); otherwise it closes everything */
  const searchClose = () => {
    if (editing) return clearBox();
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
        setDraft(t);
      }}
      onSubmit={() => submit(draft)}
      onClear={docked ? searchClose : clearBox}
      onCategory={toggleCategory}
    />
  );

  // The panel on screen: the card over everything, else the open list (one at a time)
  const recentList = recentB.map((id) => BY_ID.get(id)).filter((b): b is Building => !!b);
  const hasPreview = !!draft.trim() || recentT.length > 0 || recentList.length > 0;
  // The search preview (typing matches, or the recent texts and buildings)
  const previewBody = (
    <>
      {draft.trim() ? (
        preview.length ? (
          <ResultList list={preview.slice(0, PREVIEW_MAX)} onOpen={openCard} onHover={setHoverId} />
        ) : (
          <p className="none">No Results</p>
        )
      ) : (
        <>
          {recentT.length > 0 && (
            <ul className="rows recent">
              {recentT.map((t) => (
                <li key={t} className="has-x">
                  <button type="button" className="row text" onClick={() => submit(t)}>
                    <Icon name="clock" size={14} />
                    <span>{t}</span>
                  </button>
                  <RemoveButton label={t} onRemove={() => setRecentT(removeRecentText(t))} />
                </li>
              ))}
            </ul>
          )}
          {recentList.length > 0 && (
            // recent buildings: name with built span · city, then architect · style (see .recent-b)
            <div className="recent-b">
              <ResultList list={recentList} onOpen={openCard} onHover={setHoverId} onRemove={(id) => setRecentB(removeRecentBuilding(id))} />
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
        <CategoryList onPick={submit} />
      </Panel>
    );
  } else if (top.list === 'group' && group.length) {
    panel = (
      <Panel ref={panelRef} scroll={top.scroll} key={`group-${top.group.join('~')}`} mobile={mobile} place="sheet" label="Architectures" className="group" resetKey={top.group.join('~')} head={<HeadBar canBack={back} onBack={goBack} onClose={closeAll} title={`${group.length} Architectures`} />}>
        <ResultList list={group} onOpen={openCard} onHover={setHoverId} onVisible={setSeenIds} />
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
  const dockKey = menuPage && !selected ? 'menu' : selected ? 'card' : top.list === 'category' ? 'category' : top.list === 'group' && group.length ? `group-${top.group.join('~')}` : 'search';
  // the page the panel opened on slides in; once another page opens, nothing slides until the next opening
  useLayoutEffect(() => {
    if (opening) {
      setOpening(false);
      setSlideKey(dockKey);
    } else if (slideKey !== null && slideKey !== dockKey) setSlideKey(null);
  }, [opening, dockKey, slideKey]);
  // Desktop: every page sits in one content panel beside the rail. Closed: nothing shows (the screen is kept).
  // The search page keeps one panel from the empty page to typing to results, so the box never loses its focus
  if (!mobile) {
    if (!panelOpen) panel = null;
    else if (menuPage && !selected) {
      panel = (
        <Panel ref={panelRef} key="menu" mobile={false} place="top" label="Menu" className="menu" resetKey="menu" head={<HeadBar canBack={false} onBack={goBack} onClose={closeAll} />}>
          <RailMenu onSearch={railSearch} onCategory={railCategory} />
        </Panel>
      );
    } else if (!selected && top.list !== 'category' && !(top.list === 'group' && group.length)) {
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
    if (panel) panel = <div className={`dock${opening || slideKey === dockKey ? ' slide-in' : ''}`}>{panel}</div>;
  }


  return (
    <div className={`app${mobile ? ' is-mobile' : ''}`} ref={appRef}>
      <main className="main">
        {/* phone: the search box and Category stay top left; desktop: the rail, and the box in the content panel */}
        {mobile ? searchBox(false) : <Rail open={panelOpen} page={railPage} onMenu={() => (panelOpen ? foldPanel() : openPanel())} onFold={foldPanel} onSearch={railSearch} onCategory={railCategory} />}
        <Leave show={!!panel} slide={!mobile && !panelOpen}>{panel}</Leave>
        {/* last in the page order (Tab: search box, then the open panel, then the map); drawn under both */}
        <MapView
          ref={mapRef}
          buildings={top.q ? results : BUILDINGS}
          searched={!!top.q}
          selected={selected}
          hoverId={hoverId}
          seenIds={!selected && (top.list === 'results' || top.list === 'group') ? (mobile || panelOpen ? seenIds : foldSeen) : null}
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
        {top.list === 'results' && top.q && !top.b ? (found.main.length ? `${found.main.length} ${found.main.length === 1 ? 'result' : 'results'}` : 'No Results') : ''}
      </p>
    </div>
  );
}

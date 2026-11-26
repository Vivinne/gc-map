/*
 * Flows (W): actions that use several modules. Each flow is a function of the session (Ctx), built by the shell on
 * every render, so a flow always acts on the newest screen and text. Flows may call other flows; modules never
 * call flows (they report to the shell, which calls the flow).
 */
import type { MutableRefObject, RefObject } from 'react';
import type { Building } from '../data';
import type { Screen, View, useHistory } from '../core/history';
import type { useRecent, useSearchText } from '../features/search';
import type { MapHandle, useKeyboardFraming } from '../features/map';
import type { RailPage } from '../features/rail';
import type { useDesktopPanel } from '../layout';
import type { Found } from '../features/search';

/** Wait for a panel to take its size before the map frames what it shows */
export const PANEL_WAIT = 60;
/** Longest camera move (1600 ms) and a little: a card that did not move the map notes its view by then */
export const CARD_SETTLE = 1800;

export interface Ctx {
  top: Screen;
  stack: Screen[];
  stackRef: MutableRefObject<Screen[]>;
  history: ReturnType<typeof useHistory>;
  text: ReturnType<typeof useSearchText>;
  recent: ReturnType<typeof useRecent>;
  dock: ReturnType<typeof useDesktopPanel>;
  /** Desktop: the panel shows the search page (not the menu) while nothing else is open */
  searchPage: boolean;
  setSearchPage(on: boolean): void;
  /** Desktop: the panel would show the menu page (nothing open, Search not chosen) */
  menuPage: boolean;
  /** Desktop: the page the panel shows, for the rail's lit button */
  railPage: RailPage;
  mobile: boolean;
  map: RefObject<MapHandle | null>;
  panel: RefObject<HTMLElement | null>;
  input: RefObject<HTMLInputElement | null>;
  keyboard: ReturnType<typeof useKeyboardFraming>;
  /** The sent search whose Other Possible Outcomes are open ('' = none), and the map view before they opened */
  more: { open: string; set(q: string): void; view: MutableRefObject<View | null> };
  /** Matches of the search on screen */
  found: Found;
  /** Desktop: keep the rows on screen dimming the map while the panel is folded */
  keepSeen(): void;
  /** The card waiting for its map view (noted when the map stops after opening it) */
  cardHome: MutableRefObject<string>;
  /** The last group line clicked (country, other outcomes) and the map view its framing came to rest at */
  frameClick: MutableRefObject<{ ids: string; view: View | null } | null>;
  /** The map view now */
  view: MutableRefObject<View | null>;
  writeAddress(s: Screen): void;
  /** Group lines are clickable or not by what the map now shows: draw them again */
  redrawLines(): void;
  /** What the page address named at the start, and the history the page opened with */
  start: { view: View | null; stack: Screen[] };
}

/** Run after the panels have their new size */
export const afterPanel = (f: () => void) => window.setTimeout(f, PANEL_WAIT);

/** Buildings of these ids (unknown ids left out) */
export const byIds = (ids: string[], get: (id: string) => Building | undefined) => ids.map(get).filter((b): b is Building => !!b);

/** Open a new screen; the screen it leaves keeps the map view, its scroll and its typed text, so ＜ can bring them back */
export function openScreen(c: Ctx, s: Screen): void {
  const view = c.map.current?.view() ?? undefined;
  const scroll = c.panel.current?.querySelector('.p-body')?.scrollTop ?? undefined;
  const draft = c.text.draft;
  // the screen already on top (the open card or number point clicked again, a double click): no new step
  c.history.push(s, (cur) => ({ view, scroll, ...(cur.list === 'preview' ? { draft } : {}) }));
}

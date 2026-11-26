/* C1 history: what one screen is, and when ＜ shows (SPEC R1, R2). */

/** Which list is open (a building card, when open, sits over it and the list is folded away) */
/** 'era': the buildings of one Category tag picked in the Category page (q holds the tag) */
export type ListKind = '' | 'preview' | 'category' | 'results' | 'group' | 'era';

/** One screen state: what the history behind ＜ holds, and what the address names */
export interface Screen {
  /** Submitted search text ('' = none) */
  q: string;
  list: ListKind;
  /** Number point list: the buildings of the point */
  group: string[];
  /** Open building card ('' = none) */
  b: string;
  /** Map view when the next screen opened: ＜ brings the map back to it */
  view?: View;
  /** Card: the map view once the card had brought its building into sight; ＜ back to the card returns here */
  home?: View;
  /** Search preview: the text typed (not submitted) when the next screen opened; ＜ puts it back */
  draft?: string;
  /** How far its list or card was scrolled when the next screen opened; ＜ scrolls back there */
  scroll?: number;
}

export const EMPTY_SCREEN: Screen = { q: '', list: '', group: [], b: '' };

export const isEmptyScreen = (s: Screen): boolean => !s.q && !s.list && !s.b;

/** Map view: centre and zoom */
export interface View {
  lng: number;
  lat: number;
  zoom: number;
}

export const sameScreen = (a: Screen, b: Screen): boolean => a.q === b.q && a.list === b.list && a.b === b.b && a.group.join('~') === b.group.join('~');


/**
 * Whether ＜ shows: there is an earlier screen. A card opened straight from the plain map has nothing
 * to go back to but the plain map, so it shows only ×.
 */
export function canGoBack(stack: Screen[]): boolean {
  if (stack.length < 2) return false;
  const top = stack[stack.length - 1]!;
  const prev = stack[stack.length - 2]!;
  return !(top.b && isEmptyScreen(prev));
}

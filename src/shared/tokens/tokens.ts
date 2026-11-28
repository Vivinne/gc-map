
/**
 * Design tokens read from TypeScript: the colour of each style, the basemap colours and the spacing.
 * Kept from GC Atlas v1 (see KEEP.md). The page greys, motion, corners and sizes are in tokens.css.
 */
/** Colour of each style category ("Earth to sky": warm for the oldest styles, cool for the newest) */
export const ERA_COLORS = {
  ancient: '#D27F6B',
  medieval: '#C2894F',
  renaissance: '#A6943C',
  mannerism: '#799C51',
  baroque: '#4B9C75',
  neoclassicism: '#1B9794',
  artnouveau: '#278CAB',
  modern: '#507CB5',
  beauxarts: '#6B8BA2',
  others: '#80878F',
} as const satisfies Record<string, string>;

/** Paper white (tokens.css --paper): panels, the open building's disc, the rims of number points */
export const PAPER = '#fff';

/** Motion times in ms, the same as --t-fast, --t-mid, --t-slow, --leave and --t-slide in tokens.css (a test keeps them equal) */
export const MOTION = { fast: 120, mid: 220, slow: 420, leave: 160, slide: 200 } as const;

/** Basemap colours */
export const MAP_COLORS = {
  sea: '#ECF1F8',
  land: '#D5DBE1',
  road: '#F1F7FD',
  building: '#CBD1D7',
  border: '#FFFFFF',
} as const;

/** Spacing on the map: every floating part keeps this distance from the map and window edges */
export const INSET = 16;
/** Bottom line of the zoom buttons and the scale bar (desktop): clear of the map's source line under them (B6) */
export const MAP_BOTTOM = 24;
/** A phone page shorter than this (px, a keyboard up in landscape) has no room for the map's source line under the search box (R6) */
export const CREDIT_MIN_H = 120;
/** Desktop: width of the fixed rail on the left edge (tokens.css --rail-w) */
export const RAIL_W = 56;
/** Size of a zoom button (desktop, bottom right) */
export const ZOOM_BTN = 32;
/** Height of a control (buttons, search box) */
export const CONTROL_H = 32;
/** Height of a list row */
export const ROW_H = 40;

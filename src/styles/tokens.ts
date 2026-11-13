import type { EraId } from '../lib/types';

/**
 * Design tokens read from TypeScript: the colour of each style, the basemap colours and the spacing.
 * Kept from GC Atlas v1 (see KEEP.md). The page greys, motion, corners and sizes are in tokens.css.
 */
/** Colour of each style category ("Earth to sky": warm for the oldest styles, cool for the newest) */
export const ERA_COLORS: Record<EraId, string> = {
  ancient: '#D58774',
  medieval: '#C38C53',
  renaissance: '#A6943C',
  mannerism: '#799C51',
  baroque: '#4B9C75',
  neoclassicism: '#1B9794',
  artnouveau: '#278CAB',
  modern: '#507CB5',
  beauxarts: '#6B8BA2',
  others: '#80878F',
};

/** Basemap colours */
export const MAP_COLORS = {
  sea: '#ECF1F8',
  land: '#D5DBE1',
  road: '#F1F7FD',
  building: '#CBD1D7',
} as const;

/** Spacing on the map: every floating part keeps this distance from the map and window edges */
export const INSET = 16;
/** Height of a control (buttons, search box) */
export const CONTROL_H = 32;
/** Height of a list row */
export const ROW_H = 40;

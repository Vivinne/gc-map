import type { EraId } from '../lib/types';

/**
 * Design tokens read from TypeScript: the colour of each style and the basemap colours.
 * Kept from GC Atlas v1 (see KEEP.md). The page greys, motion, corners and sizes are in tokens.css.
 */
export type ThemeId = 'b3' | 'd2';

export interface Theme {
  id: ThemeId;
  label: string;
  note: string;
  eras: Record<EraId, string>;
  map: { sea: string; land: string; road: string; building: string };
}

export const THEMES: Record<ThemeId, Theme> = {
  b3: {
    id: 'b3',
    label: 'Earth to sky',
    note: 'Warm for the oldest styles, cool for the newest',
    eras: {
      ancient: '#D58774',
      medieval: '#C38C53',
      renaissance: '#A6943C',
      mannerism: '#799C51',
      baroque: '#4B9C75',
      neoclassicism: '#1B9794',
      artnouveau: '#278CAB',
      modern: '#507CB5',
      beauxarts: '#6B8BA2',
      others: '#80878F'
    },
    map: {
      sea: '#ECF1F8',
      land: '#D5DBE1',
      road: '#F1F7FD',
      building: '#CBD1D7'
    }
  },
  d2: {
    id: 'd2',
    label: 'Sunset',
    note: 'Orange, rose and violet to blue',
    eras: {
      ancient: '#C68956',
      medieval: '#CE826B',
      renaissance: '#CE7E85',
      mannerism: '#C87E9F',
      baroque: '#BA82B7',
      neoclassicism: '#A788CA',
      artnouveau: '#8F90D4',
      modern: '#7499D6',
      beauxarts: '#8D97B8',
      others: '#9299A1'
    },
    map: {
      sea: '#EDF1F6',
      land: '#D7DBE0',
      road: '#F2F6FB',
      building: '#CDD1D5'
    }
  }
};

/** Spacing on the map: every floating part keeps this distance from the map and window edges */
export const INSET = 16;
/** Height of a control (buttons, search box) */
export const CONTROL_H = 32;
/** Height of a list row */
export const ROW_H = 40;

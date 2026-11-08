import { ERAS } from './model';
import type { EraId } from './types';
import { load, save } from './storage';

/**
 * Colour palettes. Every style colour has the same lightness and strength, and the hue moves with time,
 * so the oldest and the newest styles sit at the two ends of one gradient. The page greys, the map,
 * right and wrong follow the same palette (see the :root blocks in globals.css).
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
      ancient: '#D4896E',
      medieval: '#BB8E4C',
      renaissance: '#94953E',
      baroque: '#599A68',
      c19: '#109399',
      modern: '#497EB3',
      beauxarts: '#6B93A3',
      others: '#868D95'
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
      ancient: '#C8875A',
      medieval: '#CF7F79',
      renaissance: '#C97E9B',
      baroque: '#B883BA',
      c19: '#9D8CD0',
      modern: '#7A97D7',
      beauxarts: '#9295B7',
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

export const THEME_ORDER: ThemeId[] = ['b3', 'd2'];
const KEY = 'theme';

export function savedTheme(): ThemeId {
  const t = load<string>(KEY, 'b3');
  return t === 'd2' ? 'd2' : 'b3';
}

/** Switches the style colours (read through ERAS by every view) and the page colours. */
export function applyTheme(id: ThemeId): void {
  const t = THEMES[id];
  for (const e of Object.keys(t.eras) as EraId[]) ERAS[e].color = t.eras[e];
  if (typeof document !== 'undefined') {
    if (id === 'b3') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = id;
  }
  save(KEY, id);
}

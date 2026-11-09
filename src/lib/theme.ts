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

/** Only Earth to sky is offered (Sunset was taken out, user 2026-11-09) */
export const THEME_ORDER: ThemeId[] = ['b3'];
const KEY = 'theme';

export function savedTheme(): ThemeId {
  // a Sunset choice kept from before goes back to Earth to sky
  load<string>(KEY, 'b3');
  return 'b3';
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

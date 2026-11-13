import { ERAS } from './model';
import type { EraId } from './types';
import { load, save } from './storage';

/**
 * Colour palettes. Every style colour has the same lightness and strength, and the hue moves with time,
 * so the oldest and the newest styles sit at the two ends of one gradient. The page greys, the map,
 * right and wrong follow the same palette (see src/styles/tokens.css).
 */
import { THEMES, type Theme, type ThemeId } from '../styles/tokens';

export { THEMES, type Theme, type ThemeId };

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

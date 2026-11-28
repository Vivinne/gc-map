/* A1 shell: which page each screen shows (SPEC R1, §4). One table, no other rules. */
import type { Screen } from '../core/history';

/** The page on screen: a panel (phone: under the search box or rising from the bottom; desktop: the content panel) */
export type Page = 'card' | 'preview' | 'category' | 'group' | 'tag' | 'results' | 'search';

/**
 * | Screen                          | Phone              | Desktop (panel open) |
 * |---------------------------------|--------------------|----------------------|
 * | card                            | card               | card                 |
 * | Category                        | category           | category             |
 * | number point list (buildings)   | group              | group                |
 * | tag list                        | tag                | tag                  |
 * | typing (something to list)      | preview            | search               |
 * | sent search                     | results            | search               |
 * | plain map                       | none               | search               |
 * Desktop with the panel folded: none. The desktop search page keeps one panel from the empty page to typing to
 * results, so the box never loses its focus.
 */
export function pageOf(s: Screen, o: { card: boolean; groupSize: number; hasPreview: boolean; mobile: boolean; panelOpen: boolean }): Page | null {
  if (!o.mobile && !o.panelOpen) return null;
  if (o.card) return 'card';
  if (s.list === 'category') return 'category';
  if (s.list === 'group' && o.groupSize) return 'group';
  if (s.list === 'era') return s.q ? 'tag' : null;
  if (!o.mobile) return 'search';
  if (s.list === 'preview') return o.hasPreview ? 'preview' : null;
  if (s.list === 'results' && s.q) return 'results';
  return null;
}

/** Desktop: a key per panel page (a new page mounts a new panel, with its own entry animation) */
export function dockKeyOf(s: Screen, o: { card: boolean; groupSize: number; nothingOpen: boolean }): string {
  if (o.nothingOpen && !o.card) return 'none';
  if (o.card) return 'card';
  if (s.list === 'category') return 'category';
  if (s.list === 'era') return `era-${s.q}`;
  if (s.list === 'group' && o.groupSize) return `group-${s.group.join('~')}`;
  return 'search';
}

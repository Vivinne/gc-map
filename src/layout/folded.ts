/* L1 layout: the desktop panel folded with the rail, kept for this tab so a reload keeps it folded (SPEC R7). */
import { sessionGet, sessionRemove, sessionSet } from '../shared/storage';

const FOLD_KEY = 'gc-map:folded';

/** Desktop: the content panel was folded with the rail's fold button; kept for this tab so a reload keeps it folded */
export function saveFolded(folded: boolean): void {
  if (folded) sessionSet(FOLD_KEY, '1');
  else sessionRemove(FOLD_KEY);
}

export const loadFolded = (): boolean => sessionGet(FOLD_KEY) === '1';

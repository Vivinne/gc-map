/* Per-tab values still owned by App (stage 3 moves them: typed text -> search, folded panel -> layout). */
import { sessionGet, sessionRemove, sessionSet } from '../shared/storage';

const DRAFT_KEY = 'gc-map:draft';

/**
 * Text typed in the search box and not sent yet, kept for this tab so a reload keeps it (Q4); never in an address.
 * An emptied box is kept as empty (R5); null: no search box open, nothing to keep.
 */
export function saveDraft(text: string | null): void {
  if (text !== null) sessionSet(DRAFT_KEY, text);
  else sessionRemove(DRAFT_KEY);
}

const FOLD_KEY = 'gc-map:folded';

/** Desktop: the content panel was folded with the rail's menu button; kept for this tab so a reload keeps it folded */
export function saveFolded(folded: boolean): void {
  if (folded) sessionSet(FOLD_KEY, '1');
  else sessionRemove(FOLD_KEY);
}

export const loadFolded = (): boolean => sessionGet(FOLD_KEY) === '1';

export const loadDraft = (): string | null => sessionGet(DRAFT_KEY);

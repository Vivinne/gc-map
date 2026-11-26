/* F1 search: text typed in the search box and not sent, kept for this tab (SPEC §5). */
import { sessionGet, sessionRemove, sessionSet } from '../../shared/storage';

const DRAFT_KEY = 'gc-map:draft';

/**
 * Text typed in the search box and not sent yet, kept for this tab so a reload keeps it (Q4); never in an address.
 * An emptied box is kept as empty (R5); null: no search box open, nothing to keep.
 */
export function saveDraft(text: string | null): void {
  if (text !== null) sessionSet(DRAFT_KEY, text);
  else sessionRemove(DRAFT_KEY);
}

export const loadDraft = (): string | null => sessionGet(DRAFT_KEY);

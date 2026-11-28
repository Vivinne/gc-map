'use client';

import { useEffect, useRef, useState } from 'react';
import { loadDraft, saveDraft } from './draft';
import { addRecentBuilding, addRecentText, recentBuildings, recentTexts, removeRecentBuilding, removeRecentText } from './recent';

/**
 * F1 search: the one owner of the text in the search box (SPEC §5).
 * - draft: the text in the box while typing (not yet sent); a reload while typing keeps it (Q4).
 * - unsent: text typed and not sent, left there when another screen (Category, a card, the map) opens from the
 *   typing screen; it comes back when the box opens again (2026-11-25). null: nothing waiting.
 * `screen`: a key of the screen on top ('preview' = the typing screen); `sent`: the sent search on screen.
 * The text is saved again whenever the screen changes.
 */
export function useSearchText(screen: string, sent: string) {
  const typing = screen === 'preview';
  const [draft, setDraft] = useState(() => (typing ? (loadDraft() ?? sent) : sent));
  const unsent = useRef<string | null>(typeof window === 'undefined' ? null : loadDraft());
  // kept over a reload: the typing screen's text, or on another screen the text typed and not sent
  useEffect(() => saveDraft(typing ? draft : unsent.current), [draft, screen]);
  // the only ways the text changes (T5-2): other modules call these and never touch the text itself
  return {
    /** The text in the box */
    draft,
    /** Text typed and not sent, waiting for the box to open again (null: none) */
    waiting: (): string | null => unsent.current,
    /** A letter typed: the box shows it, and it waits if another screen opens */
    type(t: string) {
      unsent.current = t;
      setDraft(t);
    },
    /** A search sent: the box shows it; nothing waits any more */
    send(t: string) {
      unsent.current = null;
      setDraft(t);
    },
    /** × or Esc: the box empties; nothing waits */
    clear() {
      unsent.current = null;
      setDraft('');
    },
    /** The box shows this text again (＜, the box opened again); what waits stays */
    show(t: string) {
      setDraft(t);
    },
  };
}

/** F1 search: recent searches and buildings, newest first (SPEC §5) */
export function useRecent() {
  const [texts, setTexts] = useState<string[]>(() => recentTexts());
  const [buildings, setBuildings] = useState<string[]>(() => recentBuildings());
  return {
    texts,
    buildings,
    addText: (t: string) => setTexts(addRecentText(t)),
    removeText: (t: string) => setTexts(removeRecentText(t)),
    addBuilding: (id: string) => setBuildings(addRecentBuilding(id)),
    removeBuilding: (id: string) => setBuildings(removeRecentBuilding(id)),
  };
}

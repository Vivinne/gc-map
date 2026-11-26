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
  return { draft, setDraft, unsent };
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

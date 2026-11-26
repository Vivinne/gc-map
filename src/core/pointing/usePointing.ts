'use client';

import { useEffect, useState } from 'react';

/**
 * C3 pointing: the one owner of what is pointed at and which list rows are on screen; the map rings and dims by them.
 * - hoverId: the building (or several joined by "~") a mouse points at, or a finger touched last in a list.
 * - seenIds: buildings of the list rows on screen; the map names them and dims the rest.
 * - foldSeen: desktop, the rows that were on screen when the panel was folded (the map keeps dimming by them).
 * `screen` changes with every new screen: a row that goes away with its screen gets no pointer-leave, so a new
 * screen ends the ring that row put on the map.
 */
export function usePointing(screen: unknown) {
  const [hoverId, setHoverId] = useState('');
  const [seenIds, setSeenIds] = useState<string[]>([]);
  const [foldSeen, setFoldSeen] = useState<string[]>([]);

  useEffect(() => setHoverId(''), [screen]);

  // A finger rings the last list row it touched (that row keeps its light blue); touching anything else ends it
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' && !(e.target as Element | null)?.closest?.('.row')) setHoverId('');
    };
    window.addEventListener('pointerdown', onDown, true);
    return () => window.removeEventListener('pointerdown', onDown, true);
  }, []);

  /** Desktop: the panel is being folded; the rows on screen now keep the map dimmed while it is folded */
  const keepSeen = () => setFoldSeen(seenIds);

  return { hoverId, setHoverId, seenIds, setSeenIds, foldSeen, keepSeen };
}

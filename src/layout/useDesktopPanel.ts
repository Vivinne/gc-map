'use client';

import { useEffect, useLayoutEffect, useState } from 'react';
import { saveFolded } from './folded';

/**
 * L1 layout, desktop: the content panel beside the rail is open or folded (SPEC R7). A fresh visit opens with it
 * closed; a reload or a shared link that names a screen opens it on that screen. Closing it keeps the screen (and the
 * map), so opening it again shows the screen that was left. The phone layout does not use it (its panels always show).
 * `hasScreen`: a screen other than the plain map is on; a panel folded with it stays folded over a reload in this tab.
 */
export function useDesktopPanel(startOpen: boolean, hasScreen: boolean) {
  const [open, setOpen] = useState(startOpen);
  useEffect(() => saveFolded(!open && hasScreen), [open, hasScreen]);
  /** The panel has just been opened from the rail or the map: it slides out from behind the rail */
  const [opening, setOpening] = useState(false);
  const show = () => {
    if (open) return;
    setOpen(true);
    setOpening(true);
  };
  const close = () => setOpen(false);
  return { open, show, close, opening, setOpening };
}

/**
 * The page the panel opened on slides in; once another page opens, nothing slides until the next opening.
 * The page shown keeps the slide-in class until another page opens (removing the class sooner would restart the
 * panel's own entry animation), so the panel is never mounted again for it. `page`: a key per panel page.
 */
export function usePanelSlide(panel: { opening: boolean; setOpening(v: boolean): void }, page: string): boolean {
  const [slideKey, setSlideKey] = useState<string | null>(null);
  const { opening, setOpening } = panel;
  useLayoutEffect(() => {
    if (opening) {
      setOpening(false);
      setSlideKey(page);
    } else if (slideKey !== null && slideKey !== page) setSlideKey(null);
  }, [opening, page, slideKey, setOpening]);
  return opening || slideKey === page;
}

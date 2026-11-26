/* W11 keys: "/" opens the search, Esc closes everything (SPEC R3). */
import { useEffect } from 'react';
import { closeAll } from './closeAll';
import { railSearch } from './openSearch';
import { afterPanel, type Ctx } from './context';

export function useKeys(c: Ctx): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeAll(c);
      } else if (e.key === '/' && document.activeElement !== c.input.current) {
        e.preventDefault();
        // desktop: the search box lives in the content panel, which opens on the search page first
        if (!c.mobile && (!c.dock.open || c.railPage !== 'search')) {
          railSearch(c);
          afterPanel(() => c.input.current?.focus());
        } else c.input.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
}

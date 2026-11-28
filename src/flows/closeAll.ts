/* W7 × and Esc (SPEC R3). */
import { EMPTY_SCREEN } from '../core/history';
import type { Ctx } from './context';

/** × and Esc: everything closes, the text and results go; the map stays where it is */
export function closeAll(c: Ctx): void {
  // the map stops where it is, also in the middle of a move (Q6), and no framing waits to run after it
  c.map.current?.stop();
  c.keyboard.cancel();
  c.more.set('');
  c.history.reset(EMPTY_SCREEN);
  c.text.clear();
  c.input.current?.blur();
  // desktop: nothing is open after ×, so the content panel closes too
  c.dock.close();
  c.setSearchPage(false);
}

/** × in the search box while typing: clears the text, or closes the empty search */
export function clearBox(c: Ctx): void {
  if (!c.text.draft) return closeAll(c);
  c.text.clear();
  // × drops the submitted search the box was opened over (2026-11-23): the typing screen no longer carries it, so a
  // card opened next, or the box opened again, does not bring it back; the map shows every building
  if (c.top.q) c.history.update((t) => ({ ...t, q: '' }));
  c.input.current?.focus();
}

/** Desktop search page ×: while typing it clears the text; over a sent search it clears the search; otherwise it closes everything */
export function searchClose(c: Ctx): void {
  if (c.top.list === 'preview' && !c.top.b) return clearBox(c);
  // a submitted search (2026-11-24): the × sits in the box, so it clears the search and opens the box for a new one
  // (the map shows every building); a second × closes everything
  if (c.top.q) {
    c.text.clear();
    c.more.set('');
    c.history.update(() => ({ q: '', list: 'preview', group: [], b: '' }));
    // after the typing screen is on: focusing sooner would reopen the box over the old search
    requestAnimationFrame(() => c.input.current?.focus());
    return;
  }
  closeAll(c);
}

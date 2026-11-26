/* W12 desktop: fold the panel or bring it back (rail fold button, a lit rail button) (SPEC R7). */
import type { Ctx } from './context';

/** Hide the panel only (not ×): the screen, the search and the map stay as they are */
export function foldPanel(c: Ctx): void {
  c.keepSeen();
  c.dock.close();
}

/** The fold button: fold the open panel, or bring the folded screen back */
export function toggleFold(c: Ctx): void {
  if (c.dock.open) foldPanel(c);
  else c.dock.show();
}

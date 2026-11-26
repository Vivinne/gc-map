/* W1 open a card: recent buildings, panel, history, camera, the card's own map view (SPEC R1, §7). */
import { BY_ID } from '../data';
import { CARD_SETTLE, afterPanel, openScreen, type Ctx } from './context';

/** The map has stopped after a card opened: its view is the card's view, which ＜ back to the card returns to */
export function noteCardHome(c: Ctx, id: string): void {
  if (c.cardHome.current !== id) return;
  c.cardHome.current = '';
  const v = c.map.current?.view();
  if (!v) return;
  c.history.update((last) => (last.b === id && !last.home ? { ...last, home: v } : last));
}

/** Open a building's card: the map brings it to the middle of its free part, from a list row as from a marker (zoom kept) */
export function openCard(c: Ctx, id: string, centre = true): void {
  const b = BY_ID.get(id);
  if (!b) return;
  c.input.current?.blur();
  c.recent.addBuilding(id);
  c.dock.show();
  openScreen(c, { ...c.top, b: id });
  afterPanel(() => {
    c.cardHome.current = id;
    c.map.current?.focus(b, centre);
    // the map may not need to move at all: then the view right now is the card's view
    window.setTimeout(() => noteCardHome(c, id), CARD_SETTLE);
  });
}

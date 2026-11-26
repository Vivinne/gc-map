/* W10 the map arrives and the map stops (SPEC §7, §11). */
import type { View } from '../core/history';
import { BY_ID } from '../data';
import { listOf } from './lists';
import { noteCardHome } from './openCard';
import { afterPanel, byIds, type Ctx } from './context';

/**
 * The map is there. A shared link or reload with a search but no saved view: frame the results now.
 * The map loads after the page, so a search sent before then is framed when it arrives.
 */
export function mapReady(c: Ctx): void {
  const st = c.stackRef.current;
  const s = st[st.length - 1]!;
  const items = s.list === 'group' ? byIds(s.group, (id) => BY_ID.get(id)) : s.q ? listOf(s.q, s.list).main : [];
  const card = s.b ? BY_ID.get(s.b) : undefined;
  const fresh = !c.start.view || st !== c.start.stack;
  if (card && fresh) afterPanel(() => c.map.current?.focus(card, false));
  else if (items.length && fresh) afterPanel(() => c.map.current?.fitTo(items));
}

/** The map stopped: the address takes its view; a card or group line waiting for its view takes it */
export function mapStopped(c: Ctx, v: View): void {
  c.view.current = v;
  c.writeAddress(c.top);
  if (c.cardHome.current) noteCardHome(c, c.cardHome.current);
  // the map stopped after a group line's click: that is the group's framed view
  if (c.frameClick.current && !c.frameClick.current.view) c.frameClick.current.view = v;
  // lines that frame groups on the map are clickable or not by what the map now shows
  c.redrawLines();
}

/* W2 open a number point list (SPEC §7). */
import { BY_ID } from '../data';
import { afterPanel, byIds, openScreen, type Ctx } from './context';

export function openGroup(c: Ctx, ids: string[]): void {
  const items = byIds(ids, (id) => BY_ID.get(id));
  if (!items.length) return;
  c.dock.show();
  openScreen(c, { q: c.top.q, list: 'group', group: ids, b: '' });
  // the map zooms in beside the list it opened, just far enough for each of its buildings to stand alone
  afterPanel(() => c.map.current?.split(items));
}

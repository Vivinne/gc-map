/* W8 country heading in a results list: frame that country's buildings (SPEC §7). */
import type { View } from '../core/history';
import type { Building } from '../data';
import type { Ctx } from './context';

/** One key for a group of buildings */
const idsOf = (list: Building[]) => list.map((b) => b.id).join('~');
/** Two map views are the same place and zoom (a move of the map makes them differ) */
const sameView = (a: View, b: View) => Math.abs(a.zoom - b.zoom) < 0.01 && Math.abs(a.lng - b.lng) < 1e-5 && Math.abs(a.lat - b.lat) < 1e-5;

export function frameGroup(c: Ctx, items: Building[]): void {
  // the view this click leads to is noted when the map stops: while the map stays there, the line is off
  c.frameClick.current = { ids: idsOf(items), view: null };
  c.map.current?.fitTo(items);
}

/** The map shows exactly this group's framing (its heading is then not clickable) */
export function isFramed(c: Ctx, items: Building[]): boolean {
  const f = c.frameClick.current;
  const v = c.view.current;
  if (f && f.view && v && f.ids === idsOf(items) && sameView(f.view, v)) return true;
  return c.map.current?.framed(items) ?? false;
}

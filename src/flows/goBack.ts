/* W6 ＜: the previous screen comes back with its lists, its search and the map as it was then (SPEC R2, §7). */
import { BY_ID, type Building } from '../data';
import { listOf } from './lists';
import { afterPanel, byIds, type Ctx } from './context';

export function goBack(c: Ctx): void {
  const { stack, top } = c;
  if (stack.length < 2) return;
  const prev = stack[stack.length - 2]!;
  c.history.back();
  c.text.setDraft(prev.draft ?? prev.q);
  // A results list or a number point list comes back with all its buildings framed (as when it opened);
  // a card comes back with its building in sight, as it was when the card opened (the map may have been
  // moved away from it before the next card was opened); other screens come back with the map as it was left
  if (!prev.b && (prev.list === 'results' || prev.list === 'era' || prev.list === 'group')) {
    let items: Building[];
    if (prev.list === 'group') items = byIds(prev.group, (id) => BY_ID.get(id));
    else {
      const f = listOf(prev.q, prev.list);
      items = [...f.main, ...(c.more.open === prev.q ? f.more : [])];
    }
    if (items.length) {
      afterPanel(() => (prev.list === 'group' ? c.map.current?.split(items) : c.map.current?.fitTo(items)));
      return;
    }
  }
  const target = prev.b && prev.home ? prev.home : prev.view;
  if (target) afterPanel(() => c.map.current?.moveTo(target));
  else if (prev.q && prev.q !== top.q) afterPanel(() => c.map.current?.fitTo(listOf(prev.q, prev.list).main));
}

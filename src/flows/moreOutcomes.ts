/* W9 Other Possible Outcomes: open or fold the matches found only in the summary (SPEC §5, §7). */
import { afterPanel, type Ctx } from './context';

export function openMore(c: Ctx): void {
  // the map as it was before, so folding the other outcomes away can bring it back
  c.more.view.current = c.map.current?.view() ?? null;
  c.more.set(c.top.q);
  afterPanel(() => c.map.current?.fitTo([...c.found.main, ...c.found.more]));
}

export function closeMore(c: Ctx): void {
  c.more.set('');
  const v = c.more.view.current;
  c.more.view.current = null;
  if (v) afterPanel(() => c.map.current?.moveTo(v));
}

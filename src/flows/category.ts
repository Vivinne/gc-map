/* W5 Category: open the tag page, pick a tag (SPEC R5). */
import { listOf } from './lists';
import { goBack } from './goBack';
import { afterPanel, openScreen, type Ctx } from './context';

/**
 * A tag picked in the Category page is not a search (2026-11-25): exactly that category's buildings, oldest first;
 * the search box and the recent searches are left alone, ＜ goes back to the tags. Desktop: inside Category,
 * Category stays lit. Phone: Category folds away and the list rises from the bottom.
 */
export function pickTag(c: Ctx, label: string): void {
  const items = listOf(label, 'era').main;
  if (!items.length) return;
  c.more.set('');
  openScreen(c, { q: label, list: 'era', group: [], b: '' });
  afterPanel(() => c.map.current?.fitTo(items));
}

/** Phone Category button: opens the tag page, or goes back from it */
export function toggleCategory(c: Ctx): void {
  if (c.top.list === 'category' && !c.top.b) goBack(c);
  else openScreen(c, { q: c.top.q, list: 'category', group: [], b: '' });
}

/** Rail Category (desktop): the panel opens on the tag page */
export function railCategory(c: Ctx): void {
  c.dock.show();
  if (c.railPage === 'category') return;
  openScreen(c, { q: c.top.q, list: 'category', group: [], b: '' });
}

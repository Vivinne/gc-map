/* W3 send a search: typed + Enter, a recent text, an architect on a card (SPEC R4). */
import type { Screen } from '../core/history';
import { searchSplit } from '../features/search';
import { afterPanel, openScreen, type Ctx } from './context';

export function submitSearch(c: Ctx, text: string): void {
  const t = text.trim();
  if (!t) return;
  const split = searchSplit(t);
  // no match at all: nothing is submitted, the preview says No Results
  if (!split.main.length && !split.more.length) return;
  const found = split.main;
  c.input.current?.blur();
  c.text.send(t);
  c.recent.addText(t);
  c.more.set('');
  const next: Screen = { q: t, list: 'results', group: [], b: '' };
  // The search preview is only the typing step: the submitted search takes its place in the history,
  // so ＜ goes back to the screen before the typing (e.g. the previous search's results), not to the half-typed text
  // The same search sent again from the box over its own results goes back to those results: no second,
  // identical step (R1, ＜ would seem to do nothing)
  if (c.top.list === 'preview' && !c.top.b) c.history.replace(next);
  else openScreen(c, next);
  if (found.length) {
    // Sent with a keyboard that made the page shorter: the map waits until the keyboard has gone and the page
    // keeps one height, then frames the results once (R3). Without such a keyboard the map frames them at once.
    if (c.keyboard.keyboardUp()) c.keyboard.frameAfterKeyboard(found);
    else afterPanel(() => c.map.current?.fitTo(found));
  }
}

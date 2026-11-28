/* W4 open the search box and type (phone box, desktop rail Search, "/") (SPEC §5, R7). */
import { afterPanel, openScreen, type Ctx } from './context';

/** The box is clicked: the typing screen opens over the screen on top */
export function openPreview(c: Ctx): void {
  if (c.top.list === 'preview' && !c.top.b) return;
  // a picked Category tag is not a search: the box opens over it with no search
  const q = c.top.list === 'era' ? '' : c.top.q;
  c.text.show(c.text.waiting() ?? q);
  openScreen(c, { q, list: 'preview', group: [], b: '' });
}

/** A letter typed in the box */
export function typeText(c: Ctx, t: string): void {
  if (!(c.top.list === 'preview' && !c.top.b)) openPreview(c);
  c.text.type(t);
}

/** Rail Search (desktop): the panel opens on the search page (the submitted search's results, else the empty search page) */
export function railSearch(c: Ctx): void {
  c.dock.show();
  c.setSearchPage(true);
  if (c.railPage === 'search') return;
  // with no search, the typing screen itself goes on top (no extra empty step that \uff1c would stop at, 2026-11-25)
  // a picked Category tag is not a search: the search page opens empty over it
  const q = c.top.list === 'era' ? '' : c.top.q;
  // text typed and not sent comes back in the box, with the typing screen (2026-11-25)
  const unsent = c.text.waiting();
  const typing = unsent !== null && unsent !== q;
  if (!c.nothingOpen) {
    if (typing) c.text.show(unsent!);
    else if (!q) c.text.show('');
    openScreen(c, { q, list: q && !typing ? 'results' : 'preview', group: [], b: '' });
  }
  // no search on screen: the box takes the cursor, so the recent searches show at once and typing can start
  if (!q || typing) afterPanel(() => c.input.current?.focus());
}

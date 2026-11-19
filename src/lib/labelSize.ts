/**
 * Size a map name takes on screen, measured with the page's own styles (A8): the names used to be placed with a
 * fixed width per letter, so with a larger system text they ran over the search box and the scale bar.
 * Sizes are kept per text until the page's text size changes.
 */
const cache = new Map<string, { w: number; h: number }>();
let probe: SVGTextElement | null = null;
let scale = '';

export function labelSize(text: string, open: boolean, host: Element): { w: number; h: number } {
  const now = `${getComputedStyle(document.documentElement).fontSize} ${window.devicePixelRatio}`;
  if (now !== scale) {
    cache.clear();
    scale = now;
  }
  const key = `${open ? 1 : 0}${text}`;
  const known = cache.get(key);
  if (known) return known;
  if (!probe || !probe.isConnected) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;overflow:hidden;visibility:hidden;pointer-events:none';
    probe = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    svg.appendChild(probe);
    host.appendChild(svg);
  }
  probe.setAttribute('class', open ? 'mk-label sel' : 'mk-label');
  probe.textContent = text;
  const size = { w: probe.getComputedTextLength(), h: probe.getBBox().height };
  cache.set(key, size);
  return size;
}

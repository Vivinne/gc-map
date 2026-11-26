'use client';

import { useLayoutEffect, useState, type RefObject } from 'react';

/** How far each edge of the map is covered (px): the map frames buildings in the part left free */
export interface Room {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

const NONE: Room = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * L1 layout: the part of the map the search box, the open panel, the rail and the zoom buttons cover.
 * Measured after every render and whenever the panel or the page changes size.
 * `edges`: desktop room kept along the left (rail) and right (zoom buttons).
 */
export function useMapRoom(app: RefObject<HTMLElement | null>, panel: RefObject<HTMLElement | null>, mobile: boolean, edges: { left: number; right: number }): Room {
  const [room, setRoom] = useState<Room>(NONE);
  useLayoutEffect(() => {
    const measure = () => {
      const box = app.current?.getBoundingClientRect();
      const bar = app.current?.querySelector('.topbar')?.getBoundingClientRect();
      // Offsets, not the drawn box: a panel still sliding in (or being dragged) is measured where it comes to rest
      const el = panel.current;
      const p = el ? { left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight } : null;
      if (!box) return;
      // Desktop: the zoom buttons sit along the right edge, so framed buildings stay clear of them
      // and the rail along the left edge
      const next = { ...NONE, top: bar ? bar.bottom - box.top : 0, right: mobile ? 0 : edges.right, left: mobile ? 0 : edges.left };
      if (p && p.width && p.height) {
        if (!mobile) next.left = p.left + p.width;
        else if (p.top > box.height / 3) next.bottom = box.height - p.top;
        else next.top = Math.max(next.top, p.top + p.height);
      }
      setRoom((o) => (o.top === next.top && o.left === next.left && o.bottom === next.bottom && o.right === next.right ? o : next));
    };
    measure();
    // measured in the next frame: a size set inside the observer's own callback loops it (B8, WebKit)
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    });
    if (panel.current) ro.observe(panel.current);
    if (app.current) ro.observe(app.current);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  });
  return room;
}

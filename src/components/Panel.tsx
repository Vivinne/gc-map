'use client';

import { forwardRef, useEffect, useRef, useState, type ReactNode } from 'react';

/** Phone sheet heights: title only, half the screen, or up to the search box */
export type SheetState = 'fold' | 'half' | 'full';

interface Props {
  mobile: boolean;
  /**
   * Where the panel sits. Desktop: always under the search box, top left of the map.
   * Phone: 'top' = under the search box (preview, category); 'sheet' = from the bottom (other lists, card).
   */
  place: 'top' | 'sheet';
  /** Phone 'top' panel at full screen height (search preview) */
  fill?: boolean;
  label: string;
  className?: string;
  /** Title area (the part a phone sheet is dragged by) */
  head: ReactNode;
  /** Changes when new content opens: a phone sheet goes back to half height */
  resetKey: string;
  children: ReactNode;
}

const DRAG = 40;

/**
 * A list or card over the map. Phone sheets: the title area drags, the content scrolls.
 * Dragged down: from half to the title only, from full to half. Dragged up: from the title to half, and from
 * half to full when the content is longer than half the screen.
 */
const Panel = forwardRef<HTMLElement, Props>(function Panel({ mobile, place, fill, label, className = '', head, resetKey, children }, ref) {
  const [state, setState] = useState<SheetState>('half');
  const [dy, setDy] = useState(0);
  const drag = useRef<{ y: number; id: number } | null>(null);
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setState('half');
    body.current?.scrollTo({ top: 0 });
  }, [resetKey]);

  const sheet = mobile && place === 'sheet';
  const onDown = (e: React.PointerEvent) => {
    if (!sheet || (e.target as Element).closest('button, a, input')) return;
    drag.current = { y: e.clientY, id: e.pointerId };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (drag.current?.id !== e.pointerId) return;
    setDy(e.clientY - drag.current.y);
  };
  const onUp = (e: React.PointerEvent) => {
    if (drag.current?.id !== e.pointerId) return;
    drag.current = null;
    const d = dy;
    setDy(0);
    if (d > DRAG) setState((s) => (s === 'full' ? 'half' : 'fold'));
    else if (d < -DRAG) {
      setState((s) => {
        if (s === 'fold') return 'half';
        const el = body.current;
        return el && el.scrollHeight > el.clientHeight + 1 ? 'full' : s;
      });
    }
  };

  const cls = ['panel', className, mobile ? `m ${place}` : 'd', sheet ? state : '', mobile && fill ? 'fill' : ''].filter(Boolean).join(' ');
  return (
    <section ref={ref} className={cls} aria-label={label} style={sheet && dy ? { transform: `translateY(${Math.max(dy, -40)}px)`, transition: 'none' } : undefined}>
      <div
        className={`p-head${sheet ? ' drag' : ''}`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => ((drag.current = null), setDy(0))}
        onClick={sheet && state === 'fold' ? (e) => !(e.target as Element).closest('button') && setState('half') : undefined}
      >
        {sheet && <span className="grab" aria-hidden="true" />}
        {head}
      </div>
      {!(sheet && state === 'fold') && (
        <div className="p-body" ref={body}>
          {children}
        </div>
      )}
    </section>
  );
});

export default Panel;

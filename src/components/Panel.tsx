'use client';

import { forwardRef, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/** Phone sheet heights: title only, half the screen, or up to the search box */
export type SheetState = 'fold' | 'half' | 'full';

interface Props {
  mobile: boolean;
  /**
   * Where the panel sits. Desktop: always under the search box, top left of the map.
   * Phone: 'top' = under the search box (preview, category); 'sheet' = from the bottom (other lists, card).
   */
  place: 'top' | 'sheet';
  label: string;
  className?: string;
  /** Title area (the part a phone sheet is dragged by) */
  head: ReactNode;
  /** Changes when new content opens: a phone sheet goes back to half height */
  resetKey: string;
  /** Where the content was scrolled when this screen was left (＜ brings it back); none = the top */
  scroll?: number;
  children: ReactNode;
}

const DRAG = 40;

/**
 * A list or card over the map. Phone sheets: the title area drags, the content scrolls.
 * Dragged down: from half to the title only, from full to half. Dragged up: from the title to half, and from
 * half to full when the content is longer than half the screen. A sheet that cannot go a way does not move that way.
 */
const Panel = forwardRef<HTMLElement, Props>(function Panel({ mobile, place, label, className = '', head, resetKey, scroll, children }, ref) {
  const [state, setState] = useState<SheetState>('half');
  const [dy, setDyState] = useState(0);
  // the latest drag distance, read on release (a release can arrive before React has re-rendered the last move)
  const dyRef = useRef(0);
  const dragged = useRef(false);
  const setDy = (v: number) => {
    dyRef.current = v;
    setDyState(v);
  };
  /** The pointer being dragged, and which ways the sheet can go from where it is (it only follows those) */
  const drag = useRef<{ y: number; id: number; up: boolean; down: boolean } | null>(null);
  const body = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    setState('half');
    body.current?.scrollTo({ top: scroll ?? 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  const sheet = mobile && place === 'sheet';
  // A folded sheet sits on the bottom edge: the scale bar moves up above it (--sheet-fold, see src/styles/modules/phone.css)
  const self = useRef<HTMLElement | null>(null);
  const folded = sheet && state === 'fold';
  useLayoutEffect(() => {
    if (!folded || !self.current) return;
    const root = document.documentElement.style;
    root.setProperty('--sheet-fold', `${self.current.offsetHeight}px`);
    return () => {
      root.removeProperty('--sheet-fold');
    };
  }, [folded]);
  /** The sheet can grow: from the title only, or when the content is longer than the sheet shows */
  const canGrow = () => {
    if (state === 'fold') return true;
    const el = body.current;
    return state === 'half' && !!el && el.scrollHeight > el.clientHeight + 1;
  };
  const onDown = (e: React.PointerEvent) => {
    if (!sheet || (e.target as Element).closest('button, a, input')) return;
    // a mouse drag would otherwise select text, and dragging that selection cancels the next drag
    if (e.pointerType === 'mouse') e.preventDefault();
    drag.current = { y: e.clientY, id: e.pointerId, up: canGrow(), down: state !== 'fold' };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (drag.current?.id !== e.pointerId) return;
    const d = e.clientY - drag.current.y;
    setDy(d < 0 ? (drag.current.up ? d : 0) : drag.current.down ? d : 0);
  };
  const onUp = (e: React.PointerEvent) => {
    if (drag.current?.id !== e.pointerId) return;
    drag.current = null;
    const d = dyRef.current;
    setDy(0);
    // a mouse release after a drag also fires a click: that click must not reopen the sheet it just folded
    dragged.current = Math.abs(d) > 4;
    if (d > DRAG) setState((s) => (s === 'full' ? 'half' : 'fold'));
    else if (d < -DRAG) {
      setState((s) => (s === 'fold' ? 'half' : canGrow() ? 'full' : s));
    }
  };

  const cls = ['panel', className, mobile ? `m ${place}` : 'd', sheet ? state : ''].filter(Boolean).join(' ');
  return (
    <section
      ref={(el) => {
        self.current = el;
        if (typeof ref === 'function') ref(el);
        else if (ref) ref.current = el;
      }}
      className={cls} aria-label={label} style={sheet && dy ? { transform: `translateY(${Math.max(dy, -40)}px)`, transition: 'none' } : undefined}>
      <div
        className={`p-head${sheet ? ' drag' : ''}`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => ((drag.current = null), setDy(0))}
        onClick={
          sheet && state === 'fold'
            ? (e) => {
                if (dragged.current) return void (dragged.current = false);
                if (!(e.target as Element).closest('button')) setState('half');
              }
            : () => void (dragged.current = false)
        }
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

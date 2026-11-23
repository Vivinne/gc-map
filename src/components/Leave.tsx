'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { MOTION } from '../styles/tokens';

/** How long a closing panel takes to slide away (kept in step with .leave in src/styles/modules/leave.css) */
export const LEAVE_MS = MOTION.leave;

/**
 * Lets a panel slide away instead of vanishing. While `show` is true the children render as usual;
 * when it turns false the last children stay on screen for a moment in a wrapper that plays the exit
 * (see .leave in src/styles/modules/leave.css), then go. The wrapper does not take part in the layout (display: contents),
 * so nothing around the panel moves. The leaving copy cannot be clicked.
 */
export default function Leave({ show, slide = false, children }: { show: boolean; /** Desktop panel closed from the rail: it slides back behind the rail (MOTION.slide) */ slide?: boolean; children: ReactNode }) {
  const last = useRef<ReactNode>(null);
  const [leaving, setLeaving] = useState(false);
  const [prev, setPrev] = useState(show);
  const [slideOut, setSlideOut] = useState(false);
  // decided while rendering, so the panel never disappears for a frame before its exit starts
  if (prev !== show) {
    setPrev(show);
    setLeaving(!show);
    setSlideOut(!show && slide);
  }
  if (show) last.current = children;

  useEffect(() => {
    if (!leaving) return undefined;
    const t = window.setTimeout(() => setLeaving(false), slideOut ? MOTION.slide : LEAVE_MS);
    return () => window.clearTimeout(t);
  }, [leaving, slideOut]);

  if (show) return <>{children}</>;
  if (!leaving) return null;
  return (
    <div className={`leave${slideOut ? ' slide' : ''}`} aria-hidden="true" inert>
      {last.current}
    </div>
  );
}

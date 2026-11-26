'use client';

import { useEffect, useState } from 'react';

/** Widths up to this use the phone layout */
export const MOBILE_QUERY = '(max-width: 900px)';

/** Whether a CSS media query matches now; follows changes (window resized, motion setting changed) */
export function useMedia(q: string): boolean {
  const [on, setOn] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const f = () => setOn(m.matches);
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, [q]);
  return on;
}

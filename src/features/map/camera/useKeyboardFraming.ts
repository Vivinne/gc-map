'use client';

import { useEffect, useRef, type RefObject } from 'react';
import type { Building } from '../../../data';
import type { MapHandle } from './camera';

/** A phone keyboard closes within this time after a search is sent (ms): the map frames the results by then */
const KEYBOARD_WAIT = 1500;
/** The page height has stayed put this long (ms): the keyboard has finished moving */
const KEYBOARD_SETTLE = 150;
/** The page is at least this much shorter than its full height (px): a keyboard is up */
const KEYBOARD_MIN = 80;

/**
 * F5a camera, phone: results sent with the keyboard up are framed once, after the keyboard has gone and the page
 * keeps one height (R3; framing at each step of the keyboard closing made the map start again and again).
 * `typingIn`: the text box being typed in (the page height is taken as full only while it is not focused).
 */
export function useKeyboardFraming(map: RefObject<MapHandle | null>, typingIn: RefObject<HTMLElement | null>) {
  /** Results waiting to be framed until a closing keyboard has gone */
  const refit = useRef<{ items: Building[]; until: number } | null>(null);
  const timer = useRef(0);
  /** Frame the waiting results after `ms` with no change of the page's height */
  const later = (ms: number) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const r = refit.current;
      refit.current = null;
      if (r) map.current?.fitTo(r.items);
    }, ms);
  };
  /** The page's height with no keyboard (taken while the search box is not being typed in) */
  const fullHeight = useRef(typeof window !== 'undefined' ? window.innerHeight : 0);
  useEffect(() => {
    const onResize = () => {
      if (document.activeElement !== typingIn.current) fullHeight.current = Math.max(window.innerHeight, refit.current ? fullHeight.current : 0);
      const r = refit.current;
      if (!r) return;
      // the keyboard is still moving: wait for the height to stay put (or for the longest wait to end)
      later(Math.max(0, Math.min(KEYBOARD_SETTLE, r.until - performance.now())));
    };
    // a finger or mouse on the page ends the wait: the map is the person's now
    const stop = () => {
      refit.current = null;
      window.clearTimeout(timer.current);
    };
    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    window.addEventListener('pointerdown', stop, true);
    return () => {
      window.clearTimeout(timer.current);
      window.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
      window.removeEventListener('pointerdown', stop, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    /** A keyboard makes the page shorter right now */
    keyboardUp: () => window.innerHeight < fullHeight.current - KEYBOARD_MIN,
    /** Frame these buildings once the keyboard has gone */
    frameAfterKeyboard: (items: Building[]) => {
      refit.current = { items, until: performance.now() + KEYBOARD_WAIT };
      later(KEYBOARD_WAIT);
    },
    /** Drop a waiting framing (× closes everything) */
    cancel: () => {
      refit.current = null;
      window.clearTimeout(timer.current);
    },
  };
}

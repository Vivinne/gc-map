'use client';

import { useEffect, useRef, useState } from 'react';
import { sameScreen, type Screen } from './screen';
import { saveStack, startStack } from './stack';

/** Notes the screen being left keeps (map view, scroll, typed text), worked out from that screen */
export type Leave = (left: Screen) => Partial<Screen>;

/**
 * C1 history: the one owner of the screens behind ＜. Every change to the history goes through these calls;
 * the history is saved for this tab after each change.
 */
export function useHistory(start: Screen) {
  const [stack, setStack] = useState<Screen[]>(() => startStack(start));
  const stackRef = useRef(stack);
  stackRef.current = stack;
  useEffect(() => saveStack(stack), [stack]);

  /** A new screen on top; the screen it leaves keeps `leave`'s notes. The screen already on top is not added again */
  const push = (next: Screen, leave: Leave = () => ({})) =>
    setStack((st) => {
      const cur = st[st.length - 1]!;
      if (sameScreen(cur, next)) return st;
      return [...st.slice(0, -1), { ...cur, ...leave(cur) }, next];
    });
  /** ＜: the top screen goes; the last screen always stays (T5-1) */
  const back = () => setStack((st) => (st.length > 1 ? st.slice(0, -1) : st));
  /** The top screen gives way to `next`; when `next` equals the screen under it, that screen comes back instead (no second, identical step) */
  const replace = (next: Screen) => setStack((st) => (st.length > 1 && sameScreen(st[st.length - 2]!, next) ? st.slice(0, -1) : [...st.slice(0, -1), next]));
  /** Change the top screen in place (`f` giving back the same screen changes nothing) */
  const update = (f: (top: Screen) => Screen) =>
    setStack((st) => {
      const t = st[st.length - 1]!;
      const n = f(t);
      return n === t ? st : [...st.slice(0, -1), n];
    });
  /** Only this screen is left (× closes everything) */
  const reset = (only: Screen) => setStack([only]);

  return { stack, stackRef, top: stack[stack.length - 1]!, push, back, replace, update, reset };
}

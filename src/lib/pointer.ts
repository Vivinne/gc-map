/**
 * Whether a pointer event comes from a mouse on a device that can point without touching.
 * Phones can report a tap as a mouse (a list line sliding under a finger that just lifted): the ink ring
 * that follows a mouse must not start from it.
 */
export function isMouseHover(e: { pointerType: string }): boolean {
  if (e.pointerType !== 'mouse') return false;
  return typeof window === 'undefined' || !window.matchMedia || window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}

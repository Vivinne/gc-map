/* Component-test wrapper: the pointing door (usePointing); a row to touch and a key for the screen. */
import { useEffect, useState } from 'react';
import { usePointing } from './index';

declare global {
  interface Window {
    pointTest: { api: ReturnType<typeof usePointing>; newScreen(): void };
  }
}

export function PointingStory() {
  const [screen, setScreen] = useState(0);
  const p = usePointing(screen);
  useEffect(() => {
    window.pointTest = { api: p, newScreen: () => setScreen((n) => n + 1) };
  });
  return (
    <div>
      <button type="button" className="row">row</button>
      <button type="button" className="other">elsewhere</button>
      <output id="point">{JSON.stringify({ hover: p.hoverId, seen: p.seenIds, fold: p.foldSeen })}</output>
    </div>
  );
}

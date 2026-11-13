'use client';

import { BUILDINGS, ERAS, ERA_ORDER } from '../lib/model';

/** Buildings per category (a building filed under several styles counts in each) */
const COUNTS = Object.fromEntries(ERA_ORDER.map((e) => [e, BUILDINGS.filter((b) => b.eras.includes(e)).length]));

/** The 10 style tags, laid out as in the v1 filters panel; one click searches the style's name */
export default function CategoryList({ onPick }: { onPick(label: string): void }) {
  return (
    <div className="styles">
      {ERA_ORDER.map((e) => (
        <button type="button" key={e} className="chip" onClick={() => onPick(ERAS[e].label)}>
          <i className="sw" style={{ background: ERAS[e].color }} />
          {ERAS[e].label}
          <span className="n">{COUNTS[e]}</span>
        </button>
      ))}
    </div>
  );
}

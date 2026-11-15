import { pointRadius, type Group } from '../lib/geo';
import { ERAS, ERA_ORDER, type Building } from '../lib/model';

/** Number point: a ring split by category colour, the count in the middle (the v1 city circle) */
export default function NumberPoint({ group }: { group: Group<Building> }) {
  const items = group.items;
  const r = pointRadius(items.length);
  const ring = 6;
  const parts = ERA_ORDER.map((e) => [e, items.filter((b) => b.era === e).length] as const).filter(([, n]) => n > 0);
  let a0 = -Math.PI / 2;
  const P = (a: number, rr: number) => `${(Math.cos(a) * rr).toFixed(2)},${(Math.sin(a) * rr).toFixed(2)}`;
  return (
    <>
      {/* ink ring sits flush on the outer edge (3 px line centred 1.5 px outside) */}
      <circle r={r + 1.5} className="num-hot" />
      {parts.length === 1 ? (
        <circle r={r - ring / 2} fill="none" stroke={ERAS[parts[0]![0]].color} strokeWidth={ring} />
      ) : (
        parts.map(([e, n]) => {
          const a1 = a0 + (n / items.length) * Math.PI * 2;
          const large = a1 - a0 > Math.PI ? 1 : 0;
          const d = `M${P(a0, r)} A${r},${r} 0 ${large} 1 ${P(a1, r)} L${P(a1, r - ring)} A${r - ring},${r - ring} 0 ${large} 0 ${P(a0, r - ring)} Z`;
          a0 = a1;
          return <path key={e} d={d} fill={ERAS[e].color} stroke="#fff" strokeWidth={1} />;
        })
      )}
      <circle r={r - ring} fill="#fff" />
      <text className="num-n" y={4.3} textAnchor="middle">
        {items.length}
      </text>
    </>
  );
}

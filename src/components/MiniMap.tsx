'use client';

import { geoMercator, geoPath } from 'd3-geo';
import { useMemo } from 'react';
import { basemap } from '../lib/basemap';
import { ERAS, type Building } from '../lib/model';

interface Props {
  width: number;
  height: number;
  items: Building[];
  /** Centre the view on one building with about this many km across (else fit Europe and the items) */
  focus?: { b: Building; km: number };
  hot?: string;
}

/** Small static map drawn from the offline basemap (no tiles, no interaction) */
export default function MiniMap({ width, height, items, focus, hot }: Props) {
  const { land, borders } = basemap();
  const proj = useMemo(() => {
    const p = geoMercator();
    if (focus) {
      const dLng = focus.km / (111.32 * Math.cos((focus.b.lat * Math.PI) / 180)) / 2;
      const dLat = (focus.km * (height / width)) / 111.32 / 2;
      p.fitExtent(
        [[0, 0], [width, height]],
        { type: 'MultiPoint', coordinates: [[focus.b.lng - dLng, focus.b.lat - dLat], [focus.b.lng + dLng, focus.b.lat + dLat]] },
      );
    } else {
      const pts = items.length ? items.map((b) => [b.lng, b.lat]) : [[-9, 36], [25, 58]];
      const eu = pts.filter(([lng = 0, lat = 0]) => lng > -12 && lng < 32 && lat > 34 && lat < 62);
      const use = eu.length ? eu : pts;
      p.fitExtent([[10, 10], [width - 10, height - 10]], { type: 'MultiPoint', coordinates: [...use, [-6, 40], [16, 52]] });
    }
    return p;
  }, [width, height, items, focus]);
  const path = geoPath(proj);
  return (
    <svg width={width} height={height} className="minimap" aria-hidden="true">
      <rect width={width} height={height} fill="var(--sea)" />
      <path d={path(land) ?? ''} fill="var(--land)" />
      <path d={path(borders) ?? ''} fill="none" stroke="#fff" strokeWidth={0.8} />
      {items.map((b) => {
        const p = proj([b.lng, b.lat]);
        if (!p || p[0] < -4 || p[1] < -4 || p[0] > width + 4 || p[1] > height + 4) return null;
        const on = hot === b.id;
        return <circle key={b.id} cx={p[0]} cy={p[1]} r={on ? 6 : 3.4} fill={ERAS[b.era].color} stroke={on ? '#000' : '#fff'} strokeWidth={on ? 2.5 : 1} />;
      })}
      {focus &&
        (() => {
          const p = proj([focus.b.lng, focus.b.lat]);
          if (!p) return null;
          return (
            <g>
              <circle cx={p[0]} cy={p[1]} r={13} fill={ERAS[focus.b.era].color} opacity={0.22} />
              <circle cx={p[0]} cy={p[1]} r={6.5} fill={ERAS[focus.b.era].color} stroke="#fff" strokeWidth={2} />
            </g>
          );
        })()}
    </svg>
  );
}

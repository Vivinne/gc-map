import type { CSSProperties } from 'react';

/** Round lengths the scale bar may show, in metres */
const NICE = [5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000, 1000000, 2000000];
/** Longest bar, in pixels */
const MAX_PX = 110;

export interface Scale {
  /** Length shown, in metres */
  metres: number;
  label: string;
  px: number;
}

/** Scale bar for a map view: the longest round length that fits in 110 px at the latitude and zoom given */
export function scaleFor(lat: number, zoom: number): Scale {
  const mpp = (40075016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** zoom);
  const metres = [...NICE].reverse().find((n) => n / mpp <= MAX_PX) ?? 5;
  return { metres, label: metres >= 1000 ? `${metres / 1000} km` : `${metres} m`, px: metres / mpp };
}

/** The scale bar as drawn on the map (kept from GC Atlas v1): the length, then an open bracket under it */
export default function ScaleBar({ scale, style }: { scale: Scale; style?: CSSProperties }) {
  return (
    <div className="scale" style={style}>
      {scale.label}
      <i style={{ width: scale.px }} />
    </div>
  );
}

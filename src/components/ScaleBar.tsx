import type { CSSProperties } from 'react';
import type { Scale } from '../lib/scale';

export { scaleFor, type Scale } from '../lib/scale';

/** The scale bar as drawn on the map (kept from GC Atlas v1): the length, then an open bracket under it */
export default function ScaleBar({ scale, style }: { scale: Scale; style?: CSSProperties }) {
  return (
    <div className="scale" style={style}>
      {scale.label}
      <i style={{ width: scale.px }} />
    </div>
  );
}

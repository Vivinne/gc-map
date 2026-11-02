// e2e only: replaces MapView (maplibre-gl cannot be installed here and tiles are unreachable).
// Behaviour matches the real component: points at the same coordinate return several pids at once; selection sets data-selected.
import { useEffect } from 'react';
import type { PointCollection } from '../../src/lib/geo';
import { coordKey } from '../../src/lib/geo';

interface Props {
  fc: PointCollection;
  cities?: unknown;
  selectedPid: string;
  bounds: [[number, number], [number, number]] | null;
  focus: unknown;
  active: boolean;
  onPick: (pids: string[]) => void;
  onFootprint?: unknown;
}

export default function MapViewStub({ fc, selectedPid, bounds, focus, active, onPick }: Props) {
  useEffect(() => {
    (window as unknown as { __map: unknown }).__map = { bounds, focus, active };
  });
  // Rough equirectangular projection, only so the distribution is visible in screenshots
  const W = [-6, 30], H = [60, 35];
  const pos = (lng: number, lat: number) => ({
    left: `${((lng - (W[0] as number)) / ((W[1] as number) - (W[0] as number))) * 100}%`,
    top: `${((lat - (H[0] as number)) / ((H[1] as number) - (H[0] as number))) * 100}%`,
  });
  const byCoord = new Map<string, string[]>();
  for (const f of fc.features) {
    const k = coordKey(f.geometry.coordinates[0], f.geometry.coordinates[1]);
    byCoord.set(k, [...new Set([...(byCoord.get(k) ?? []), f.properties.pid])]);
  }
  return (
    <div className="map" data-testid="map" style={{ overflow: 'hidden' }}>
      {fc.features.map((f) => {
        const [lng, lat] = f.geometry.coordinates;
        const k = coordKey(lng, lat);
        return (
          <button
            key={f.properties.id}
            className="marker"
            data-pid={f.properties.pid}
            data-selected={f.properties.pid === selectedPid}
            aria-label={f.properties.name}
            onClick={() => onPick(byCoord.get(k) ?? [f.properties.pid])}
            style={{ position: 'absolute', width: 12, height: 12, borderRadius: 6, border: '2px solid #fff', background: f.properties.color, transform: 'translate(-50%,-50%)', padding: 0, outline: f.properties.pid === selectedPid ? '3px solid #111827' : 'none', ...pos(lng, lat) }}
          />
        );
      })}
    </div>
  );
}

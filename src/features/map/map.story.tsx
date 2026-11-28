/* Component-test wrapper: the map alone on a full page. The test drives it through window.mapTest (props, camera, events). */
import { useEffect, useRef, useState } from 'react';
import type { View } from '../../core/history';
import { BUILDINGS, BY_ID, type Building } from '../../data';
import { MapView, type MapHandle } from './index';
import type { Padding } from './MapView';

export interface MapProps {
  ids?: string[];
  searched?: boolean;
  selected?: string;
  hover?: string;
  seen?: string[] | null;
  padding?: Padding;
  compact?: boolean;
  start?: View | null;
  reduced?: boolean;
}

declare global {
  interface Window {
    mapTest: { map(): MapHandle | null; events: string[]; set(p: MapProps): void; pick(ids: string[]): Building[]; all: Building[] };
  }
}

const NO_PAD: Padding = { top: 0, right: 0, bottom: 0, left: 0 };

export function MapStory(first: MapProps) {
  const ref = useRef<MapHandle>(null);
  const [p, setP] = useState<MapProps>(first);
  const events = useRef<string[]>([]);
  useEffect(() => {
    window.mapTest = { map: () => ref.current, events: events.current, set: (n) => setP((o) => ({ ...o, ...n })), pick: (ids) => ids.map((id) => BY_ID.get(id)!), all: BUILDINGS };
  }, []);
  const log = (e: string) => events.current.push(e);
  const list = p.ids ? p.ids.map((id) => BY_ID.get(id)!) : BUILDINGS;
  return (
    <div className={`app${p.compact ? ' is-mobile' : ''}`}>
      <main className="main">
        <MapView
          ref={ref}
          buildings={list}
          searched={!!p.searched}
          selected={p.selected ? BY_ID.get(p.selected)! : null}
          hoverId={p.hover ?? ''}
          seenIds={p.seen ?? null}
          padding={p.padding ?? NO_PAD}
          reducedMotion={!!p.reduced}
          compact={!!p.compact}
          start={p.start ?? null}
          onSelect={(id) => log(`select:${id}`)}
          onGroup={(ids) => log(`group:${ids.join('~')}`)}
          onView={(v) => log(`view:${v.zoom.toFixed(2)}`)}
          onFail={() => log('fail')}
          onReady={() => log('ready')}
          down={false}
          fallback={<div className="fallback-test">fallback</div>}
        />
      </main>
    </div>
  );
}

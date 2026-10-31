'use client';

import { useEffect } from 'react';
import type { Place } from '../lib/types';
import type { FootprintInfo } from './MapView';

export type Mark = 'Y' | 'N';

/** Plain-language state of the footprint found for a building */
export function footprintText(i: FootprintInfo | undefined): string {
  if (!i || !i.ready) return 'loading map tiles…';
  if (i.found === 0) return 'not found';
  return `found (${i.found} shape${i.found > 1 ? 's' : ''}, ${i.area.toLocaleString('en')} m²)`;
}

export function FgCheck({
  places, idx, marks, info, onIdx, onMark, onExport, onClose,
}: {
  places: readonly Place[];
  idx: number;
  marks: Readonly<Record<string, Mark>>;
  info: FootprintInfo | undefined;
  onIdx: (i: number) => void;
  onMark: (m: Mark) => void;
  onExport: () => void;
  onClose: () => void;
}) {
  const place = places[idx];
  const n = places.length;
  const done = places.filter((p) => marks[p.id]).length;
  const bad = places.filter((p) => marks[p.id] === 'N').length;
  const go = (d: number) => onIdx(Math.min(n - 1, Math.max(0, idx + d)));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
      else if (e.key === 'y' || e.key === 'Y') onMark('Y');
      else if (e.key === 'n' || e.key === 'N') onMark('N');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, n, onMark]);

  if (!place) return null;
  const m = marks[place.id];
  return (
    <section className="fgbar" aria-label="Figure ground check" data-testid="fgbar">
      <div className="fg-line">
        <strong className="fg-pos" data-testid="fg-pos">{idx + 1} / {n}</strong>
        <span className="fg-name">{place.name}</span>
        <span className="fg-state" data-testid="fg-state" data-mark={m ?? ''}>
          Footprint: {footprintText(info)}{m ? ` · marked ${m}` : ''}
        </span>
      </div>
      <div className="fg-btns">
        <button type="button" onClick={() => go(-1)} disabled={idx === 0} data-testid="fg-prev">← Prev</button>
        <button type="button" className="fg-y" onClick={() => onMark('Y')} data-testid="fg-y">Y · correct</button>
        <button type="button" className="fg-n" onClick={() => onMark('N')} data-testid="fg-n">N · wrong</button>
        <button type="button" onClick={() => go(1)} disabled={idx === n - 1} data-testid="fg-next">Next →</button>
        <button type="button" onClick={onExport} data-testid="fg-export">Export CSV</button>
        <button type="button" onClick={onClose} data-testid="fg-close">Close</button>
        <span className="fg-sum">Marked {done}/{n} · N {bad}</span>
      </div>
    </section>
  );
}

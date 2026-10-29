'use client';

import type { Era, Place, Point, Unlocated } from '../lib/types';

const PRECISION_LABEL: Record<Point['precision'], string> = {
  page: 'Source page marker point',
  contained: 'Taken from the containing building / square page',
  approx: 'Approximate location',
  manual: 'Entered manually',
  estimate: 'Estimate (from memory, no source)',
};

const KIND_LABEL: Record<Unlocated['kind'], string> = {
  'no-location': 'No location in the handout (not filled in, per the rules)',
  'not-found': 'No coordinate found',
  partial: 'No coordinate found for some sub-items',
};

const sourceLabel = (url: string): string => {
  const w = /^https:\/\/([a-z]{2})\.wikipedia\.org\//.exec(url);
  if (w) return `Wikipedia (${w[1]})`;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'Source page';
  }
};

export function eraOf(eras: readonly Era[], id: string): Era | undefined {
  return eras.find((e) => e.id === id);
}

export function PlaceList({
  places, eras, selectedId, onSelect,
}: {
  places: readonly Place[];
  eras: readonly Era[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  if (places.length === 0) return <p className="empty">No matching buildings.</p>;
  return (
    <ul className="list" aria-label="Building list">
      {places.map((p) => (
        <li key={p.id}>
          <button
            type="button"
            className="item"
            style={{ ['--c' as string]: eraOf(eras, p.era)?.color }}
            aria-current={p.id === selectedId}
            onClick={() => onSelect(p.id)}
          >
            <span className="bar" />
            <span className="txt">
              <span className="name">{p.name}</span>
              <span className="meta">
                {[p.loc || 'Location not given', p.year !== '—' ? p.year : ''].filter(Boolean).join(' | ')}
                {p.points.length === 0 && <em className="tag">Unlocated</em>}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function DetailPanel({
  place, era, missing, onClose, onFocusPoint,
}: {
  place: Place;
  era: Era | undefined;
  missing: readonly Unlocated[];
  onClose: () => void;
  onFocusPoint: (pt: Point) => void;
}) {
  const rows: [string, string][] = [
    ['Year', place.year],
    ['Architect / Person', place.who],
    ['Notes', place.note],
  ];
  return (
    <section className="detail" style={{ ['--c' as string]: era?.color }} aria-label={`${place.name} details`} data-testid="detail">
      <header className="head">
        <button type="button" className="close" onClick={onClose} aria-label="Close">×</button>
        <p className="kicker">{era?.label} · {place.style}</p>
        <h2>{place.name}</h2>
        <p className="loc">{place.loc || 'Location: not given in the handout'}</p>
      </header>
      <dl className="rows">
        {rows.map(([k, v]) => (
          <div key={k} className="row">
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <div className="coords">
        <h3>Coordinates</h3>
        {place.points.length === 0 && (
          <p className="gap">
            No coordinate yet: {missing.find((m) => m.id === place.id)?.reason ?? 'not yet looked up'}. Add one in data/geo-manual.csv.
          </p>
        )}
        {place.points.map((pt) => (
          <div key={pt.id} className="pt">
            <button type="button" className="locate" onClick={() => onFocusPoint(pt)}>
              {pt.sub || 'Show on map'}
            </button>
            <span className={`prec prec-${pt.precision}`}>{PRECISION_LABEL[pt.precision]}</span>
            <span className="status">{pt.status}</span>
            {pt.note && <span className="pnote">{pt.note}</span>}
            {pt.sourceUrl && (
              <a href={pt.sourceUrl} target="_blank" rel="noopener noreferrer">
                Source: {sourceLabel(pt.sourceUrl)}
              </a>
            )}
            <span className="num">{pt.lat.toFixed(5)}, {pt.lng.toFixed(5)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function Chooser({
  places, eras, onSelect, onClose,
}: {
  places: readonly Place[];
  eras: readonly Era[];
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <section className="chooser" aria-label="Several buildings at the same location" data-testid="chooser">
      <header>
        <strong>{places.length} entries here</strong>
        <button type="button" className="close" onClick={onClose} aria-label="Close">×</button>
      </header>
      <ul>
        {places.map((p) => (
          <li key={p.id}>
            <button type="button" className="item" style={{ ['--c' as string]: eraOf(eras, p.era)?.color }} onClick={() => onSelect(p.id)}>
              <span className="bar" />
              <span className="txt">
                <span className="name">{p.name}</span>
                <span className="meta">{p.style}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function UnlocatedList({
  items, onSelect,
}: {
  items: readonly Unlocated[];
  onSelect: (id: string) => void;
}) {
  if (items.length === 0) return null;
  const kinds: Unlocated['kind'][] = ['not-found', 'partial', 'no-location'];
  return (
    <details className="unloc">
      <summary>Unlocated list ({items.length})</summary>
      {kinds.map((k) => {
        const list = items.filter((i) => i.kind === k);
        if (list.length === 0) return null;
        return (
          <div key={k} className="group">
            <h4>{KIND_LABEL[k]} ({list.length})</h4>
            <ul>
              {list.map((i) => (
                <li key={`${i.id}-${i.sub ?? ''}`}>
                  <button type="button" onClick={() => onSelect(i.id)}>
                    {i.name}
                    {i.sub ? ` / ${i.sub}` : ''}
                  </button>
                  <span className="why">{i.loc ? `${i.loc} | ` : ''}{i.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </details>
  );
}

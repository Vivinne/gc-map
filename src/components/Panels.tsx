'use client';

import type { Era, Place, Unlocated } from '../lib/types';

const KIND_LABEL: Record<Unlocated['kind'], string> = {
  'no-location': 'No location in the handout (not filled in, per the rules)',
  'not-found': 'No coordinate found',
  partial: 'No coordinate found for some sub-items',
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
        <li key={p.id} style={{ ['--c' as string]: eraOf(eras, p.era)?.color }}>
          <button type="button" className="item" aria-current={p.id === selectedId} onClick={() => onSelect(p.id)}>
            <span className="name">{p.name}</span>
            <span className="meta">
              {[p.loc || 'Location not given', p.year !== '—' ? p.year : ''].filter(Boolean).join(' | ')}
              {p.points.length === 0 && <em className="tag">Unlocated</em>}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

const blank = (v: string): string => (v.trim() === '—' ? '' : v.trim());

export function DetailPanel({
  place, era, onClose,
}: {
  place: Place;
  era: Era | undefined;
  onClose: () => void;
}) {
  const sub = [blank(place.year), place.loc].filter(Boolean).join(', ');
  return (
    <section className="detail" style={{ ['--c' as string]: era?.color }} aria-label={`${place.name} details`} data-testid="detail">
      <header className="head">
        <button type="button" className="close" onClick={onClose} aria-label="Close">×</button>
        <h2>{place.name}</h2>
        <p className="loc">{sub}</p>
      </header>
      <div className="context">
        {blank(place.who) && (
          <>
            <p className="who">{blank(place.who)}</p>
            <p className="dash">－</p>
          </>
        )}
        <p className="ctx">{blank(place.summary)}</p>
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

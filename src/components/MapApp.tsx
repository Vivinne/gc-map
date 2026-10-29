'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { dataset, unlocated } from '../lib/data';
import { filterPlaces } from '../lib/filter';
import { HOME_BOUNDS, boundsOf, toFeatureCollection } from '../lib/geo';
import { formatHash, parseHash } from '../lib/hash';
import type { EraId, Place, Point } from '../lib/types';
import MapView, { type FocusTarget } from './MapView';
import { Chooser, DetailPanel, PlaceList, UnlocatedList, eraOf } from './Panels';

type Tab = 'map' | 'list';

const placesById = new Map(dataset.places.map((p) => [p.id, p]));

export default function MapApp() {
  const [init] = useState(() => parseHash(typeof window === 'undefined' ? '' : window.location.hash));
  const [eras, setEras] = useState<ReadonlySet<EraId>>(() => new Set(init.e));
  const [q, setQ] = useState(init.q);
  const [onlyLocated, setOnlyLocated] = useState(init.loc);
  const [selectedId, setSelectedId] = useState(placesById.has(init.p) ? init.p : '');
  const [choices, setChoices] = useState<string[]>([]);
  const [tab, setTab] = useState<Tab>('map');
  const [focus, setFocus] = useState<FocusTarget | null>(null);
  const nonce = useRef(0);

  const visible = useMemo(() => filterPlaces(dataset.places, { eras, q, onlyLocated }), [eras, q, onlyLocated]);
  const fc = useMemo(() => toFeatureCollection(visible, dataset.eras), [visible]);
  const filtersActive = eras.size > 0 || q.trim() !== '' || onlyLocated;
  // With no filter, show a fixed view of Europe; with a filter, zoom to the results (which may include far-away points such as New York or Tokyo)
  const bounds = useMemo(() => (filtersActive ? boundsOf(visible) : HOME_BOUNDS), [filtersActive, visible]);
  const selected: Place | undefined = placesById.get(selectedId);

  const eraCounts = useMemo(() => {
    const m = new Map<EraId, number>();
    for (const p of dataset.places) m.set(p.era, (m.get(p.era) ?? 0) + 1);
    return m;
  }, []);

  // URL hash <-> state
  useEffect(() => {
    const h = formatHash({ p: selectedId, e: [...eras], q, loc: onlyLocated });
    const url = `${window.location.pathname}${window.location.search}${h}`;
    window.history.replaceState(null, '', url);
  }, [selectedId, eras, q, onlyLocated]);

  useEffect(() => {
    const onHash = () => {
      const s = parseHash(window.location.hash);
      setEras(new Set(s.e));
      setQ(s.q);
      setOnlyLocated(s.loc);
      setSelectedId(placesById.has(s.p) ? s.p : '');
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const flyToPlace = useCallback((p: Place) => {
    nonce.current += 1;
    if (p.points.length === 1) {
      const pt = p.points[0] as Point;
      setFocus({ kind: 'point', lng: pt.lng, lat: pt.lat, zoom: 15, nonce: nonce.current });
    } else if (p.points.length > 1) {
      const b = boundsOf([p]);
      if (b) setFocus({ kind: 'bounds', bounds: b, nonce: nonce.current });
    }
  }, []);

  const select = useCallback(
    (id: string) => {
      const p = placesById.get(id);
      if (!p) return;
      setSelectedId(id);
      setChoices([]);
      setTab('map');
      flyToPlace(p);
    },
    [flyToPlace],
  );

  const onPick = useCallback(
    (pids: string[]) => {
      if (pids.length === 1) select(pids[0] as string);
      else {
        setChoices(pids);
        setSelectedId('');
      }
    },
    [select],
  );

  const toggleEra = (id: EraId) =>
    setEras((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setSelectedId('');
      setChoices([]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const choicePlaces = choices.map((id) => placesById.get(id)).filter((p): p is Place => Boolean(p));

  return (
    <div className="app" data-tab={tab}>
      <aside className="side">
        <header className="brand">
          <h1>GC Buildings Map</h1>
          <p>C3 buildings | by handout §6 style lookup · {dataset.places.length} entries</p>
        </header>

        <div className="controls">
          <input
            className="search"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search building, place, architect, keyword"
            aria-label="Search"
          />
          <div className="chips" role="group" aria-label="Era">
            {dataset.eras.map((e) => (
              <button
                key={e.id}
                type="button"
                className="chip"
                style={{ ['--c' as string]: e.color }}
                aria-pressed={eras.has(e.id)}
                onClick={() => toggleEra(e.id)}
              >
                {e.label}
                <small>{eraCounts.get(e.id) ?? 0}</small>
              </button>
            ))}
          </div>
          <label className="check">
            <input type="checkbox" checked={onlyLocated} onChange={(e) => setOnlyLocated(e.target.checked)} />
            Located only
          </label>
          <p className="count" data-testid="count">
            Showing {visible.length} / {dataset.places.length} entries | {fc.features.length} map markers
          </p>
        </div>

        <PlaceList places={visible} eras={dataset.eras} selectedId={selectedId} onSelect={select} />
        <UnlocatedList items={unlocated} onSelect={select} />

        <footer className="credits">
          Basemap © OpenFreeMap, OpenMapTiles, OpenStreetMap contributors. Coordinates come from Wikipedia or from web pages named in the note, with source links, and are marked "Supplementary - to be verified"; semi-transparent markers are memory estimates with no source, unverified.
        </footer>
      </aside>

      <main className="stage">
        <MapView fc={fc} selectedPid={selectedId} bounds={bounds} focus={focus} active={tab === 'map'} onPick={onPick} />
        {selected && (
          <DetailPanel
            place={selected}
            era={eraOf(dataset.eras, selected.era)}
            onClose={() => setSelectedId('')}
          />
        )}
        {!selected && choicePlaces.length > 1 && (
          <Chooser places={choicePlaces} eras={dataset.eras} onSelect={select} onClose={() => setChoices([])} />
        )}
      </main>

      <nav className="tabs" aria-label="View switch">
        <button type="button" aria-pressed={tab === 'map'} onClick={() => setTab('map')}>Map</button>
        <button type="button" aria-pressed={tab === 'list'} onClick={() => setTab('list')}>List</button>
      </nav>
    </div>
  );
}

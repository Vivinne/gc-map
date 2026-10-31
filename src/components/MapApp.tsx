'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { dataset, unlocated } from '../lib/data';
import { filterPlaces } from '../lib/filter';
import { HOME_BOUNDS, boundsOf, toCityCollection, toFeatureCollection } from '../lib/geo';
import { formatHash, parseHash } from '../lib/hash';
import { buildGroups, matchesTags } from '../lib/tags';
import type { Place, Point } from '../lib/types';
import MapView, { type FocusTarget } from './MapView';
import { Chooser, DetailPanel, PlaceList, UnlocatedList, eraOf, type DetailSize, type Offset } from './Panels';

type Tab = 'map' | 'list';

const groups = buildGroups(dataset.eras);
const placesById = new Map(dataset.places.map((p) => [p.id, p]));

export default function MapApp() {
  const [init] = useState(() => parseHash(typeof window === 'undefined' ? '' : window.location.hash));
  const [sideOpen, setSideOpen] = useState(true);
  const [tags, setTags] = useState<ReadonlySet<string>>(() => new Set(init.t));
  const [q, setQ] = useState(init.q);
  const [selectedId, setSelectedId] = useState(placesById.has(init.p) ? init.p : '');
  const [openGroups, setOpenGroups] = useState<ReadonlySet<string>>(new Set());
  const [choices, setChoices] = useState<string[]>([]);
  const [tab, setTab] = useState<Tab>('map');
  const [focus, setFocus] = useState<FocusTarget | null>(null);
  const [detailOffset, setDetailOffset] = useState<Offset>({ x: 0, y: 0 });
  const [detailMin, setDetailMin] = useState(false);
  const [detailSize, setDetailSize] = useState<DetailSize>({ k: 1, w: null, h: null });
  const nonce = useRef(0);

  // Checkbox state updates immediately; the heavy parts (list, map data, counts) follow from the deferred values so the tags stay responsive
  const dTags = useDeferredValue(tags);
  const dQ = useDeferredValue(q);
  const visible = useMemo(() => filterPlaces(dataset.places, { tags: dTags, q: dQ }, groups), [dTags, dQ]);
  const fc = useMemo(() => toFeatureCollection(visible, dataset.eras), [visible]);
  const cities = useMemo(() => toCityCollection(visible), [visible]);
  const filtersActive = dTags.size > 0 || dQ.trim() !== '';
  // With no filter, show a fixed view of Europe; with a filter, zoom to the results (which may include far-away points such as New York or Tokyo)
  const bounds = useMemo(() => (filtersActive ? boundsOf(visible) : HOME_BOUNDS), [filtersActive, visible]);
  const selected: Place | undefined = placesById.get(selectedId);

  // Count shown on each tag = buildings that match it together with the other checked tags
  const tagCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of groups) for (const t of g.tags) {
      // Buildings that would match with this tag added (unchanged when it is already checked)
      const next = dTags.has(t.id) ? dTags : new Set([...dTags, t.id]);
      m.set(t.id, dataset.places.reduce((n, p) => n + (matchesTags(p, next, groups) ? 1 : 0), 0));
    }
    return m;
  }, [dTags]);

  const toggleGroup = useCallback((id: string) => {
    setOpenGroups((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);

  const toggleTag = useCallback((id: string) => {
    setTags((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);

  // URL hash <-> state
  useEffect(() => {
    const h = formatHash({ p: selectedId, t: [...tags], q });
    const url = `${window.location.pathname}${window.location.search}${h}`;
    window.history.replaceState(null, '', url);
  }, [selectedId, tags, q]);

  useEffect(() => {
    const onHash = () => {
      const s = parseHash(window.location.hash);
      setTags(new Set(s.t));
      setQ(s.q);
      setSelectedId(placesById.has(s.p) ? s.p : '');
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const flyToPlace = useCallback((p: Place) => {
    nonce.current += 1;
    if (p.points.length === 1) {
      const pt = p.points[0] as Point;
      setFocus({ kind: 'point', lng: pt.lng, lat: pt.lat, radiusKm: 0.5, nonce: nonce.current });
    } else if (p.points.length > 1) {
      const b = boundsOf([p]);
      if (b) setFocus({ kind: 'bounds', bounds: b, nonce: nonce.current });
    }
  }, []);

  const showFullMap = useCallback(() => {
    const b = boundsOf(dataset.places);
    if (!b) return;
    nonce.current += 1;
    setFocus({ kind: 'bounds', bounds: b, blendWith: HOME_BOUNDS, nonce: nonce.current });
    setTab('map');
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
    <div className="app" data-tab={tab} data-side={sideOpen ? 'open' : 'closed'}>
      <aside className="side">
        <div className="side-top">
          <button
            type="button"
            className="menu-btn"
            aria-expanded={sideOpen}
            aria-label={sideOpen ? 'Collapse building list' : 'Expand building list'}
            onClick={() => setSideOpen((v) => !v)}
          >
            <span /><span /><span />
          </button>
          <header className="brand">
            <h1>GC Buildings Map</h1>
            <p>C3 buildings | by handout §6 style lookup · {dataset.places.length} entries</p>
          </header>
        </div>

        <div className="side-body">
        <div className="controls">
          <input
            className="search"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search building, place, architect"
            aria-label="Search"
          />
          {groups.map((g) => {
            const isOpen = openGroups.has(g.id);
            const nChecked = g.tags.filter((t) => tags.has(t.id)).length;
            return (
              <div key={g.id} className="tag-group" role="group" aria-label={g.label}>
                <button
                  type="button"
                  className="tag-toggle"
                  aria-expanded={isOpen}
                  aria-controls={`chips-${g.id}`}
                  data-open={isOpen}
                  onClick={() => toggleGroup(g.id)}
                >
                  <span>【{g.label}】</span>
                  {nChecked > 0 && <small data-testid={`checked-${g.id}`}>{nChecked}</small>}
                </button>
                {isOpen && (
                  <div className="chips" id={`chips-${g.id}`}>
                    {g.tags.map((t) => (
                      <label
                        key={t.id}
                        className="chip tag-item"
                        style={t.color ? { ['--c' as string]: t.color } : undefined}
                        data-checked={tags.has(t.id)}
                        data-empty={(tagCounts.get(t.id) ?? 0) === 0 && !tags.has(t.id)}
                      >
                        <input type="checkbox" checked={tags.has(t.id)} onChange={() => toggleTag(t.id)} />
                        <span>{t.label}</span>
                        <small>{tagCounts.get(t.id) ?? 0}</small>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {tags.size > 0 && (
            <button type="button" className="clear-tags" onClick={() => setTags(new Set())}>Clear tags ({tags.size})</button>
          )}
          <p className="count" data-testid="count">
            Showing {visible.length} / {dataset.places.length} entries | {fc.features.length} map markers
          </p>
        </div>

        {filtersActive && (
          <>
            <PlaceList places={visible} eras={dataset.eras} selectedId={selectedId} onSelect={select} />
            <UnlocatedList items={unlocated} onSelect={select} />
          </>
        )}

        <footer className="credits">
          Basemap © OpenFreeMap, OpenMapTiles, OpenStreetMap contributors. Coordinates: Wikipedia or named web pages, unverified; faded markers are estimates.
        </footer>
        </div>
      </aside>

      <main className="stage">
        <button type="button" className="fullmap" onClick={showFullMap}>Full map</button>
        <MapView fc={fc} selectedPid={selectedId} cities={cities} bounds={bounds} focus={focus} active={tab === 'map'} onPick={onPick} />
        {selected && (
          <DetailPanel
            place={selected}
            era={eraOf(dataset.eras, selected.era)}
            offset={detailOffset}
            size={detailSize}
            minimized={detailMin}
            onSize={setDetailSize}
            layoutKey={sideOpen ? 'open' : 'closed'}
            onMoved={setDetailOffset}
            onMinimize={() => setDetailMin((v) => !v)}
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

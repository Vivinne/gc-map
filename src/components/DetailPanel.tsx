'use client';

import { useEffect, useRef, useState } from 'react';
import type { Collection } from '../lib/collections';
import { EMPTY, type Filters } from '../lib/filter';
import { nearest } from '../lib/geo';
import { BUILDINGS, CITY_BUILDINGS, CITY_NO, ERAS, nationName, type Building } from '../lib/model';
import Facts from './Facts';
import { Icon } from './Icons';

/** Order used by Previous / Next inside a city: the map numbers (oldest first) */
export function cityOrder(city: string): Building[] {
  return CITY_BUILDINGS.get(city) ?? [];
}

interface SheetProps {
  mobile: boolean;
  onClose(): void;
  children: React.ReactNode;
  className: string;
  label: string;
  /** Card only: a swipe down on the top of the sheet folds it to its title, a swipe up unfolds */
  folded?: boolean;
  onFold?(folded: boolean): void;
  /** Changes when the sheet should open to full height (phone: the open building's pin tapped again) */
  expand?: number;
}

/** Desktop: a panel in the left column of the map. Phone: a bottom sheet that expands by tap or drag on its top edge */
function Sheet({ mobile, onClose, children, className, label, folded, onFold, expand }: SheetProps) {
  const [full, setFull] = useState(false);
  useEffect(() => {
    if (expand) setFull(true);
  }, [expand]);
  const drag = useRef<{ y: number; dy: number; id: number } | null>(null);
  const [dy, setDy] = useState(0);
  // The drag starts on the top of the sheet (handle, controls strip, title), never on a button
  const onDown = (e: React.PointerEvent) => {
    const t = e.target as Element;
    if (!t.closest('.grab, .c-top, .cp-top') || t.closest('button:not(.grab)')) return;
    drag.current = { y: e.clientY, dy: 0, id: e.pointerId };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current || drag.current.id !== e.pointerId) return;
    drag.current.dy = e.clientY - drag.current.y;
    if (Math.abs(drag.current.dy) > 6) setDy(drag.current.dy);
  };
  const onUp = (e: React.PointerEvent) => {
    if (!drag.current || drag.current.id !== e.pointerId) return;
    const d = drag.current.dy;
    const onGrab = !!document.elementFromPoint(e.clientX, e.clientY - d)?.closest('.grab');
    drag.current = null;
    setDy(0);
    if (Math.abs(d) < 6) {
      if (onGrab) setFull(!full);
      return;
    }
    if (d < -40) {
      if (onFold && folded) onFold(false);
      else setFull(true);
    } else if (d > 40) {
      if (full) setFull(false);
      else if (onFold && !folded) onFold(true);
      else if (!onFold) onClose();
    }
  };
  return (
    <section
      className={`side ${className}${mobile ? ` sheet${full ? ' full' : ''}` : ''}`}
      aria-label={label}
      style={mobile && dy ? { transform: `translateY(${Math.max(-200, dy)}px)`, transition: 'none' } : undefined}
      onPointerDown={mobile ? onDown : undefined}
      onPointerMove={mobile ? onMove : undefined}
      onPointerUp={mobile ? onUp : undefined}
      onPointerCancel={mobile ? () => ((drag.current = null), setDy(0)) : undefined}
    >
      {mobile && (
        <div className="grab" role="button" aria-label={full ? 'Shrink' : 'Expand'}>
          <i />
        </div>
      )}
      {children}
    </section>
  );
}

interface CardProps {
  b: Building;
  starred: boolean;
  mobile: boolean;
  canStep: boolean;
  onPrev(): void;
  onNext(): void;
  onClose(): void;
  onStar(): void;
  /** The user's collections; the star button opens a menu to put the building in any of them */
  collections: Collection[];
  onToggleCol(colId: string): void;
  onCreateCol(name: string): void;
  onBack(): void;
  onSelect(id: string): void;
  onHover(id: string): void;
  /** A tag of the building was clicked: the map shows that category (period, country, exam year, collection) */
  onTag(f: Filters): void;
  /** Filters on and the building among what they show: Previous / Next, the back button and the list follow them */
  group: { label: string; list: Building[] } | null;
  /** Changes when the open building's pin is clicked again: show the whole card from its top */
  detail: number;
  /** Map numbers in use: inside a city (no filter) or 1 to N over what the filters show */
  nums: ReadonlyMap<string, number>;
}

/** Buildings of a filter, city by city: a small city heading, then each building with its map number */
function GroupedList({ list, selectedId, label, nums, onSelect, onHover }: { list: Building[]; selectedId: string; label: string; nums: ReadonlyMap<string, number>; onSelect(id: string): void; onHover(id: string): void }) {
  const rows: React.ReactNode[] = [];
  let last = '';
  for (const x of list) {
    if (x.city !== last) {
      last = x.city;
      rows.push(
        <li key={`c-${x.city}`} className="o-city">
          {x.city}
        </li>,
      );
    }
    rows.push(
      <li key={x.id}>
        <button type="button" className={`o-row${x.id === selectedId ? ' sel' : ''}`} onClick={() => onSelect(x.id)} onPointerEnter={() => onHover(x.id)} onFocus={() => onHover(x.id)}>
          <span className="no" style={{ background: ERAS[x.era].color }}>
            {nums.get(x.id)}
          </span>
          <span className="nm">{x.name}</span>
        </button>
      </li>,
    );
  }
  return (
    <ol className="others" aria-label={label} onPointerLeave={() => onHover('')}>
      {rows}
    </ol>
  );
}

interface ResultsProps {
  label: string;
  /** Numbers of the filtered buildings: 1 to N down the whole list (the map pins show the same) */
  nums: ReadonlyMap<string, number>;
  list: Building[];
  mobile: boolean;
  selectedId: string;
  onSelect(id: string): void;
  onClose(): void;
  onWhole(): void;
  onHover(id: string): void;
}

/** List of what the filters show (like the city list): the card's back button returns here */
export function ResultsPanel({ label, nums, list, mobile, selectedId, onSelect, onClose, onWhole, onHover }: ResultsProps) {
  return (
    <Sheet mobile={mobile} onClose={onClose} className="citypanel" label={label}>
      <div className="cp-top">
        <h2>
          <b className="cp-t">{label}</b>
          <span>{list.length}</span>
        </h2>
        <button type="button" className="c-ic dark" aria-label="Show all of them" title="Show all" onClick={onWhole}>
          <Icon name="fit" size={13} />
        </button>
        <button type="button" className="c-ic dark" aria-label="Close" title="Close (Esc)" onClick={onClose}>
          <Icon name="close" size={12} />
        </button>
      </div>
      <div className="cp-list">
        <GroupedList list={list} selectedId={selectedId} label={label} nums={nums} onSelect={onSelect} onHover={onHover} />
      </div>
    </Sheet>
  );
}

/** Tags of a building: its period, country, TEST-ARCHED years and the user's collections holding it. Each one filters the map. */
function Tags({ b, starred, collections, onTag }: { b: Building; starred: boolean; collections: Collection[]; onTag(f: Filters): void }) {
  const tags: { key: string; label: string; dot?: string; star?: boolean; f: Filters }[] = [
    { key: 'era', label: ERAS[b.era].label, dot: ERAS[b.era].color, f: { ...EMPTY, styles: [b.era] } },
    ...(b.nation ? [{ key: 'nation', label: nationName(b), f: { ...EMPTY, countries: [nationName(b)] } }] : []),
    ...b.exams.map((y) => ({ key: `y${y}`, label: `TEST-ARCHED ${y}`, f: { ...EMPTY, exam: true, examYears: [y] } })),
    ...(starred ? [{ key: 'star', label: 'Starred', star: true, f: { ...EMPTY, starred: true } }] : []),
    ...collections.filter((c) => c.ids.includes(b.id)).map((c) => ({ key: `c${c.id}`, label: c.name, f: { ...EMPTY, col: { id: c.id, name: c.name, ids: c.ids } } })),
  ];
  return (
    <div className="c-tags">
      {tags.map((t) => (
        <button type="button" key={t.key} className="c-tag" title={`Show every building: ${t.label}`} onClick={() => onTag(t.f)}>
          {t.dot && <i style={{ background: t.dot }} />}
          {t.star && <Icon name="starOn" size={12} />}
          <span>{t.label}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * Building card. The controls sit in the coloured title bar (back to the city, previous / next, collect,
 * close); below it, one scrolling column: three English data lines, the summary, the tags, then the other
 * buildings of the city (or the two nearest landmarks) as a folded section, so they never outweigh the building.
 * Phone: a swipe down on the title folds the card to its title, a swipe up unfolds it.
 */
export function BuildingCard({ b, starred, mobile, canStep, onPrev, onNext, onClose, onStar, collections, onToggleCol, onCreateCol, onBack, onSelect, onHover, onTag, group, detail, nums }: CardProps) {
  const city = CITY_BUILDINGS.get(b.city) ?? [];
  const many = city.length > 1;
  const [folded, setFolded] = useState(false);
  const [othersOpen, setOthersOpen] = useState(false);
  const [nearOpen, setNearOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const near = many ? [] : nearest(b, BUILDINGS.filter((x) => x.city !== b.city), 2);
  const kept = starred || collections.some((c) => c.ids.includes(b.id));
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    body.current?.scrollTo({ top: 0 });
  }, [b.id]);
  // The open building's pin clicked again: the whole card, unfolded, from its top
  useEffect(() => {
    if (!detail) return;
    setFolded(false);
    setOthersOpen(false);
    setNearOpen(false);
    body.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [detail]);
  return (
    <Sheet mobile={mobile} onClose={onClose} className={`card${folded ? ' folded' : ''}`} label={b.name} folded={folded} onFold={setFolded} expand={detail}>
      <div
        className="c-top"
        style={{ background: ERAS[b.era].color }}
        onClick={folded ? (e) => !(e.target as Element).closest('button') && setFolded(false) : undefined}
      >
        <div className="c-bar">
          {(many || group) && (
            <button type="button" className="c-back" onClick={onBack} title={group ? `All of ${group.label}` : `All of ${b.city}`}>
              <Icon name="left" size={12} />
              <span className="c-back-t">{group ? group.label : b.city}</span>
            </button>
          )}
          <span className="c-sp" />
          {canStep && (
            <>
              <button type="button" className="c-ic" aria-label="Previous" title="Previous" onClick={onPrev}>
                <Icon name="left" size={13} />
              </button>
              <button type="button" className="c-ic" aria-label="Next" title="Next" onClick={onNext}>
                <Icon name="right" size={13} />
              </button>
            </>
          )}
          <button type="button" className={`c-ic${kept ? ' on' : ''}`} aria-expanded={menu} aria-haspopup="menu" aria-label="Collect" title="Collect" onClick={() => setMenu(!menu)}>
            <Icon name={kept ? 'starOn' : 'star'} size={14} />
          </button>
          <button type="button" className="c-ic" aria-label="Close" title="Close (Esc)" onClick={onClose}>
            <Icon name="close" size={12} />
          </button>
        </div>
        <h1>
          {(many || group) && nums.get(b.id) != null && <span className="c-no">{nums.get(b.id)}</span>}
          <span>{b.name.toUpperCase()}</span>
        </h1>
      </div>
      {menu && <CollectMenu b={b} starred={starred} collections={collections} onStar={onStar} onToggle={onToggleCol} onCreate={onCreateCol} onClose={() => setMenu(false)} />}
      {!folded && (
        <div className="c-scroll" ref={body}>
          <div className="c-body">
            <Facts b={b} exam={false} />
            <Tags b={b} starred={starred} collections={collections} onTag={onTag} />
          </div>
          {group && (
            <div className={`others-box${othersOpen ? ' open' : ''}`}>
              <button type="button" className="others-h" aria-expanded={othersOpen} onClick={() => setOthersOpen(!othersOpen)}>
                <span className="t">Also in {group.label}</span>
                <span className="n">{group.list.length - 1}</span>
                <Icon name="down" size={12} />
              </button>
              {othersOpen && <GroupedList list={group.list} selectedId={b.id} label={group.label} nums={nums} onSelect={onSelect} onHover={onHover} />}
            </div>
          )}
          {!group && many && (
            <div className={`others-box${othersOpen ? ' open' : ''}`}>
              <button type="button" className="others-h" aria-expanded={othersOpen} onClick={() => setOthersOpen(!othersOpen)}>
                <span>Also in {b.city}</span>
                <span className="n">{city.length - 1}</span>
                <Icon name="down" size={12} />
              </button>
              {othersOpen && (
                <ol className="others" aria-label={`Other buildings in ${b.city}`} onPointerLeave={() => onHover('')}>
                  {city
                    .filter((x) => x.id !== b.id)
                    .map((x) => (
                      <li key={x.id}>
                        <button type="button" className="o-row" onClick={() => onSelect(x.id)} onPointerEnter={() => onHover(x.id)} onFocus={() => onHover(x.id)}>
                          <span className="no" style={{ background: ERAS[x.era].color }}>
                            {CITY_NO.get(x.id)}
                          </span>
                          <span className="nm">{x.name}</span>
                        </button>
                      </li>
                    ))}
                </ol>
              )}
            </div>
          )}
          {!group && !many && near.length > 0 && (
            // A city with no other building: the two nearest landmarks and their cities
            <div className={`others-box near${nearOpen ? ' open' : ''}`}>
              <button type="button" className="others-h" aria-expanded={nearOpen} onClick={() => setNearOpen(!nearOpen)}>
                <span>Nearest</span>
                <span className="n">{near.length}</span>
                <Icon name="down" size={12} />
              </button>
              {nearOpen && (
                <ol className="others" aria-label="Nearest buildings" onPointerLeave={() => onHover('')}>
                  {near.map(({ b: x }) => (
                    <li key={x.id}>
                      <button type="button" className="o-row" onClick={() => onSelect(x.id)} onPointerEnter={() => onHover(x.id)} onFocus={() => onHover(x.id)}>
                        <span className="sq" style={{ background: ERAS[x.era].color }} />
                        <span className="nm">
                          {x.name}
                          <em>{x.city}</em>
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}

interface CityProps {
  city: string;
  mobile: boolean;
  selectedId: string;
  onSelect(id: string): void;
  onClose(): void;
  onWhole(): void;
  onHover(id: string): void;
  /** With filters on: only the city's buildings they show, with the filter numbers */
  list?: Building[];
  nums: ReadonlyMap<string, number>;
}

/** City panel: every building of the city with its map number (1 = oldest); with filters on, what they show there */
export function CityPanel({ city, mobile, selectedId, onSelect, onClose, onWhole, onHover, list, nums }: CityProps) {
  const items = list ?? CITY_BUILDINGS.get(city) ?? [];
  const total = items.length;
  return (
    <Sheet mobile={mobile} onClose={onClose} className="citypanel" label={city}>
      <div className="cp-top">
        <h2>
          {city}
          <span>{total}</span>
        </h2>
        <button type="button" className="c-ic dark" aria-label={`Show all of ${city}`} title="Whole city" onClick={onWhole}>
          <Icon name="fit" size={13} />
        </button>
        <button type="button" className="c-ic dark" aria-label="Close" title="Close (Esc)" onClick={onClose}>
          <Icon name="close" size={12} />
        </button>
      </div>
      <ol className="others cp-list" onPointerLeave={() => onHover('')}>
        {items.map((b) => (
          <li key={b.id}>
            <button type="button" className={`o-row${b.id === selectedId ? ' sel' : ''}`} onClick={() => onSelect(b.id)} onPointerEnter={() => onHover(b.id)} onFocus={() => onHover(b.id)}>
              <span className="no" style={{ background: ERAS[b.era].color }}>
                {nums.get(b.id)}
              </span>
              <span className="nm">{b.name}</span>
            </button>
          </li>
        ))}
      </ol>
    </Sheet>
  );
}

/** Star menu: Starred plus every collection, each a check; a new collection takes the building at once */
function CollectMenu({ b, starred, collections, onStar, onToggle, onCreate, onClose }: { b: Building; starred: boolean; collections: Collection[]; onStar(): void; onToggle(id: string): void; onCreate(name: string): void; onClose(): void }) {
  const box = useRef<HTMLDivElement>(null);
  const [name, setName] = useState('');
  useEffect(() => {
    const down = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (box.current && !box.current.contains(t) && !t.closest('[aria-label="Collect"]')) onClose();
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopPropagation(), onClose());
    window.addEventListener('pointerdown', down);
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('keydown', key, true);
    };
  }, [onClose]);
  return (
    <div className="c-menu" role="menu" ref={box} aria-label={`Collect ${b.name}`}>
      <button type="button" role="menuitemcheckbox" aria-checked={starred} className={`cm-row${starred ? ' on' : ''}`} onClick={onStar}>
        <Icon name={starred ? 'starOn' : 'star'} size={14} />
        <span>Starred</span>
      </button>
      {collections.map((c) => {
        const on = c.ids.includes(b.id);
        return (
          <button type="button" role="menuitemcheckbox" aria-checked={on} key={c.id} className={`cm-row${on ? ' on' : ''}`} onClick={() => onToggle(c.id)}>
            <span className="cm-box">{on && <Icon name="check" size={11} />}</span>
            <span>{c.name}</span>
          </button>
        );
      })}
      <form
        className="cm-new"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          onCreate(name);
          setName('');
        }}
      >
        <input value={name} maxLength={40} placeholder="New collection" aria-label="New collection" onChange={(e) => setName(e.target.value)} />
        <button type="submit" className="c-ic" aria-label="Add collection" disabled={!name.trim()}>
          <Icon name="plus" size={13} />
        </button>
      </form>
    </div>
  );
}

'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
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
  /** Card only: a sideways swipe steps to the previous (-1) or next (1) building */
  onStep?(dir: -1 | 1): void;
}

/**
 * Desktop: a panel in the left column of the map. Phone: a bottom sheet.
 * Touch, anywhere on the sheet: the sheet follows the finger up and down and, on release, rests where it was
 * left: full when pulled well up, folded to its title when pushed well down (a phone list as the card: only
 * its X closes it), otherwise normal; once
 * expanded, the content scrolls and a pull down at its top shrinks the sheet. Sideways, the card follows the
 * finger and, past a third of its width, gives way to the previous / next building. Mouse: drag the top.
 */
/** Space between the card and the neighbour's card beside it (phone, sideways swipe) */
const PEEK_GAP = 8;

function Sheet({ mobile, onClose, children, className, label, folded, onFold, expand, onStep }: SheetProps) {
  const [full, setFull] = useState(false);
  useEffect(() => {
    if (expand) setFull(true);
  }, [expand]);
  const box = useRef<HTMLElement>(null);
  const drag = useRef<{ y: number; dy: number; id: number; h: number } | null>(null);
  const [dy, setDy] = useState(0);
  // the state the touch handlers read (they are attached once)
  const now = useRef({ full, folded, onFold, onClose, onStep });
  now.current = { full, folded, onFold, onClose, onStep };

  // Where a vertical swipe or drag of `d` px ends: expand, unfold, shrink, fold or close
  const settle = (d: number) => {
    const { full: f, folded: fo, onFold: of, onClose: oc } = now.current;
    if (d < -40) {
      if (of && fo) of(false);
      else setFull(true);
    } else if (d > 40) {
      if (f) setFull(false);
      else if (of && !fo) of(true);
      else if (!of) oc();
    }
  };

  // Mouse: drag the top of the sheet (handle, controls strip, title), never a button
  const onDown = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    const t = e.target as Element;
    if (!t.closest('.grab, .c-top, .cp-top') || t.closest('button:not(.grab), a')) return;
    drag.current = { y: e.clientY, dy: 0, id: e.pointerId, h: (e.currentTarget as Element).getBoundingClientRect().height };
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
    drag.current = null;
    setDy(0);
    if (Math.abs(d) >= 6) settle(d);
  };

  // Touch: the whole sheet. Native listeners, so a swipe that moves the sheet can stop the page from scrolling.
  // The sheet follows the finger (height up and down, position sideways) by direct style changes, and on release
  // glides to the nearest resting place: folded, normal, full (or closed / the next building)
  const normalH = useRef(0);
  useEffect(() => {
    const el = box.current;
    if (!mobile || !el) return;
    const MS = 240;
    const EASE_OUT = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
    let t: { x: number; y: number; h: number; H: number; W: number; foldH: number; top: number; mode: '' | 'v' | 'h' | 'scroll' } | null = null;
    let busy = 0;
    const scroller = (n: Element | null): Element | null => {
      for (let x = n; x && x !== el; x = x.parentElement) if (x.scrollHeight > x.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(x).overflowY)) return x;
      return null;
    };
    const clear = () => {
      el.style.transition = 'none';
      el.style.height = '';
      el.style.maxHeight = '';
      el.style.transform = '';
      el.style.opacity = '';
      delete el.dataset.swipe;
      requestAnimationFrame(() => requestAnimationFrame(() => (el.style.transition = '')));
    };
    const start = (e: TouchEvent) => {
      if (busy || e.touches.length !== 1 || (e.target as Element).closest('input, textarea')) return (t = null);
      // lists (city, results) keep their own scrolling: only their top moves the sheet; the card answers anywhere
      if (!el.classList.contains('card') && !(e.target as Element).closest('.grab, .c-top, .cp-top')) return (t = null);
      const p = e.touches[0]!;
      const r = el.getBoundingClientRect();
      const H = el.parentElement?.getBoundingClientRect().height ?? window.innerHeight;
      const head = el.querySelector('.c-top, .cp-top')?.getBoundingClientRect();
      // the normal height: as measured when last seen at rest, not expanded and not folded
      if (!now.current.full && !now.current.folded) normalH.current = r.height;
      t = { x: p.clientX, y: p.clientY, h: r.height, H, W: r.width, foldH: head ? head.bottom - r.top : 80, top: scroller(e.target as Element)?.scrollTop ?? 0, mode: '' };
    };
    const move = (e: TouchEvent) => {
      if (!t) return;
      const p = e.touches[0]!;
      const dx = p.clientX - t.x;
      const d = p.clientY - t.y;
      if (!t.mode) {
        if (Math.max(Math.abs(dx), Math.abs(d)) < 8) return;
        if (Math.abs(dx) > Math.abs(d) * 1.5) t.mode = now.current.onStep ? 'h' : 'scroll';
        // expanded: the content scrolls, except a pull down from its very top
        else t.mode = !now.current.full || (d > 0 && t.top <= 0) ? 'v' : 'scroll';
        if (t.mode !== 'scroll') el.style.transition = 'none';
      }
      if (t.mode === 'scroll') return;
      e.preventDefault();
      if (t.mode === 'v') {
        const h = Math.max(Math.min(t.foldH, t.h) * 0.6, Math.min(t.H, t.h - d));
        el.style.maxHeight = '100%';
        el.style.height = `${h}px`;
      } else {
        // the previous / next building's card (beside this one, see .c-peek) comes in with the finger
        el.dataset.swipe = '';
        el.style.transform = `translateX(${dx}px)`;
      }
    };
    const end = (e: TouchEvent) => {
      if (!t) return;
      const g = t;
      t = null;
      const p = e.changedTouches[0]!;
      const dx = p.clientX - g.x;
      const d = p.clientY - g.y;
      if (g.mode === 'v') {
        const { onFold: of, onClose: oc } = now.current;
        const h = Math.max(Math.min(g.foldH, g.h) * 0.6, Math.min(g.H, g.h - d));
        const normal = Math.min(normalH.current || g.H * 0.52, g.H * 0.52);
        // full only when pulled well above the middle; folded / closed only when pushed well below it
        let to: 'full' | 'normal' | 'fold' | 'close' = 'normal';
        if (h > normal + (g.H - normal) * 0.45) to = 'full';
        else if (h < (of ? (normal + g.foldH) / 2 : normal * 0.6)) to = of ? 'fold' : 'close';
        if (to === 'close') {
          clear();
          oc();
          return;
        }
        const px = to === 'full' ? g.H : to === 'fold' ? g.foldH : normal;
        busy = window.setTimeout(() => {
          busy = 0;
          setFull(to === 'full');
          if (of) of(to === 'fold');
          requestAnimationFrame(clear);
        }, MS);
        el.style.transition = `height ${MS}ms ${EASE_OUT}`;
        el.style.height = `${px}px`;
      } else if (g.mode === 'h') {
        const dir = dx < 0 ? 1 : -1;
        if (Math.abs(dx) > g.W / 3) {
          // on with the finger until the neighbour's card stands where this one was, then it becomes the card
          el.style.transition = `transform 200ms ${EASE_OUT}`;
          el.style.transform = `translateX(${-dir * (g.W + PEEK_GAP)}px)`;
          busy = window.setTimeout(() => {
            now.current.onStep?.(dir as -1 | 1);
            requestAnimationFrame(() => {
              busy = 0;
              clear();
            });
          }, 200);
        } else {
          el.style.transition = `transform ${MS}ms ${EASE_OUT}`;
          el.style.transform = 'translateX(0)';
          busy = window.setTimeout(() => {
            busy = 0;
            clear();
          }, MS);
        }
      }
    };
    const cancel = () => {
      t = null;
      if (!busy) clear();
    };
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', cancel);
    return () => {
      el.removeEventListener('touchstart', start);
      el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', end);
      el.removeEventListener('touchcancel', cancel);
      window.clearTimeout(busy);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mobile]);

  return (
    <section
      ref={box}
      className={`side ${className}${mobile ? ` sheet${full ? ' full' : ''}` : ''}`}
      aria-label={label}
      // Dragged down: the sheet slides down. Dragged up: it grows from the bottom edge, which stays put,
      // so nothing opens up under it while the finger moves
      style={
        mobile && dy
          ? dy > 0
            ? { transform: `translateY(${dy}px)`, transition: 'none' }
            : { height: `${(drag.current?.h ?? 0) - dy}px`, maxHeight: '100%', transition: 'none' }
          : undefined
      }
      onPointerDown={mobile ? onDown : undefined}
      onPointerMove={mobile ? onMove : undefined}
      onPointerUp={mobile ? onUp : undefined}
      onPointerCancel={mobile ? () => ((drag.current = null), setDy(0)) : undefined}
    >
      {mobile && (
        <div className="grab" role="button" tabIndex={0} aria-label={full ? 'Shrink' : 'Expand'} onClick={() => (folded && onFold ? onFold(false) : setFull(!full))}>
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
  /** Phone: the previous and next buildings (and whether each is collected), shown beside the card while it is swiped sideways */
  peek?: { prev: Building; next: Building; prevKept: boolean; nextKept: boolean; prevStarred: boolean; nextStarred: boolean };
}

/** Phone: the previous / next building's card, beside the open one, seen while the card is swiped sideways.
 * The same top as the card it will become (back label, photo, arrows, star, close), so nothing moves when it takes over. */
function Peek({ b, side, no, back, kept, starred, collections, others }: { b: Building; side: 'prev' | 'next'; no?: number; back?: string; kept: boolean; starred: boolean; collections: Collection[]; others?: { label: string; n: number } }) {
  return (
    <div className={`c-peek ${side}`} aria-hidden="true">
      <div className="c-top" style={{ background: ERAS[b.era].color }}>
        <div className="c-bar">
          {back != null && (
            <span className="c-back">
              <Icon name="left" size={12} />
              <span className="c-back-t">{back}</span>
            </span>
          )}
          <span className="c-ic c-photo">
            <Icon name="image" size={14} />
            <span className="c-ext">{'\u2197'}</span>
          </span>
          <span className="c-sp" />
          <span className="c-ic">
            <Icon name="left" size={13} />
          </span>
          <span className="c-ic">
            <Icon name="right" size={13} />
          </span>
          <span className="c-ic">
            <Icon name={kept ? 'starOn' : 'star'} size={14} />
          </span>
          <span className="c-ic">
            <Icon name="close" size={12} />
          </span>
        </div>
        <h1>
          {no != null && <span className="c-no">{no}</span>}
          <span>{b.name.toUpperCase()}</span>
        </h1>
      </div>
      <div className="grab">
        <i />
      </div>
      <div className="c-scroll">
        <div className="c-body">
          <Facts b={b} exam={false} onWho={() => {}} />
          <Tags b={b} starred={starred} collections={collections} onTag={() => {}} />
        </div>
        {others && (
          <div className="others-box">
            <span className="others-h">
              <span className="t">Also in {others.label}</span>
              <span className="n">{others.n}</span>
              <Icon name="down" size={12} />
            </span>
          </div>
        )}
      </div>
    </div>
  );
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
/**
 * Phone: a list swiped down folds to its title (the map stays as it is); only its X closes it. A tap on the
 * folded title, or a swipe up, opens it again; another city or list opens unfolded.
 */
function useListFold(key: string) {
  const [folded, setFolded] = useState(false);
  useEffect(() => setFolded(false), [key]);
  const unfold = (e: React.MouseEvent) => folded && !(e.target as Element).closest('button') && setFolded(false);
  return { folded, setFolded, unfold };
}

export function ResultsPanel({ label, nums, list, mobile, selectedId, onSelect, onClose, onWhole, onHover }: ResultsProps) {
  const { folded, setFolded, unfold } = useListFold(label);
  return (
    <Sheet mobile={mobile} onClose={onClose} className={`citypanel${folded ? ' folded' : ''}`} label={label} folded={mobile ? folded : undefined} onFold={mobile ? setFolded : undefined}>
      <div className="cp-top" onClick={unfold}>
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
      {!folded && (
        <div className="cp-list">
          <GroupedList list={list} selectedId={selectedId} label={label} nums={nums} onSelect={onSelect} onHover={onHover} />
        </div>
      )}
    </Sheet>
  );
}

/** Tags of a building: its period, country, TEST-ARCHED (one tag, whatever the year) and the user's collections holding it. Each one filters the map. */
function Tags({ b, starred, collections, onTag }: { b: Building; starred: boolean; collections: Collection[]; onTag(f: Filters): void }) {
  const tags: { key: string; label: string; dot?: string; star?: boolean; f: Filters }[] = [
    { key: 'era', label: ERAS[b.era].label, dot: ERAS[b.era].color, f: { ...EMPTY, styles: [b.era] } },
    ...(b.nation ? [{ key: 'nation', label: nationName(b), f: { ...EMPTY, countries: [nationName(b)] } }] : []),
    ...(b.exams.length ? [{ key: 'exam', label: 'TEST-ARCHED', f: { ...EMPTY, exam: true } }] : []),
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
export function BuildingCard({ b, starred, mobile, canStep, onPrev, onNext, onClose, onStar, collections, onToggleCol, onCreateCol, onBack, onSelect, onHover, onTag, group, detail, nums, peek }: CardProps) {
  const city = CITY_BUILDINGS.get(b.city) ?? [];
  const many = city.length > 1;
  const [folded, setFolded] = useState(false);
  const [othersOpen, setOthersOpen] = useState(false);
  const [nearOpen, setNearOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const near = many ? [] : nearest(b, BUILDINGS.filter((x) => x.city !== b.city), 2);
  const kept = starred || collections.some((c) => c.ids.includes(b.id));
  const body = useRef<HTMLDivElement>(null);
  // Another building picked: a folded card opens again, from its top
  useEffect(() => {
    setFolded(false);
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
    <Sheet mobile={mobile} onClose={onClose} className={`card${folded ? ' folded' : ''}`} label={b.name} folded={folded} onFold={setFolded} expand={detail} onStep={canStep ? (d) => (d > 0 ? onNext() : onPrev()) : undefined}>
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
          {/* photos of the building (Bing image search, new tab): on the left, apart from the card's controls */}
          <a
            className="c-ic c-photo"
            href={`https://www.bing.com/images/search?q=${encodeURIComponent(b.photoQuery || `${b.name} ${b.city}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Photos of ${b.name} (new tab)`}
            title="Photos (new tab)"
          >
            <Icon name="image" size={14} />
            {/* the arrow: this opens another site */}
            <span className="c-ext" aria-hidden="true">
              {'\u2197'}
            </span>
          </a>
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
      {mobile && peek && (
        <>
          {[peek.prev, peek.next].map((x, k) => (
            <Peek
              key={k}
              b={x}
              side={k ? 'next' : 'prev'}
              no={group || (CITY_BUILDINGS.get(x.city)?.length ?? 0) > 1 ? nums.get(x.id) : undefined}
              back={group ? group.label : (CITY_BUILDINGS.get(x.city)?.length ?? 0) > 1 ? x.city : undefined}
              kept={k ? peek.nextKept : peek.prevKept}
              starred={k ? peek.nextStarred : peek.prevStarred}
              collections={collections}
              others={group ? { label: group.label, n: group.list.length - 1 } : (CITY_BUILDINGS.get(x.city)?.length ?? 0) > 1 ? { label: x.city, n: (CITY_BUILDINGS.get(x.city)?.length ?? 1) - 1 } : undefined}
            />
          ))}
        </>
      )}
      {menu && <CollectMenu b={b} starred={starred} collections={collections} onStar={onStar} onToggle={onToggleCol} onCreate={onCreateCol} onClose={() => setMenu(false)} />}
      {!folded && (
        <div className="c-scroll" ref={body}>
          <div className="c-body">
            <Facts b={b} exam={false} onWho={(who) => onTag({ ...EMPTY, who })} />
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
  /** Opened from a merged circle ("Rome area"): its buildings in other cities, listed under Nearest */
  nearby?: Building[];
}

/** City panel: every building of the city with its map number (1 = oldest); with filters on, what they show there */
export function CityPanel({ city, mobile, selectedId, onSelect, onClose, onWhole, onHover, list, nums, nearby }: CityProps) {
  const items = list ?? CITY_BUILDINGS.get(city) ?? [];
  const total = items.length;
  const { folded, setFolded, unfold } = useListFold(city);
  return (
    <Sheet mobile={mobile} onClose={onClose} className={`citypanel${folded ? ' folded' : ''}`} label={city} folded={mobile ? folded : undefined} onFold={mobile ? setFolded : undefined}>
      <div className="cp-top" onClick={unfold}>
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
      {!folded && (
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
          {nearby && nearby.length > 0 && (
            <>
              <li className="o-city o-near">Nearest</li>
              {nearby.map((b, i) => (
                <Fragment key={b.id}>
                  {/* city by city, the closest first */}
                  {(i === 0 || nearby[i - 1]!.city !== b.city) && <li className="o-city o-sub">{b.city}</li>}
                  <li>
                    <button type="button" className={`o-row${b.id === selectedId ? ' sel' : ''}`} onClick={() => onSelect(b.id)} onPointerEnter={() => onHover(b.id)} onFocus={() => onHover(b.id)}>
                      {/* no number: these pins are numbered in their own city, not in this list */}
                      <span className="no no-n" style={{ background: ERAS[b.era].color }} />
                      <span className="nm">{b.name}</span>
                    </button>
                  </li>
                </Fragment>
              ))}
            </>
          )}
        </ol>
      )}
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

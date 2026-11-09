'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Collection } from '../lib/collections';
import { isEmpty, type Filters } from '../lib/filter';
import { COUNTRIES, ERAS, ERA_ORDER, ascii, byStyle, byYear, citiesOf, shortYear, whoOf, type Building } from '../lib/model';
import { load, save } from '../lib/storage';
import type { EraId } from '../lib/types';
import { Icon } from './Icons';

interface Props {
  filters: Filters;
  counts: { styles: Record<EraId, number>; countries: Record<string, number>; examYears: Record<number, number>; exam: number; starred: number };
  results: Building[];
  collections: Collection[];
  selectedId: string;
  onFilters(f: Filters): void;
  onClear(): void;
  onCity(city: string): void;
  onSelect(id: string): void;
  onHoverCity(city: string): void;
}

type Sort = 'style' | 'year';

/** Where the list was left: kept while the filters and the order stay the same, so coming back finds the same place */
let kept: { key: string; top: number } | null = null;

/**
 * The building list, buildings first: what is chosen (one line), the styles (one row, All styles first),
 * the order, the other filters folded under More filters, then every building it gives.
 */
export default function IndexPanel({ filters: f, counts, results, collections, selectedId, onFilters, onClear, onCity, onSelect, onHoverCity }: Props) {
  const [sort, setSortRaw] = useState<Sort>(() => (load<string>('list-sort', 'style') === 'year' ? 'year' : 'style'));
  const setSort = (s: Sort) => {
    save('list-sort', s);
    setSortRaw(s);
  };
  const toggle = <K extends 'styles' | 'countries' | 'examYears'>(key: K, v: Filters[K][number]) => {
    const arr = f[key] as unknown[];
    onFilters({ ...f, [key]: arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v] });
  };
  const active = !isEmpty(f);
  const chipCls = (on: boolean, n: number) => `chip${on ? ' on' : ''}${n === 0 && !on ? ' off' : ''}`;
  // the other filters: how many are on, and whether their box is open (open by itself when one is on)
  const more = f.countries.length + (f.exam ? 1 : 0) + (f.starred ? 1 : 0) + (f.col ? 1 : 0);
  const [moreOpen, setMoreOpen] = useState(false);

  // what is chosen, as removable pills on one line
  const pills: { key: string; label: string; dot?: string; without: Filters }[] = [
    ...f.styles.map((e) => ({ key: `s-${e}`, label: ERAS[e].label, dot: ERAS[e].color, without: { ...f, styles: f.styles.filter((x) => x !== e) } })),
    ...f.countries.map((c) => ({ key: `c-${c}`, label: c, without: { ...f, countries: f.countries.filter((x) => x !== c) } })),
    ...(f.exam ? [{ key: 'exam', label: 'TEST-ARCHED', without: { ...f, exam: false, examYears: [] } }] : []),
    ...(f.starred ? [{ key: 'star', label: 'Starred', without: { ...f, starred: false } }] : []),
    ...(f.col ? [{ key: 'col', label: f.col.name, without: { ...f, col: null } }] : []),
    ...(f.who ? [{ key: 'who', label: f.who, without: { ...f, who: '' } }] : []),
    ...(f.q ? [{ key: 'q', label: `"${f.q}"`, without: { ...f, q: '' } }] : []),
  ];

  const list = [...results].sort(sort === 'style' ? byStyle : byYear);

  // back to where the list was left, when nothing about it changed
  const scroller = useRef<HTMLDivElement>(null);
  const key = JSON.stringify([f, sort]);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && kept && kept.key === key) el.scrollTop = kept.top;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (kept && kept.key !== key) kept = null;
  }, [key]);
  const onScroll = () => {
    if (scroller.current) kept = { key, top: scroller.current.scrollTop };
  };

  const rows: React.ReactNode[] = [];
  let group: EraId | null = null;
  for (const b of list) {
    if (sort === 'style' && b.era !== group) {
      group = b.era;
      const n = list.filter((x) => x.era === b.era).length;
      rows.push(
        <li key={`g-${b.era}`} className="ix-g" aria-hidden="true">
          <i style={{ background: ERAS[b.era].color }} />
          {ERAS[b.era].label}
          <span>{n}</span>
        </li>,
      );
    }
    const who = ascii(whoOf(b));
    rows.push(
      <li key={b.id}>
        <button type="button" className={`ix-row${b.id === selectedId ? ' sel' : ''}`} aria-current={b.id === selectedId} onClick={() => onSelect(b.id)}>
          <i className="sq" style={{ background: ERAS[b.era].color }} />
          <span className="ix-t">
            <b>{b.name}</b>
            <span>
              {b.city}
              {b.built ? ` · ${ascii(shortYear(b.built))}` : ''}
            </span>
            {who && <span className="ix-w">{who}</span>}
          </span>
        </button>
      </li>,
    );
  }

  return (
    <aside className="index ix" aria-label="Buildings">
      <div className="index-scroll" ref={scroller} onScroll={onScroll}>
        <div className="ix-head">
          {pills.length > 0 && (
            <div className="ix-pills" role="group" aria-label="Chosen">
              {pills.map((p) => (
                <span className="pill" key={p.key}>
                  {p.dot && <i style={{ background: p.dot }} />}
                  {p.label}
                  <button type="button" aria-label={`Remove ${p.label}`} onClick={() => onFilters(p.without)}>
                    <Icon name="close" size={10} />
                  </button>
                </span>
              ))}
              <button type="button" className="chip clear ix-clear" onClick={onClear}>
                Clear all
              </button>
            </div>
          )}
          {/* the styles in one row that scrolls sideways; All styles takes the style limit off */}
          <div className="ix-styles" role="group" aria-label="Styles">
            <button type="button" aria-pressed={f.styles.length === 0} className={`chip${f.styles.length === 0 ? ' on' : ''}`} onClick={() => onFilters({ ...f, styles: [] })}>
              All styles
            </button>
            {ERA_ORDER.map((e) => (
              <button type="button" key={e} aria-pressed={f.styles.includes(e)} className={chipCls(f.styles.includes(e), counts.styles[e])} onClick={() => toggle('styles', e)}>
                <i className="sw" style={{ background: ERAS[e].color }} />
                {ERAS[e].label}
                <span className="n">{counts.styles[e]}</span>
              </button>
            ))}
          </div>
          <div className="ix-bar">
            <div className="seg ix-sort" role="radiogroup" aria-label="Order">
              <button type="button" role="radio" aria-checked={sort === 'style'} className={sort === 'style' ? 'on' : ''} onClick={() => setSort('style')}>
                By style
              </button>
              <button type="button" role="radio" aria-checked={sort === 'year'} className={sort === 'year' ? 'on' : ''} onClick={() => setSort('year')}>
                By year
              </button>
            </div>
            <span className="ix-how">{sort === 'style' ? 'Grouped by style · oldest first' : 'Oldest first'}</span>
          </div>
          <button type="button" className="ix-more" aria-expanded={moreOpen} onClick={() => setMoreOpen(!moreOpen)}>
            More filters{more ? ` · ${more}` : ''}
            <Icon name="down" size={12} />
          </button>
          {moreOpen && (
            <div className="ix-more-bd">
              <h3>Country</h3>
              <div className="chips">
                {COUNTRIES.map((c) => (
                  <button type="button" key={c} aria-pressed={f.countries.includes(c)} className={chipCls(f.countries.includes(c), counts.countries[c] ?? 0)} onClick={() => toggle('countries', c)}>
                    {c}
                    <span className="n">{counts.countries[c]}</span>
                  </button>
                ))}
              </div>
              <h3>Exam and mine</h3>
              <div className="chips">
                <button type="button" aria-pressed={f.exam} className={chipCls(f.exam, counts.exam)} onClick={() => onFilters({ ...f, exam: !f.exam, examYears: f.exam ? [] : f.examYears })}>
                  TEST-ARCHED
                  <span className="n">{counts.exam}</span>
                </button>
                <button type="button" aria-pressed={f.starred} aria-label={`Starred ${counts.starred}`} className={chipCls(f.starred, counts.starred)} onClick={() => onFilters({ ...f, starred: !f.starred })}>
                  <Icon name={f.starred ? 'starOn' : 'star'} size={13} />
                  Starred
                  <span className="n">{counts.starred}</span>
                </button>
                {collections.map((c) => {
                  const on = f.col?.id === c.id;
                  return (
                    <button type="button" key={c.id} aria-pressed={on} className={chipCls(on, c.ids.length)} onClick={() => onFilters({ ...f, col: on ? null : { id: c.id, name: c.name, ids: c.ids } })}>
                      {c.name}
                      <span className="n">{c.ids.length}</span>
                    </button>
                  );
                })}
              </div>
              <h3>City</h3>
              <div className="chips" onPointerLeave={() => onHoverCity('')}>
                {citiesOf(results).map(({ city, items }) => (
                  <button type="button" key={city} className="chip" onClick={() => onCity(city)} onPointerEnter={() => onHoverCity(city)} onFocus={() => onHoverCity(city)}>
                    {city}
                    <span className="n">{items.length}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <section className="list">
          {list.length === 0 ? (
            <p className="empty ix-empty">
              No buildings match.{' '}
              {active && (
                <button type="button" className="link" onClick={onClear}>
                  Clear all
                </button>
              )}
            </p>
          ) : (
            <ul className="rows">{rows}</ul>
          )}
        </section>
      </div>
    </aside>
  );
}

export function EraStack({ items, w = 84, h = 6 }: { items: Building[]; w?: number; h?: number }) {
  let x = 0;
  return (
    <svg width={w} height={h} className="stack" aria-hidden="true">
      {ERA_ORDER.map((e) => {
        const n = items.filter((b) => b.era === e).length;
        if (!n) return null;
        const ww = (n / items.length) * w;
        const r = <rect key={e} x={x} width={ww} height={h} fill={ERAS[e].color} />;
        x += ww;
        return r;
      })}
    </svg>
  );
}

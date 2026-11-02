'use client';

import { describe, isEmpty, type Filters } from '../lib/filter';
import { COUNTRIES, ERAS, ERA_ORDER, EXAM_YEARS, citiesOf, type Building } from '../lib/model';
import type { EraId } from '../lib/types';
import { Icon } from './Icons';

export type CitySort = 'year' | 'az' | 'asked';

interface Props {
  filters: Filters;
  counts: { styles: Record<EraId, number>; countries: Record<string, number>; examYears: Record<number, number>; exam: number; starred: number };
  results: Building[];
  city: string;
  cityItems: Building[];
  citySort: CitySort;
  selectedId: string;
  seen: ReadonlySet<string>;
  onFilters(f: Filters): void;
  onClear(): void;
  onCity(city: string): void;
  onLeaveCity(): void;
  onCitySort(s: CitySort): void;
  onSelect(id: string): void;
  onHoverCity(city: string): void;
}

export default function IndexPanel(props: Props) {
  const { filters: f, counts, results, city, cityItems, citySort, selectedId, seen, onFilters, onClear, onCity, onLeaveCity, onCitySort, onSelect, onHoverCity } = props;
  const toggle = <K extends 'styles' | 'countries' | 'examYears'>(key: K, v: Filters[K][number]) => {
    const arr = f[key] as unknown[];
    onFilters({ ...f, [key]: arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v] });
  };
  const active = !isEmpty(f);

  const row = (b: Building) => (
    <li key={b.id}>
      <button type="button" className={`row${b.id === selectedId ? ' sel' : ''}`} aria-current={b.id === selectedId} onClick={() => onSelect(b.id)}>
        <i className="sq" style={{ background: ERAS[b.era].color }} />
        <span className="nm">{b.name}</span>
        {b.exams.length > 0 && <span className="ex" title="Asked in previous years">E</span>}
        <span className={`seen-dot${seen.has(b.id) ? ' on' : ''}`} aria-label={seen.has(b.id) ? 'Seen' : undefined} />
        <span className="yr">{b.yearShort}</span>
      </button>
    </li>
  );

  let list: React.ReactNode;
  if (city) {
    list = (
      <>
        <div className="crumb">
          <button type="button" className="back" aria-label="Back to all cities" onClick={onLeaveCity}>
            <Icon name="left" size={14} />
          </button>
          <b>{city}</b>
          <span className="n">{cityItems.length} buildings</span>
        </div>
        <div className="sorts" role="radiogroup" aria-label="Sort">
          {(
            [
              ['year', 'Oldest first'],
              ['az', 'A to Z'],
              ['asked', 'Asked first'],
            ] as const
          ).map(([k, l]) => (
            <button type="button" key={k} role="radio" aria-checked={citySort === k} className={`chip${citySort === k ? ' on' : ''}`} onClick={() => onCitySort(k)}>
              {l}
            </button>
          ))}
        </div>
        <ul className="rows">{cityItems.map(row)}</ul>
      </>
    );
  } else if (active) {
    list = (
      <>
        <div className="lhead">
          <span>
            {results.length} buildings{describe(f) ? `, ${describe(f)}` : ''}
          </span>
        </div>
        {results.length === 0 ? (
          <p className="empty">No building matches every filter. Remove one of the checked tags or press Clear all.</p>
        ) : (
          <ul className="rows">{results.map(row)}</ul>
        )}
      </>
    );
  } else {
    list = (
      <>
        <div className="lhead">
          <span>Cities</span>
          <span>Most buildings first</span>
        </div>
        <ul className="rows" onPointerLeave={() => onHoverCity('')}>
          {citiesOf(results).map(({ city: c, items }) => (
            <li key={c}>
              <button type="button" className="city" onClick={() => onCity(c)} onPointerEnter={() => onHoverCity(c)} onFocus={() => onHoverCity(c)}>
                <span className="nm">{c}</span>
                <EraStack items={items} />
                <span className="n">{items.length}</span>
              </button>
            </li>
          ))}
        </ul>
      </>
    );
  }

  return (
    <aside className="index" aria-label="Filters and list">
      <div className="index-scroll">
        <section className="sec">
          <h3>
            Style
            {active && (
              <button type="button" className="link" onClick={onClear}>
                Clear all
              </button>
            )}
          </h3>
          <div className="styles">
            {ERA_ORDER.map((e) => (
              <button type="button" key={e} aria-pressed={f.styles.includes(e)} className={`chip${f.styles.includes(e) ? ' on' : ''}${counts.styles[e] === 0 && !f.styles.includes(e) ? ' off' : ''}`} onClick={() => toggle('styles', e)}>
                <i className="sw" style={{ background: ERAS[e].color }} />
                {ERAS[e].label}
                <span className="n">{counts.styles[e]}</span>
              </button>
            ))}
          </div>
        </section>
        <section className="sec">
          <h3>Country</h3>
          <div className="chips">
            {COUNTRIES.map((c) => (
              <button type="button" key={c} aria-pressed={f.countries.includes(c)} className={`chip${f.countries.includes(c) ? ' on' : ''}${counts.countries[c] === 0 && !f.countries.includes(c) ? ' off' : ''}`} onClick={() => toggle('countries', c)}>
                {c}
                <span className="n">{counts.countries[c]}</span>
              </button>
            ))}
          </div>
        </section>
        <section className="sec">
          <button type="button" className="toggle" role="switch" aria-checked={f.exam} onClick={() => onFilters({ ...f, exam: !f.exam, examYears: f.exam ? [] : f.examYears })}>
            <span className={`sw2${f.exam ? ' on' : ''}`}>
              <i />
            </span>
            Asked in previous years
            <span className="n">{counts.exam}</span>
          </button>
          {f.exam && (
            <div className="chips years">
              {EXAM_YEARS.map((y) => (
                <button type="button" key={y} aria-pressed={f.examYears.includes(y)} className={`chip${f.examYears.includes(y) ? ' on' : ''}${counts.examYears[y] === 0 && !f.examYears.includes(y) ? ' off' : ''}`} onClick={() => toggle('examYears', y)}>
                  {y}
                  <span className="n">{counts.examYears[y]}</span>
                </button>
              ))}
            </div>
          )}
          <button type="button" className="toggle" role="switch" aria-checked={f.starred} onClick={() => onFilters({ ...f, starred: !f.starred })}>
            <span className={`sw2${f.starred ? ' on' : ''}`}>
              <i />
            </span>
            Starred
            <span className="n">{counts.starred}</span>
          </button>
          {(f.range || f.q || f.who) && (
            <div className="pills">
              {f.range && <Pill text={`Period: ${describe({ ...f, exam: false, q: '', who: '' })}`} onRemove={() => onFilters({ ...f, range: null })} />}
              {f.who && <Pill text={`Architect: ${f.who}`} onRemove={() => onFilters({ ...f, who: '' })} />}
              {f.q && <Pill text={`Search: ${f.q}`} onRemove={() => onFilters({ ...f, q: '' })} />}
            </div>
          )}
        </section>
        <section className="list">{list}</section>
      </div>
    </aside>
  );
}

function Pill({ text, onRemove }: { text: string; onRemove(): void }) {
  return (
    <span className="pill">
      {text}
      <button type="button" aria-label={`Remove ${text}`} onClick={onRemove}>
        <Icon name="close" size={10} />
      </button>
    </span>
  );
}

export function EraStack({ items, w = 92, h = 7 }: { items: Building[]; w?: number; h?: number }) {
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

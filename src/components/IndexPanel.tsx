'use client';

import { isEmpty, type Filters } from '../lib/filter';
import { COUNTRIES, ERAS, ERA_ORDER, EXAM_YEARS, ascii, citiesOf, shortYear, type Building } from '../lib/model';
import type { EraId } from '../lib/types';
import { Icon } from './Icons';

interface Props {
  filters: Filters;
  counts: { styles: Record<EraId, number>; countries: Record<string, number>; examYears: Record<number, number>; exam: number; starred: number };
  results: Building[];
  selectedId: string;
  onFilters(f: Filters): void;
  onClear(): void;
  onCity(city: string): void;
  onSelect(id: string): void;
  onHoverCity(city: string): void;
}

/** Filters and the list: cities by size, or the matching buildings once a filter is on */
export default function IndexPanel({ filters: f, counts, results, selectedId, onFilters, onClear, onCity, onSelect, onHoverCity }: Props) {
  const toggle = <K extends 'styles' | 'countries' | 'examYears'>(key: K, v: Filters[K][number]) => {
    const arr = f[key] as unknown[];
    onFilters({ ...f, [key]: arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v] });
  };
  const active = !isEmpty(f);
  const chipCls = (on: boolean, n: number) => `chip${on ? ' on' : ''}${n === 0 && !on ? ' off' : ''}`;

  return (
    <aside className="index" aria-label="Filters">
      <div className="index-scroll">
        <section className="sec">
          <div className="styles">
            {ERA_ORDER.map((e) => (
              <button type="button" key={e} aria-pressed={f.styles.includes(e)} className={chipCls(f.styles.includes(e), counts.styles[e])} onClick={() => toggle('styles', e)}>
                <i className="sw" style={{ background: ERAS[e].color }} />
                {ERAS[e].label}
                <span className="n">{counts.styles[e]}</span>
              </button>
            ))}
          </div>
        </section>
        <section className="sec">
          <div className="chips">
            {COUNTRIES.map((c) => (
              <button type="button" key={c} aria-pressed={f.countries.includes(c)} className={chipCls(f.countries.includes(c), counts.countries[c] ?? 0)} onClick={() => toggle('countries', c)}>
                {c}
                <span className="n">{counts.countries[c]}</span>
              </button>
            ))}
          </div>
        </section>
        <section className="sec">
          <div className="chips">
            <button type="button" aria-pressed={f.exam} className={chipCls(f.exam, counts.exam)} onClick={() => onFilters({ ...f, exam: !f.exam, examYears: f.exam ? [] : f.examYears })}>
              TEST-ARCHED
              <span className="n">{counts.exam}</span>
            </button>
            <button type="button" aria-pressed={f.starred} aria-label="Starred" className={chipCls(f.starred, counts.starred)} onClick={() => onFilters({ ...f, starred: !f.starred })}>
              <Icon name={f.starred ? 'starOn' : 'star'} size={13} />
              <span className="n">{counts.starred}</span>
            </button>
          </div>
          {f.exam && (
            <div className="chips years">
              {EXAM_YEARS.map((y) => (
                <button type="button" key={y} aria-pressed={f.examYears.includes(y)} className={chipCls(f.examYears.includes(y), counts.examYears[y] ?? 0)} onClick={() => toggle('examYears', y)}>
                  {y}
                  <span className="n">{counts.examYears[y]}</span>
                </button>
              ))}
            </div>
          )}
          {(f.q || f.who || active) && (
            <div className="pills">
              {f.who && <Pill text={f.who} onRemove={() => onFilters({ ...f, who: '' })} />}
              {f.q && <Pill text={f.q} onRemove={() => onFilters({ ...f, q: '' })} />}
              {active && (
                <button type="button" className="chip clear" onClick={onClear} aria-label="Clear all filters" title="Clear all">
                  <Icon name="close" size={11} />
                </button>
              )}
            </div>
          )}
        </section>
        <section className="list">
          {active ? (
            results.length === 0 ? (
              <p className="empty">0</p>
            ) : (
              <ul className="rows">
                {results.map((b) => (
                  <li key={b.id}>
                    <button type="button" className={`row${b.id === selectedId ? ' sel' : ''}`} aria-current={b.id === selectedId} onClick={() => onSelect(b.id)}>
                      <i className="sq" style={{ background: ERAS[b.era].color }} />
                      <span className="nm">{b.name}</span>
                      <span className="yr">{ascii(shortYear(b.built))}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <ul className="rows" onPointerLeave={() => onHoverCity('')}>
              {citiesOf(results).map(({ city, items }) => (
                <li key={city}>
                  <button type="button" className="city" onClick={() => onCity(city)} onPointerEnter={() => onHoverCity(city)} onFocus={() => onHoverCity(city)}>
                    <span className="nm">{city}</span>
                    <EraStack items={items} />
                    <span className="n">{items.length}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
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

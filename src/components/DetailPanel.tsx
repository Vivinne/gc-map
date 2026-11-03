'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { distance, formatDistance, nearest } from '../lib/geo';
import { BUILDINGS, CITY_BUILDINGS, CITY_NO, ERAS, whoOf, type Building } from '../lib/model';
import { Icon } from './Icons';

type Sort = 'year' | 'near' | 'asked';

interface Props {
  b: Building;
  position: { index: number; total: number; label: string } | null;
  starred: boolean;
  mobile: boolean;
  onPrev(): void;
  onNext(): void;
  onClose(): void;
  onStar(): void;
  onSelect(id: string): void;
  onWholeCity(city: string): void;
  onHover(id: string): void;
}

export function examLine(b: Building): string {
  return b.exams.map((y) => `\u3010${y} TEST-ARCHED\u3011`).join(' ');
}

/**
 * Building card: compact heading and notes, then every building of the same city with the map's
 * numbers (1 = oldest) and the distance from this one. A city with a single building lists the
 * nearest buildings instead.
 */
export default function DetailPanel({ b, position, starred, mobile, onPrev, onNext, onClose, onStar, onSelect, onWholeCity, onHover }: Props) {
  const who = whoOf(b);
  const [sort, setSort] = useState<Sort>('year');
  const [size, setSize] = useState<'peek' | 'full'>('peek');
  const drag = useRef<{ y: number; dy: number } | null>(null);
  const [dy, setDy] = useState(0);
  const listRef = useRef<HTMLOListElement>(null);
  const city = CITY_BUILDINGS.get(b.city) ?? [b];
  const lone = city.length < 2;

  const rows = useMemo(() => {
    const here: [number, number] = [b.lng, b.lat];
    const items = lone ? [b, ...nearest(b, BUILDINGS, 8).map((n) => n.b)] : [...city];
    const withD = items.map((x) => ({ x, d: distance(here, [x.lng, x.lat]) }));
    if (sort === 'near' || lone) withD.sort((p, q) => p.d - q.d);
    else if (sort === 'asked') withD.sort((p, q) => Number(q.x.exams.length > 0) - Number(p.x.exams.length > 0) || (CITY_NO.get(p.x.id) ?? 0) - (CITY_NO.get(q.x.id) ?? 0));
    return withD;
  }, [b, city, lone, sort]);

  useEffect(() => {
    listRef.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [b.id, sort]);

  const sub = [b.year, b.locLabel].filter(Boolean).join(', ').toLowerCase();

  return (
    <section
      className={`detail${mobile ? ` sheet ${size}` : ''}`}
      aria-label={`${b.name} details`}
      style={mobile && dy ? { transform: `translateY(${Math.max(-200, dy)}px)`, transition: 'none' } : undefined}
    >
      <div className="d-head" style={{ background: ERAS[b.era].color }}>
        {mobile && (
          <div
            className="grab"
            role="button"
            aria-label={size === 'peek' ? 'Expand details' : 'Shrink details'}
            onPointerDown={(e) => {
              (e.target as Element).setPointerCapture(e.pointerId);
              drag.current = { y: e.clientY, dy: 0 };
            }}
            onPointerMove={(e) => {
              if (!drag.current) return;
              drag.current.dy = e.clientY - drag.current.y;
              setDy(drag.current.dy);
            }}
            onPointerUp={() => {
              const d = drag.current?.dy ?? 0;
              drag.current = null;
              setDy(0);
              if (Math.abs(d) < 6) setSize(size === 'peek' ? 'full' : 'peek');
              else if (d < -40) setSize('full');
              else if (d > 60) {
                if (size === 'full') setSize('peek');
                else onClose();
              }
            }}
          >
            <i />
          </div>
        )}
        <div className="d-tools">
          <span className="d-chip">{ERAS[b.era].label}</span>
          {position && (
            <span className="d-pos">
              {position.index} of {position.total} {position.label}
            </span>
          )}
          <button type="button" className={starred ? 'on' : ''} aria-pressed={starred} aria-label={starred ? 'Remove star' : 'Star for later'} title="Star (S)" onClick={onStar}>
            <Icon name={starred ? 'starOn' : 'star'} size={14} />
          </button>
          <button type="button" aria-label="Close" title="Close (Esc)" onClick={onClose}>
            <Icon name="close" size={12} />
          </button>
        </div>
        <h1>
          <span className="d-no">{CITY_NO.get(b.id)}</span>
          {b.name.toUpperCase()}
        </h1>
        <p className="d-sub">{sub}</p>
      </div>
      <div className="d-notes">
        {who && <p className="who">{who}</p>}
        {who && <p className="dash">{'\uff0d'}</p>}
        <p className="sum">{b.summary}</p>
        {b.points.length > 1 && <p className="subs">{b.points.map((p) => p.sub).filter(Boolean).join(' / ')}</p>}
        {b.exams.length > 0 && <p className="exam">{examLine(b)}</p>}
      </div>
      <div className="c-head">
        <b>{lone ? 'Nearest' : b.city}</b>
        {!lone && <span className="n">{city.length} buildings</span>}
        {!lone && (
          <button type="button" className="whole" onClick={() => onWholeCity(b.city)} title="Show the whole city">
            <Icon name="fit" size={12} />
            Whole city
          </button>
        )}
      </div>
      {!lone && (
        <div className="c-sort" role="radiogroup" aria-label="Order">
          {(
            [
              ['year', 'By year'],
              ['near', 'Nearest first'],
              ['asked', 'Asked first'],
            ] as const
          ).map(([k, l]) => (
            <button type="button" key={k} role="radio" aria-checked={sort === k} className={`chip${sort === k ? ' on' : ''}`} onClick={() => setSort(k)}>
              {l}
            </button>
          ))}
        </div>
      )}
      <ol className="c-list" ref={listRef} onPointerLeave={() => onHover('')}>
        {rows.map(({ x, d }) => {
          const on = x.id === b.id;
          return (
            <li key={x.id}>
              <button type="button" className={`c-row${on ? ' sel' : ''}`} aria-current={on} onClick={() => onSelect(x.id)} onPointerEnter={() => onHover(x.id)} onFocus={() => onHover(x.id)}>
                <span className="no" style={{ background: ERAS[x.era].color }}>
                  {lone ? '' : CITY_NO.get(x.id)}
                </span>
                <span className="nm">{x.name}</span>
                {x.exams.length > 0 && <span className="ex">E</span>}
                <span className="yr">{x.yearShort}</span>
                <span className="ds">{on ? '' : formatDistance(d)}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="d-foot">
        <button type="button" className="btn" onClick={onPrev} disabled={!position || position.total < 2} aria-label="Previous building">
          <Icon name="left" size={14} />
          {!mobile && <kbd>{'\u2190'}</kbd>}
        </button>
        <button type="button" className="btn dark grow" onClick={onNext} disabled={!position || position.total < 2}>
          Next {position ? position.label : ''}
          {mobile ? <Icon name="right" size={14} /> : <kbd>{'\u2192'}</kbd>}
        </button>
      </div>
    </section>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { CITY_BUILDINGS, CITY_NO, ERAS, type Building } from '../lib/model';
import Facts from './Facts';
import { Icon } from './Icons';

/** Order used by Previous / Next inside a city: the map numbers (oldest first) */
export function cityOrder(city: string): Building[] {
  return CITY_BUILDINGS.get(city) ?? [];
}

/** Compass bearing from a to b in degrees (0 = north, clockwise), on a local flat approximation */
export function bearing(a: Building, b: Building): number {
  const dx = (b.lng - a.lng) * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  const dy = b.lat - a.lat;
  return ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
}

function Arrow({ deg }: { deg: number }) {
  return (
    <svg width={18} height={18} viewBox="0 0 18 18" className="dir" aria-hidden="true" style={{ transform: `rotate(${deg}deg)` }}>
      <path d="M9 15.5V3M4 7.5 9 2.5l5 5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface SheetProps {
  mobile: boolean;
  onClose(): void;
  children: React.ReactNode;
  className: string;
  label: string;
}

/** Desktop: a card at the right of the map. Phone: a bottom sheet that expands by tap or drag on its top edge */
function Sheet({ mobile, onClose, children, className, label }: SheetProps) {
  const [full, setFull] = useState(false);
  const drag = useRef<{ y: number; dy: number } | null>(null);
  const [dy, setDy] = useState(0);
  return (
    <section
      className={`side ${className}${mobile ? ` sheet${full ? ' full' : ''}` : ''}`}
      aria-label={label}
      style={mobile && dy ? { transform: `translateY(${Math.max(-200, dy)}px)`, transition: 'none' } : undefined}
    >
      {mobile && (
        <div
          className="grab"
          role="button"
          aria-label={full ? 'Shrink' : 'Expand'}
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
            if (Math.abs(d) < 6) setFull(!full);
            else if (d < -40) setFull(true);
            else if (d > 60) {
              if (full) setFull(false);
              else onClose();
            }
          }}
        >
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
  onBack(): void;
  onSelect(id: string): void;
  onHover(id: string): void;
}

/**
 * Building card. The controls sit in their own strip above the card, so they never change the layout of
 * the content: number and name, three English data lines, the summary, supplementary notes last.
 * The card folds to its title; the other buildings of the city (number, name, direction) are a folded
 * section at the end, so they never outweigh the building itself.
 */
export function BuildingCard({ b, starred, mobile, canStep, onPrev, onNext, onClose, onStar, onBack, onSelect, onHover }: CardProps) {
  const city = CITY_BUILDINGS.get(b.city) ?? [];
  const many = city.length > 1;
  const [folded, setFolded] = useState(false);
  const [othersOpen, setOthersOpen] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    body.current?.scrollTo({ top: 0 });
  }, [b.id]);
  return (
    <Sheet mobile={mobile} onClose={onClose} className={`card${folded ? ' folded' : ''}`} label={b.name}>
      <div className="c-tools">
        {many && (
          <button type="button" className="c-back" onClick={onBack} title={`All of ${b.city}`}>
            <Icon name="left" size={12} />
            {b.city}
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
        <button type="button" className={`c-ic${starred ? ' on' : ''}`} aria-pressed={starred} aria-label="Star" title="Star" onClick={onStar}>
          <Icon name={starred ? 'starOn' : 'star'} size={14} />
        </button>
        <button type="button" className="c-ic" aria-label={folded ? 'Unfold' : 'Fold'} aria-expanded={!folded} title={folded ? 'Unfold' : 'Fold'} onClick={() => setFolded(!folded)}>
          <Icon name={folded ? 'expand' : 'collapse'} size={12} />
        </button>
        <button type="button" className="c-ic" aria-label="Close" title="Close" onClick={onClose}>
          <Icon name="close" size={12} />
        </button>
      </div>
      <div className="c-top" style={{ background: ERAS[b.era].color }} onClick={folded ? () => setFolded(false) : undefined}>
        <h1>
          {many && <span className="c-no">{CITY_NO.get(b.id)}</span>}
          <span>{b.name.toUpperCase()}</span>
        </h1>
      </div>
      {!folded && (
        <>
          <div className="c-body" ref={body}>
            <Facts b={b} />
          </div>
          {many && (
            <div className={`others-box${othersOpen ? ' open' : ''}`}>
              <button type="button" className="others-h" aria-expanded={othersOpen} onClick={() => setOthersOpen(!othersOpen)}>
                <span>{b.city}</span>
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
                          <Arrow deg={bearing(b, x)} />
                        </button>
                      </li>
                    ))}
                </ol>
              )}
            </div>
          )}
        </>
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
}

/** City panel: every building of the city with its map number (1 = oldest) */
export function CityPanel({ city, mobile, selectedId, onSelect, onClose, onWhole, onHover }: CityProps) {
  const total = CITY_BUILDINGS.get(city)?.length ?? 0;
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
        <button type="button" className="c-ic dark" aria-label="Close" title="Close" onClick={onClose}>
          <Icon name="close" size={12} />
        </button>
      </div>
      <ol className="others cp-list" onPointerLeave={() => onHover('')}>
        {(CITY_BUILDINGS.get(city) ?? []).map((b) => (
          <li key={b.id}>
            <button type="button" className={`o-row${b.id === selectedId ? ' sel' : ''}`} onClick={() => onSelect(b.id)} onPointerEnter={() => onHover(b.id)} onFocus={() => onHover(b.id)}>
              <span className="no" style={{ background: ERAS[b.era].color }}>
                {CITY_NO.get(b.id)}
              </span>
              <span className="nm">{b.name}</span>
            </button>
          </li>
        ))}
      </ol>
    </Sheet>
  );
}

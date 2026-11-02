'use client';

import { useEffect, useRef, useState } from 'react';
import { formatDistance, nearest } from '../lib/geo';
import { BUILDINGS, ERAS, byYear, whoOf, type Building } from '../lib/model';
import { Icon } from './Icons';

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
}

export function examLine(b: Building): string {
  return b.exams.map((y) => `\u3010${y} TEST-ARCHED\u3011`).join(' ');
}

export default function DetailPanel({ b, position, starred, mobile, onPrev, onNext, onClose, onStar, onSelect }: Props) {
  const near = nearest(b, BUILDINGS, 3);
  const nearIds = new Set(near.map((n) => n.b.id));
  const sameStyle = BUILDINGS.filter((x) => x.city === b.city && x.era === b.era && x.id !== b.id && !nearIds.has(x.id)).sort(byYear).slice(0, 3);
  const who = whoOf(b);
  const [size, setSize] = useState<'half' | 'full'>('half');
  const drag = useRef<{ y: number; dy: number } | null>(null);
  const [dy, setDy] = useState(0);
  const body = useRef<HTMLDivElement>(null);

  useEffect(() => {
    body.current?.scrollTo({ top: 0 });
  }, [b.id]);

  const sub = [b.year, b.locLabel].filter(Boolean).join(', ').toLowerCase();
  const head = (
    <div className="d-head" style={{ background: ERAS[b.era].color }}>
      {mobile && (
        <div
          className="grab"
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
            if (Math.abs(d) < 6) setSize(size === 'half' ? 'full' : 'half');
            else if (d < -40) setSize('full');
            else if (d > 60) {
              if (size === 'full') setSize('half');
              else onClose();
            }
          }}
          aria-label={size === 'half' ? 'Expand details' : 'Shrink details'}
          role="button"
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
          <Icon name={starred ? 'starOn' : 'star'} />
        </button>
        <button type="button" aria-label="Close" title="Close (Esc)" onClick={onClose}>
          <Icon name="close" size={14} />
        </button>
      </div>
      <h1>{b.name.toUpperCase()}</h1>
      <p className="d-sub">{sub}</p>
    </div>
  );

  const rel = (x: Building, right: string) => (
    <button type="button" key={x.id} className="rel" onClick={() => onSelect(x.id)}>
      <i style={{ background: ERAS[x.era].color }} />
      <span className="nm">{x.name}</span>
      <span className="yr">{right}</span>
    </button>
  );

  return (
    <section
      className={`detail${mobile ? ` sheet ${size}` : ''}`}
      aria-label={`${b.name} details`}
      style={mobile && dy ? { transform: `translateY(${Math.max(-200, dy)}px)`, transition: 'none' } : undefined}
    >
      {head}
      <div className="d-body" ref={body}>
        <p className="who">{who}</p>
        <p className="dash">{'\uff0d'}</p>
        <p className="sum">{b.summary}</p>
        {b.points.length > 1 && <p className="subs">{b.points.map((p) => p.sub).filter(Boolean).join(' / ')}</p>}
        {b.exams.length > 0 && <p className="exam">{examLine(b)}</p>}
        <div className="relgrp">
          <h4>Nearby</h4>
          {near.map((n) => rel(n.b, formatDistance(n.d)))}
        </div>
        {sameStyle.length > 0 && (
          <div className="relgrp">
            <h4>
              Same style in {b.city}
            </h4>
            {sameStyle.map((x) => rel(x, x.yearShort))}
          </div>
        )}
      </div>
      <div className="d-foot">
        <button type="button" className="btn" onClick={onPrev} disabled={!position || position.total < 2} aria-label="Previous building">
          <Icon name="left" size={14} />
          {!mobile && 'Previous'}
          {!mobile && <kbd>{'\u2190'}</kbd>}
        </button>
        {!mobile && (
          <span className="seenok">
            <Icon name="check" size={14} />
            Seen
          </span>
        )}
        <button type="button" className="btn dark grow" onClick={onNext} disabled={!position || position.total < 2}>
          {mobile && position ? `Next ${position.label}` : 'Next'}
          {mobile ? <Icon name="right" size={14} /> : <kbd>{'\u2192'}</kbd>}
        </button>
      </div>
    </section>
  );
}

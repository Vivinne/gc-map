'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icons';

/** Only one explanation is open at a time */
let closeOther: (() => void) | null = null;

/**
 * A small "i" beside a card title. A click opens a short explanation of that card under it; it stays open
 * (moving the pointer away does not close it) until the "i" or its close button is clicked again, or Esc.
 */
export default function Info({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const me = () => setOpen(false);
    if (closeOther && closeOther !== me) closeOther();
    closeOther = me;
    const key = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopPropagation(), setOpen(false));
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('keydown', key, true);
      if (closeOther === me) closeOther = null;
    };
  }, [open]);
  return (
    <span className="info" ref={box}>
      <button type="button" className={`info-i${open ? ' on' : ''}`} aria-expanded={open} aria-label={`About ${title}`} title={`About ${title}`} onClick={() => setOpen(!open)}>
        i
      </button>
      {open && (
        <div className="info-pop" role="dialog" aria-label={title}>
          <div className="info-h">
            <b>{title}</b>
            <button type="button" aria-label="Close" onClick={() => setOpen(false)}>
              <Icon name="close" size={11} />
            </button>
          </div>
          {children}
        </div>
      )}
    </span>
  );
}

/** Lines of an explanation: a term, then what it means */
export function Terms({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="info-dl">
      {rows.map(([t, d]) => (
        <div key={t}>
          <dt>{t}</dt>
          <dd>{d}</dd>
        </div>
      ))}
    </dl>
  );
}

'use client';

import { Icon } from './Icons';
import { STUDY_ON } from '../lib/features';

/** What the site is for, in one line: the first thing a new visitor reads */
export const GUIDE_LINE = STUDY_ON ? 'Explore key buildings by location, architect and style. Test what you know.' : 'Explore key buildings by location, architect and style.';
/** Said once where the site is described: what it is for, and that it is not the school's own */
export const GUIDE_NOTE = 'A study aid for the Polimi ARCHED General Culture test. Not an official Politecnico di Milano product.';
/** Stored once the guide is hidden (kept for this visit only when the browser cannot store it) */
export const GUIDE_KEY = 'guide-hidden';

interface Props {
  onBrowse(): void;
  onQuick(): void;
  /** Absent in Settings, where the guide is read again and cannot be hidden */
  onHide?(): void;
  className?: string;
}

/** The getting-started card: what the site is for and the two ways to begin (browse, or a quick quiz) */
export default function Guide({ onBrowse, onQuick, onHide, className = '' }: Props) {
  return (
    <section className={`guide ${className}`} aria-label="Getting started">
      <div className="guide-top">
        <p className="guide-t">{GUIDE_LINE}</p>
        {onHide && (
          <button type="button" className="guide-x" onClick={onHide}>
            Hide
          </button>
        )}
      </div>
      <div className="guide-b">
        <button type="button" className="btn dark" onClick={onBrowse}>
          <Icon name="list" size={14} />
          Browse buildings
        </button>
        <button type="button" className="btn" onClick={onQuick}>
          <Icon name="cards" size={14} />
          Quick quiz
        </button>
      </div>
    </section>
  );
}

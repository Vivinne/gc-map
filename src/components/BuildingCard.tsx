'use client';

import { forwardRef } from 'react';
import { ERAS, examNote, type Building } from '../lib/model';
import { architectOf, builtOf, joinDot, keywordsOf, shownStyle } from '../lib/style';
import Panel from './Panel';
import { HeadBar } from './HeadBar';

interface Props {
  b: Building;
  /** Where the card was scrolled when it was left (＜ brings it back) */
  scroll?: number;
  mobile: boolean;
  canBack: boolean;
  onBack(): void;
  onClose(): void;
  /** The architect clicked: a text search for that name */
  onArchitect(name: string): void;
}

/**
 * Building card. Rows 1–2 on the category colour: ＜ and ×, then the name in bold. Below: built span · city,
 * architect · style (the architect searches the site), the summary, the keywords in italics, and last,
 * in small grey italics, the TEST-ARCHED years.
 */
const BuildingCard = forwardRef<HTMLElement, Props>(function BuildingCard({ b, scroll, mobile, canBack, onBack, onClose, onArchitect }, ref) {
  const who = architectOf(b);
  const keys = keywordsOf(b);
  const exam = examNote(b);
  return (
    <Panel
      ref={ref}
      mobile={mobile}
      place="sheet"
      label={b.name}
      className="card"
      resetKey={b.id}
      scroll={scroll}
      head={
        <div className="c-top" style={{ background: ERAS[b.era].color }}>
          <HeadBar canBack={canBack} onBack={onBack} onClose={onClose} />
          <h1>{b.name}</h1>
        </div>
      }
    >
      <div className="c-body">
        <p className="c-line">{joinDot(builtOf(b), b.city)}</p>
        <p className="c-line">
          {who === '-' ? (
            who
          ) : (
            <button type="button" className="c-who" onClick={() => onArchitect(who)}>
              {who}
            </button>
          )}
          {' · '}
          {shownStyle(b)}
        </p>
        {b.summary && <p className="c-sum sum">{b.summary}</p>}
        {keys.length > 0 && (
          <p className="c-keys sum">
            {'\u95dc\u9375\u5b57\uff1a'}
            {keys.map((k, i) => (
              <span key={k.text}>
                {i > 0 && '\u3001'}
                {k.struck ? <s>{k.text}</s> : k.text}
              </span>
            ))}
          </p>
        )}
        {exam && <p className="exam">{exam}</p>}
      </div>
    </Panel>
  );
});

export default BuildingCard;

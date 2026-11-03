'use client';

import { useMemo, useState } from 'react';
import { COUNTRIES, ERAS, byYear, formatYear, type Building } from '../lib/model';

interface Props {
  list: Building[];
  selectedId: string;
  onOpen(id: string): void;
}

type Step = 'century' | 'decade';

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th'}`;

/** Heading for a group: centuries for long spans ("6th century BC", "15th century"), decades for short ones ("1920s") */
function groupOf(y: number, step: Step): { key: number; label: string } {
  if (step === 'decade') {
    const key = Math.floor(y / 10) * 10;
    return { key, label: key < 0 ? `${formatYear(key)}s` : `${key}s` };
  }
  if (y < 0) {
    const c = Math.ceil(-y / 100);
    return { key: -c, label: `${ordinal(c)} century BC` };
  }
  const c = Math.floor(y / 100) + 1;
  return { key: c, label: `${ordinal(c)} century` };
}

/**
 * Phone timeline: one column read top to bottom, oldest first. Buildings sit on a vertical line
 * coloured by style, under sticky period headings with a count, so it scrolls like a list with no
 * sideways movement. The country filter at the top replaces the desktop lanes.
 */
export default function TimelineList({ list, selectedId, onOpen }: Props) {
  const [country, setCountry] = useState('');
  const dated = useMemo(() => list.filter((b) => b.y0 != null && (!country || b.country === country)).sort(byYear), [list, country]);
  const undated = list.length - list.filter((b) => b.y0 != null).length;
  const span = dated.length ? (dated[dated.length - 1]!.y0 as number) - (dated[0]!.y0 as number) : 0;
  const step: Step = span <= 160 ? 'decade' : 'century';

  const groups = useMemo(() => {
    const out: { key: number; label: string; items: Building[] }[] = [];
    for (const b of dated) {
      const g = groupOf(b.y0 as number, step);
      const last = out[out.length - 1];
      if (last && last.key === g.key) last.items.push(b);
      else out.push({ ...g, items: [b] });
    }
    return out;
  }, [dated, step]);

  const counts = useMemo(() => Object.fromEntries(COUNTRIES.map((c) => [c, list.filter((b) => b.y0 != null && b.country === c).length])), [list]);

  return (
    <div className="tlv">
      <div className="tlv-filter" role="radiogroup" aria-label="Country">
        <button type="button" role="radio" aria-checked={!country} className={`chip${!country ? ' on' : ''}`} onClick={() => setCountry('')}>
          All <span className="n">{list.length - undated}</span>
        </button>
        {COUNTRIES.map((c) => (
          <button type="button" key={c} role="radio" aria-checked={country === c} className={`chip${country === c ? ' on' : ''}${counts[c] === 0 ? ' off' : ''}`} onClick={() => setCountry(country === c ? '' : c)}>
            {c === 'United Kingdom' ? 'UK' : c === 'United States' ? 'US' : c}
            <span className="n">{counts[c]}</span>
          </button>
        ))}
      </div>
      <div className="tlv-scroll">
        {groups.map((g) => (
          <section key={g.key} className="tlv-group">
            <h3>
              {g.label}
              <span>{g.items.length}</span>
            </h3>
            <ol>
              {g.items.map((b) => (
                <li key={b.id}>
                  <button type="button" className={`tlv-row${b.id === selectedId ? ' sel' : ''}`} onClick={() => onOpen(b.id)}>
                    <span className="tlv-yr">{b.yearShort}</span>
                    <span className="tlv-spine" style={{ background: ERAS[b.era].color }}>
                      <i style={{ borderColor: ERAS[b.era].color }} />
                    </span>
                    <span className="tlv-tx">
                      <b>{b.name}</b>
                      <em>
                        {b.city}
                        {b.exams.length > 0 && <span className="ex">E</span>}
                      </em>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </section>
        ))}
        {dated.length === 0 && <p className="empty">No building matches every filter. Remove a tag or reset the period band.</p>}
        {undated > 0 && <p className="tlv-note">{undated} without a year are not on the timeline.</p>}
      </div>
    </div>
  );
}

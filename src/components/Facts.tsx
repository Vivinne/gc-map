import { architectOf, hasOtherWorks, keywordsOf, styleOf } from '../lib/keywords';
import { ascii, examNote, whoOf, type Building } from '../lib/model';

/**
 * Body of a building everywhere it appears (card, search preview, review answer): the English data lines
 * (no field labels; the architect in bold), the handout's keywords, the summary, then supplementary notes
 * last in small grey italic. With `onWho`, an architect who has other buildings on the site is a link that
 * lists all of them.
 */
export default function Facts({ b, data = true, summary = true, exam: showExam = true, onWho }: { b: Building; data?: boolean; summary?: boolean; exam?: boolean; onWho?(who: string): void }) {
  const subs = b.points.length > 1 ? b.points.map((p) => ascii(p.sub)).filter(Boolean).join(' / ') : '';
  const exam = showExam ? examNote(b) : '';
  const built = b.built && b.built !== '—' ? ascii(b.built) : '';
  const place = [built, b.city].filter(Boolean).join(', ');
  const who = architectOf(b);
  const keys = keywordsOf(b);
  return (
    <div className="facts">
      {data && (
        <div className="f-data">
          {place && <p>{place}</p>}
          {who && (
            <p>
              {onWho && hasOtherWorks(b) ? (
                <button type="button" className="f-who" title={`Every building by ${who}`} onClick={() => onWho(whoOf(b))}>
                  {who}
                </button>
              ) : (
                <b className="f-who-t">{who}</b>
              )}
            </p>
          )}
          <p>{styleOf(b)}</p>
        </div>
      )}
      {keys.length > 0 && (
        <ul className="f-keys" aria-label="Keywords">
          {keys.map((k) => (
            <li key={k}>{k}</li>
          ))}
        </ul>
      )}
      {summary && b.summary && <p className="f-sum sum">{b.summary}</p>}
      {(subs || exam) && (
        <div className="f-supp">
          {subs && <p>{subs}</p>}
          {exam && <p>{exam}</p>}
        </div>
      )}
    </div>
  );
}

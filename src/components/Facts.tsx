import { ascii, dataLines, examNote, type Building } from '../lib/model';

/**
 * Body of a building everywhere it appears (card, search preview, review answer):
 * the English data lines (no field labels), the summary, then supplementary notes last in small grey italic.
 */
export default function Facts({ b, data = true, summary = true, exam: showExam = true }: { b: Building; data?: boolean; summary?: boolean; exam?: boolean }) {
  const subs = b.points.length > 1 ? b.points.map((p) => ascii(p.sub)).filter(Boolean).join(' / ') : '';
  const exam = showExam ? examNote(b) : '';
  return (
    <div className="facts">
      {data && (
        <div className="f-data">
          {dataLines(b).map((l, i) => (
            <p key={i}>{l}</p>
          ))}
        </div>
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

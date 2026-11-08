'use client';

import { useMemo, useState } from 'react';
import { type Collection } from '../lib/collections';
import { EMPTY, type Filters } from '../lib/filter';
import { STATUSES, STATUS_LABEL, byBuilding, countStatus, perDay, perPair, practiseNext, recent, type Status } from '../lib/mastery';
import { BUILDINGS, BY_ID, COUNTRIES, ERAS, ERA_ORDER, EXAM_YEARS, type Building } from '../lib/model';
import { FIELD_LABEL, PAIRS, splitPair, type Pair, type QuizStore } from '../lib/quiz';
import { Icon } from './Icons';
import Help from './Help';
import { pct, typeLabel, type QuizRequest } from './QuizView';

export interface MeProps {
  mobile: boolean;
  seen: ReadonlySet<string>;
  starred: ReadonlySet<string>;
  collections: Collection[];
  quiz: QuizStore;
  onQuiz(r: Omit<QuizRequest, 'nonce'>): void;
  onMap(f: Filters): void;
  onCreate(name: string): void;
  onRename(id: string, name: string): void;
  onDelete(id: string): void;
  onExport(): void;
  onImport(text: string): void;
}

type Dim = 'style' | 'exam' | 'country' | 'collections' | 'type';
const DIMS: [Dim, string][] = [
  ['style', 'Style'],
  ['exam', 'TEST-ARCHED'],
  ['country', 'Country'],
  ['collections', 'Collections'],
  ['type', 'Type'],
];

interface Row {
  key: string;
  label: string;
  color?: string;
  /** Mastery rows: buildings; type rows: none */
  items?: Building[];
  /** Type rows: right / total answers */
  score?: { right: number; total: number };
  quiz: Omit<QuizRequest, 'nonce'>;
  map?: Filters;
}

const DAY = 86400000;

function fmtDate(t: number): string {
  const d = new Date(t);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** Personal centre: progress tiles, mastery by group, what to practise next, trend, recent quizzes, collections */
export default function MeView(p: MeProps) {
  const { quiz, starred, collections } = p;
  const by = useMemo(() => byBuilding(quiz.log), [quiz.log]);
  const all = useMemo(() => countStatus(BUILDINGS, by), [by]);
  const week = recent(quiz.log, Date.now(), 7 * DAY);
  const tested = BUILDINGS.length - all.untested;
  const [part, setPart] = useState<Part>('overview');

  const tiles = (
    <>
        <Tile n={tested} of={BUILDINGS.length} label="Tested" />
        <Tile n={all.mastered} of={BUILDINGS.length} label="Mastered" />
        {/* a share is shown only from 10 answers on; fewer answers are shown as a plain count */}
        <div className="k">
          <b>{week.total >= 10 ? pct(week.right, week.total) : week.total ? `${week.right}/${week.total}` : '–'}</b>
          <span>{week.total >= 10 ? `Right, last 7 days · ${week.total} answers` : week.total ? 'Right answers, last 7 days' : 'Answers, last 7 days'}</span>
          <div className="k-tr">
            <i style={{ width: week.total >= 10 ? `${(week.right / week.total) * 100}%` : 0 }} />
          </div>
        </div>
    </>
  );
  const device = (
        <div className="me-foot">
          <h2>Another device</h2>
          <span className="note">Stars, collections and quiz results</span>
          <button type="button" className="btn" onClick={p.onExport}>
            <Icon name="download" size={14} />
            Save progress to file
          </button>
          <label className="btn">
            <Icon name="upload" size={14} />
            Load file
            <input
              type="file"
              accept=".json,application/json"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) p.onImport(await f.text());
              }}
            />
          </label>
        </div>
  );

  // Phone: one part at a time, each about a screen high
  if (p.mobile) {
    return (
      <div className="me m">
        <nav className="me-parts" role="tablist" aria-label="Progress">
          {PARTS.map(([k, label]) => (
            <button type="button" role="tab" key={k} aria-selected={part === k} className={part === k ? 'on' : ''} onClick={() => setPart(k)}>
              {label}
            </button>
          ))}
          <Help topic="progress" />
        </nav>
        <div className="me-g">
          {part === 'overview' && (
            <>
              {tiles}
              <PractiseNext {...p} />
            </>
          )}
          {part === 'mastery' && <Mastery {...p} by={by} />}
          {part === 'history' && (
            <>
              <PerDay log={quiz.log} />
              <Recent quiz={quiz} />
            </>
          )}
          {part === 'collections' && (
            <>
              <Collections {...p} />
              {device}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="me">
      <div className="me-g">
        {tiles}
        {/* the things to act on first: mastery, what to practise, collections side by side; history below */}
        <Mastery {...p} by={by} />
        <PractiseNext {...p} />
        <Collections {...p} />
        <Recent quiz={quiz} />
        <PerDay log={quiz.log} />
        {device}
      </div>
    </div>
  );
}

type Part = 'overview' | 'mastery' | 'history' | 'collections';
const PARTS: [Part, string][] = [
  ['overview', 'Overview'],
  ['mastery', 'Mastery'],
  ['history', 'History'],
  ['collections', 'Collections'],
];

function Tile({ n, of, label }: { n: number; of: number; label: string }) {
  return (
    <div className="k">
      <b>
        {n}
        <small>/{of}</small>
      </b>
      <span>{label}</span>
      <div className="k-tr">
        <i style={{ width: `${(n / of) * 100}%` }} />
      </div>
    </div>
  );
}

function Seg({ c }: { c: Record<Status, number> }) {
  return (
    <span className="mt">
      {STATUSES.map((s) => (c[s] ? <i key={s} className={`s-${s}`} style={{ flex: c[s] }} /> : null))}
    </span>
  );
}

function Mastery({ by, mobile, starred, collections, onQuiz, onMap }: MeProps & { by: ReturnType<typeof byBuilding> }) {
  const [dim, setDim] = useState<Dim>('style');
  const [sel, setSel] = useState<Record<Dim, string>>({ style: '', exam: '', country: '', collections: '', type: '' });
  const pairScore = useMemo(() => perPair([...by.values()].flat()), [by]);

  const rows: Row[] = useMemo(() => {
    if (dim === 'style')
      return ERA_ORDER.map((e) => ({ key: e, label: ERAS[e].label, color: ERAS[e].color, items: BUILDINGS.filter((b) => b.eras.includes(e)), quiz: { scope: `era:${e}` }, map: { ...EMPTY, styles: [e] } }));
    if (dim === 'exam')
      return [
        { key: 'exam', label: 'All years', items: BUILDINGS.filter((b) => b.exams.length), quiz: { scope: 'exam' }, map: { ...EMPTY, exam: true } },
        ...EXAM_YEARS.map((y) => ({ key: String(y), label: String(y), items: BUILDINGS.filter((b) => b.exams.includes(y)), quiz: { scope: `year:${y}` }, map: { ...EMPTY, exam: true, examYears: [y] } })),
      ];
    if (dim === 'country')
      return COUNTRIES.map((c) => ({ key: c, label: c, items: BUILDINGS.filter((b) => b.country === c), quiz: { scope: `country:${c}` }, map: { ...EMPTY, countries: [c] } }));
    if (dim === 'collections')
      return [
        { key: 'starred', label: 'Starred', items: BUILDINGS.filter((b) => starred.has(b.id)), quiz: { scope: 'starred' }, map: { ...EMPTY, starred: true } },
        ...collections.map((c) => ({ key: c.id, label: c.name, items: c.ids.map((id) => BY_ID.get(id)).filter((b): b is Building => !!b), quiz: { scope: `col:${c.id}` }, map: { ...EMPTY, col: { id: c.id, name: c.name, ids: c.ids } } })),
      ];
    return PAIRS.map((pr) => ({ key: pr, label: typeLabel(pr), score: pairScore.get(pr) ?? { right: 0, total: 0 }, quiz: { scope: 'all', type: pr } }));
  }, [dim, starred, collections, pairScore]);

  const cur = rows.find((r) => r.key === sel[dim]) ?? rows[0];
  const isType = dim === 'type';

  return (
    <section className="card me-mastery" aria-label="Mastery">
      <div className="hd">
        <h2>Mastery</h2>
        {!mobile && <Help topic="progress" className="hd-help" />}
        <div className="seg" role="tablist">
          {DIMS.map(([d, label]) => (
            <button type="button" role="tab" key={d} aria-selected={dim === d} className={dim === d ? 'on' : ''} onClick={() => setDim(d)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="bd">
        <div className="lg">
          {isType ? (
            <>
              <span><i className="s-mastered" />Right</span>
              <span><i className="s-weak" />Wrong</span>
              <span><i className="s-untested" />No answers</span>
            </>
          ) : (
            STATUSES.map((s) => (
              <span key={s}>
                <i className={`s-${s}`} />
                {STATUS_LABEL[s]}
              </span>
            ))
          )}
        </div>
        <ul className="ms" role="listbox" aria-label="Groups">
          {rows.map((r) => {
            const c = r.items ? countStatus(r.items, by) : null;
            return (
              <li key={r.key} role="option" aria-selected={cur?.key === r.key} className={cur?.key === r.key ? 'on' : ''} onClick={() => setSel({ ...sel, [dim]: r.key })}>
                <span className="ml">
                  {r.color && <i className="sw" style={{ background: r.color }} />}
                  <span>{r.label}</span>
                </span>
                {c ? (
                  <Seg c={c} />
                ) : (
                  <span className="mt">
                    {r.score!.total ? (
                      <>
                        {r.score!.right > 0 && <i className="s-mastered" style={{ flex: r.score!.right }} />}
                        {r.score!.total - r.score!.right > 0 && <i className="s-weak" style={{ flex: r.score!.total - r.score!.right }} />}
                      </>
                    ) : (
                      <i className="s-untested" style={{ flex: 1 }} />
                    )}
                  </span>
                )}
                <span className="mv">
                  {c ? (
                    <>
                      <b>{c.mastered}</b>/{r.items!.length}
                    </>
                  ) : r.score!.total ? (
                    <>
                      <b>{pct(r.score!.right, r.score!.total)}</b>
                    </>
                  ) : (
                    '–'
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="act">
        {cur && (
          <span className="sel">
            {cur.color && <i className="sw" style={{ background: cur.color }} />}
            <span>{cur.label}</span>
            {cur.items && <em>{cur.items.length}</em>}
          </span>
        )}
        {cur?.map && (
          <button type="button" className="btn" disabled={!cur.items?.length} onClick={() => onMap(cur.map!)}>
            <Icon name="map" size={14} />
            Map
          </button>
        )}
        <button type="button" className="btn dark" disabled={!cur || (cur.items ? !cur.items.length : false)} onClick={() => cur && onQuiz(cur.quiz)}>
          Quiz
          <Icon name="right" size={12} />
        </button>
      </div>
    </section>
  );
}

function PractiseNext({ quiz, onQuiz }: MeProps) {
  const weak = useMemo(() => practiseNext(quiz.log, 60), [quiz.log]);
  // Nothing answered wrong: the next step is buildings never asked yet
  const fresh = useMemo(() => {
    if (weak.length) return [];
    const asked = new Set(quiz.log.map((e) => e.id));
    return BUILDINGS.filter((b) => !asked.has(b.id)).slice(0, 10);
  }, [weak.length, quiz.log]);
  const n = weak.length || fresh.length;
  return (
    <section className="card me-next" aria-label="Practise next">
      <div className="hd">
        <h2>Practise next</h2>
        <span className="rt">{n}</span>
      </div>
      <div className="bd">
        <ol className="wk">
          {weak.map(({ b, pair }) => (
            <li key={b.id}>
              <span className="wn">{b.name}</span>
              <span className="wf">{FIELD_LABEL[splitPair(pair)[1]]}</span>
              <span className="wc">{b.city}</span>
            </li>
          ))}
          {fresh.map((b) => (
            <li key={b.id}>
              <span className="wn">{b.name}</span>
              <span className="wc">{b.city}</span>
            </li>
          ))}
        </ol>
      </div>
      <div className="act">
        <button
          type="button"
          className="btn dark wide"
          disabled={!n}
          onClick={() =>
            weak.length
              ? onQuiz({ scope: 'next', extra: { id: 'next', label: 'Practise next', items: weak.map((x) => x.b) }, missed: weak.map((x) => `${x.b.id}|${x.pair}`) })
              : onQuiz({ scope: 'next', type: 'mixed', extra: { id: 'next', label: 'Not tested yet', items: fresh } })
          }
        >
          Quiz these {Math.min(30, n) || ''}
          <Icon name="right" size={12} />
        </button>
      </div>
    </section>
  );
}

const CW = 300;
const CH = 190;
const P = { l: 36, r: 10, t: 16, b: 22 };

function PerDay({ log }: { log: QuizStore['log'] }) {
  const days = useMemo(() => perDay(log, 14), [log]);
  const [hover, setHover] = useState<number | null>(null);
  const iw = CW - P.l - P.r;
  const ih = CH - P.t - P.b;
  const x = (i: number) => P.l + (days.length < 2 ? iw / 2 : (i / (days.length - 1)) * iw);
  const y = (v: number) => P.t + (1 - v) * ih;
  const h = hover != null ? days[hover] : undefined;
  const label = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
  return (
    <section className="card me-day" aria-label="Correct per day">
      <div className="hd">
        <h2>Correct per day</h2>
      </div>
      <div className="bd">
        <div className="rs-chart">
          <svg viewBox={`0 0 ${CW} ${CH}`} width="100%" role="img" aria-label={`Correct per day, ${days.length} days`} onPointerLeave={() => setHover(null)}>
            {[0, 0.5, 1].map((v) => (
              <g key={v}>
                <line x1={P.l} x2={CW - P.r} y1={y(v)} y2={y(v)} className={v === 0 ? 'rs-base' : 'rs-grid'} />
                <text x={P.l - 6} y={y(v) + 3.5} className="rs-ax" textAnchor="end">
                  {v * 100}%
                </text>
              </g>
            ))}
            {hover != null && <line x1={x(hover)} x2={x(hover)} y1={P.t} y2={P.t + ih} className="rs-cross" />}
            {days.length > 1 && <polyline points={days.map((d, i) => `${x(i)},${y(d.right / d.total)}`).join(' ')} className="rs-line" />}
            {days.map((d, i) => (
              <circle key={d.day} cx={x(i)} cy={y(d.right / d.total)} r={hover === i || i === days.length - 1 ? 4.5 : 3} className="rs-dot" />
            ))}
            {/* how many answers each point stands for, as visible as the point itself */}
            {days.map((d, i) => (
              <text key={`n-${d.day}`} x={x(i)} y={y(d.right / d.total) - 9} className="rs-n" textAnchor="middle">
                {d.total}
              </text>
            ))}
            {days.map((d, i) => (
              <rect key={d.day} x={x(i) - Math.max(12, iw / Math.max(1, days.length - 1)) / 2} y={P.t} width={Math.max(12, iw / Math.max(1, days.length - 1))} height={ih} fill="transparent" onPointerEnter={() => setHover(i)} />
            ))}
            {days[0] && (
              <text x={P.l} y={CH - 4} className="rs-ax">
                {label(days[0].day)}
              </text>
            )}
            {days.length > 1 && (
              <text x={CW - P.r} y={CH - 4} className="rs-ax" textAnchor="end">
                {label(days[days.length - 1]!.day)}
              </text>
            )}
          </svg>
          {h && hover != null && (
            <div className="rs-tip" style={{ left: `${(x(hover) / CW) * 100}%` }}>
              <b>{pct(h.right, h.total)}</b> {h.right}/{h.total}
              <span>{label(h.day)}</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function Recent({ quiz }: { quiz: QuizStore }) {
  const [all, setAll] = useState(false);
  const list = [...quiz.history].reverse();
  return (
    <section className="card me-recent" aria-label="Recent quizzes">
      <div className="hd">
        <h2>Recent quizzes</h2>
        {list.length > 5 && (
          <button type="button" className="rt" aria-expanded={all} onClick={() => setAll(!all)}>
            {all ? 'Last 5' : `All ${list.length}`}
          </button>
        )}
      </div>
      <div className="bd">
        <table className="rs-table">
          <tbody>
            {list.slice(0, all ? 200 : 5).map((s) => (
              <tr key={s.t}>
                <td>{fmtDate(s.t)}</td>
                <td>{typeLabel(s.type)}</td>
                <td>{s.scope}</td>
                <td className="num">
                  {s.right}/{s.n}
                  {s.total < s.n && <small className="stop">{s.total} answered</small>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Collections({ starred, collections, onQuiz, onMap, onCreate, onRename, onDelete }: MeProps) {
  const [sel, setSel] = useState('starred');
  const [name, setName] = useState('');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [arming, setArming] = useState(false);
  const rows = [{ id: 'starred', name: 'Starred', n: starred.size, c: null as Collection | null }, ...collections.map((c) => ({ id: c.id, name: c.name, n: c.ids.filter((x) => BY_ID.has(x)).length, c }))];
  const cur = rows.find((r) => r.id === sel) ?? rows[0]!;
  const filters: Filters = cur.c ? { ...EMPTY, col: { id: cur.c.id, name: cur.c.name, ids: cur.c.ids } } : { ...EMPTY, starred: true };
  return (
    <section className="card me-cols" aria-label="Collections">
      <div className="hd">
        <h2>Collections</h2>
      </div>
      <div className="bd">
        <ul className="cl" role="listbox" aria-label="Collections">
          {rows.map((r) => (
            <li key={r.id} role="option" aria-selected={cur.id === r.id} className={cur.id === r.id ? 'on' : ''} onClick={() => { setSel(r.id); setEditing(false); setArming(false); }}>
              {cur.id === r.id && editing && r.c ? (
                <form
                  className="cl-edit"
                  onSubmit={(e) => {
                    e.preventDefault();
                    onRename(r.id, draft);
                    setEditing(false);
                  }}
                >
                  <input autoFocus value={draft} maxLength={40} aria-label="Collection name" onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setEditing(false)} onBlur={() => { onRename(r.id, draft); setEditing(false); }} />
                </form>
              ) : (
                <span className="cn">
                  {!r.c && <Icon name="starOn" size={13} />}
                  <span>{r.name}</span>
                </span>
              )}
              <span className="cc">{r.n}</span>
            </li>
          ))}
        </ul>
        <form
          className="cl-new"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            onCreate(name);
            setName('');
          }}
        >
          <Icon name="plus" size={13} />
          <input value={name} maxLength={40} placeholder="New collection" aria-label="New collection" onChange={(e) => setName(e.target.value)} />
        </form>
      </div>
      <div className="act">
        <span className="sel">
          <span>{cur.name}</span>
        </span>
        {cur.c && (
          <>
            <button type="button" className="c-ic" aria-label="Rename" title="Rename" onClick={() => { setDraft(cur.name); setEditing(true); }}>
              <Icon name="edit" size={13} />
            </button>
            <button
              type="button"
              className={`c-ic${arming ? ' warn' : ''}`}
              aria-label={arming ? `Delete ${cur.name}: click again` : `Delete ${cur.name}`}
              title={arming ? 'Click again' : 'Delete'}
              onBlur={() => setArming(false)}
              onClick={() => {
                if (!arming) return setArming(true);
                onDelete(cur.id);
                setSel('starred');
                setArming(false);
              }}
            >
              <Icon name="trash" size={13} />
            </button>
          </>
        )}
        <button type="button" className="btn sq" aria-label={`Show ${cur.name} on the map`} title="Map" disabled={!cur.n} onClick={() => onMap(filters)}>
          <Icon name="map" size={14} />
        </button>
        <button type="button" className="btn dark" disabled={!cur.n} onClick={() => onQuiz({ scope: cur.c ? `col:${cur.id}` : 'starred' })}>
          Quiz
          <Icon name="right" size={12} />
        </button>
      </div>
    </section>
  );
}

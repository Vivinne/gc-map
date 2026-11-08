'use client';

import { useMemo, useState } from 'react';
import { type Collection } from '../lib/collections';
import { EMPTY, type Filters } from '../lib/filter';
import { byBuilding, recent, statusOf } from '../lib/mastery';
import { BY_ID, type Building } from '../lib/model';
import { QUIZ_BUILDINGS as BUILDINGS, splitPair, valueOf, type LogEntry, type Pair, type QuizStore, type Session } from '../lib/quiz';
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
  /** Take a building out of Starred, or out of one collection */
  onUnstar(id: string): void;
  onRemoveFrom(col: string, id: string): void;
}

const DAY = 86400000;

function fmtDate(t: number): string {
  const d = new Date(t);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

type Part = 'overview' | 'mistakes' | 'history' | 'collections';
const PARTS: [Part, string][] = [
  ['overview', 'Overview'],
  ['mistakes', 'Mistakes'],
  ['history', 'Quiz history'],
  ['collections', 'Collections'],
];

/** The three groups a tile opens: every tested building, the mastered ones, the tested but not mastered ones */
type Group = 'tested' | 'mastered' | 'notyet';
const GROUP_LABEL: Record<Group, string> = { tested: 'Tested', mastered: 'Mastered', notyet: 'Not mastered yet' };
/** What an empty group means */
const EMPTY_LINE: Record<Group, string> = {
  tested: 'No building asked yet. Take a quiz to start.',
  mastered: 'None yet. A building is mastered when it is answered right twice, on two different days.',
  notyet: 'None: every building tested is mastered.',
};

export default function MeView(p: MeProps) {
  const { quiz } = p;
  const [part, setPart] = useState<Part>('overview');
  return (
    <div className={p.mobile ? 'me m' : 'me'}>
      <nav className="me-parts" role="tablist" aria-label="Progress">
        {PARTS.map(([k, label]) => (
          <button type="button" role="tab" key={k} aria-selected={part === k} className={part === k ? 'on' : ''} onClick={() => setPart(k)}>
            {label}
          </button>
        ))}
        <Help topic="progress" />
      </nav>
      <div className="me-pg" key={part}>
        {part === 'overview' && <Overview {...p} />}
        {part === 'mistakes' && <Mistakes quiz={quiz} onQuiz={p.onQuiz} />}
        {part === 'history' && <History quiz={quiz} />}
        {part === 'collections' && <Collections {...p} />}
      </div>
    </div>
  );
}

function Overview({ quiz, onQuiz, onMap }: MeProps) {
  const [open, setOpen] = useState<Group | null>(null);
  const groups = useMemo(() => {
    const by = byBuilding(quiz.log);
    const g: Record<Group, Building[]> = { tested: [], mastered: [], notyet: [] };
    for (const b of BUILDINGS) {
      const st = statusOf(by.get(b.id));
      if (st === 'untested') continue;
      g.tested.push(b);
      (st === 'mastered' ? g.mastered : g.notyet).push(b);
    }
    for (const k of Object.keys(g) as Group[]) g[k].sort((a, b) => a.name.localeCompare(b.name));
    return g;
  }, [quiz.log]);
  const week = recent(quiz.log, Date.now(), 7 * DAY);
  const all = BUILDINGS.length;
  const list = open ? groups[open] : [];
  const tile = (k: Group) => {
    const n = groups[k].length;
    const on = open === k;
    return (
      <button type="button" key={k} className={`k ov-k${on ? ' on' : ''}`} aria-expanded={on} onClick={() => setOpen(on ? null : k)}>
        {/* the tile itself is the button: raised with a frame, pressed in when tapped, black while its list is open */}
        <b>
          {n}
          <small>/{all}</small>
        </b>
        <span>{GROUP_LABEL[k]}</span>
        <div className="k-tr">
          <i style={{ width: `${(n / all) * 100}%` }} />
        </div>
      </button>
    );
  };
  return (
    <>
      <div className="ov-tiles">
        {/* from the whole to the detail: how it goes overall, then what is not known yet, then what is */}
        {/* right answers in the last 7 days: the share, and how many answers it is out of (nothing said twice) */}
        <div className="k ov-acc">
          <b>{week.total ? pct(week.right, week.total) : '\u2013'}</b>
          <span>Accuracy</span>
          <span className="ov-sub">{week.total ? `Last 7 days \u00b7 ${week.total} answers` : 'Last 7 days \u00b7 no answers yet'}</span>
        </div>
        {tile('notyet')}
        {tile('mastered')}
        {tile('tested')}
      </div>
      {open && !list.length && (
        <section className="card ov-list" aria-label={GROUP_LABEL[open]}>
          <div className="hd">
            <h2>{GROUP_LABEL[open]}</h2>
            <span className="ct">0 buildings</span>
          </div>
          <p className="empty">{EMPTY_LINE[open]}</p>
        </section>
      )}
      {open && list.length > 0 && (
        <section className="card ov-list" aria-label={GROUP_LABEL[open]}>
          <div className="hd">
            <h2>{GROUP_LABEL[open]}</h2>
            <span className="ct">{list.length} buildings</span>
            <button type="button" className="btn" onClick={() => onMap({ ...EMPTY, col: { id: `progress-${open}`, name: GROUP_LABEL[open], ids: list.map((b) => b.id) } })}>
              <Icon name="map" size={14} />
              Map
            </button>
            <button type="button" className="btn dark" onClick={() => onQuiz({ scope: `progress-${open}`, type: 'mixed', count: list.length, extra: { id: `progress-${open}`, label: GROUP_LABEL[open], items: list } })}>
              Quiz these {list.length}
              <Icon name="right" size={12} />
            </button>
          </div>
          <table className="ov-t">
            <thead>
              <tr>
                <th>Building</th>
                <th>City</th>
                <th>Architect</th>
                <th>Style</th>
              </tr>
            </thead>
            <tbody>
              {list.map((b) => {
                const who = valueOf(b, 'architect');
                return (
                  <tr key={b.id}>
                    <td>{b.name}</td>
                    <td>{valueOf(b, 'city')}</td>
                    <td className={who ? '' : 'z'}>{who || '\u2014'}</td>
                    <td>{valueOf(b, 'style')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}

/** A question as the quiz shows it: the prompt and the right answer */
function qa(id: string, pair: Pair): { q: string; a: string } | null {
  const b = BY_ID.get(id);
  if (!b) return null;
  const [ask, ans] = splitPair(pair);
  const q = valueOf(b, ask);
  const a = valueOf(b, ans);
  return q && a ? { q, a } : null;
}

function QATable({ rows }: { rows: { key: string; q: string; a: string }[] }) {
  return (
    <table className="qa-t">
      <thead>
        <tr>
          <th>Question</th>
          <th>Answer</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key}>
            <td>{r.q}</td>
            <td>{r.a}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Questions whose last answer was wrong, newest first; a right answer later takes them off */
function Mistakes({ quiz, onQuiz }: { quiz: QuizStore; onQuiz: MeProps['onQuiz'] }) {
  const [exam, setExam] = useState(false);
  const rows = useMemo(
    () =>
      [...quiz.wrong]
        .reverse()
        .map((w) => {
          const [id, pair] = w.split('|') as [string, Pair];
          const b = BY_ID.get(id);
          const x = qa(id, pair);
          return b && x && (!exam || b.exams.length) ? { key: w, ...x, b } : null;
        })
        .filter((r): r is NonNullable<typeof r> => !!r),
    [quiz.wrong, exam],
  );
  const n = Math.min(30, rows.length);
  const examN = BUILDINGS.filter((b) => b.exams.length).length;
  return (
    <>
      <div className="seg ms-seg" role="tablist">
        <button type="button" role="tab" aria-selected={!exam} className={!exam ? 'on' : ''} onClick={() => setExam(false)}>
          All {BUILDINGS.length}
        </button>
        <button type="button" role="tab" aria-selected={exam} className={exam ? 'on' : ''} onClick={() => setExam(true)}>
          TEST-ARCHED {examN}
        </button>
      </div>
      <section className="card ov-list" aria-label="Mistakes">
        <div className="hd">
          <h2>Mistakes</h2>
          <span className="ct">{rows.length} questions</span>
          <button type="button" className="btn dark" disabled={!n} onClick={() => onQuiz({ scope: 'mistakes', extra: { id: 'mistakes', label: 'Mistakes', items: rows.map((r) => r.b) }, missed: rows.map((r) => r.key) })}>
            Quiz these {n || ''}
            <Icon name="right" size={12} />
          </button>
        </div>
        {rows.length ? <QATable rows={rows} /> : <p className="empty">No mistakes</p>}
      </section>
    </>
  );
}

/**
 * The questions of each quiz, from the answer log: a quiz records its answers when it ends, just before
 * the quiz itself, so a quiz's answers are the last `total` entries up to its time and after the quiz before.
 */
function sessionAnswers(history: Session[], log: LogEntry[]): Map<number, LogEntry[]> {
  const out = new Map<number, LogEntry[]>();
  let prev = -Infinity;
  for (const s of history) {
    const mine = log.filter((e) => e.t > prev && e.t <= s.t);
    out.set(s.t, mine.slice(-s.total));
    prev = s.t;
  }
  return out;
}

function History({ quiz }: { quiz: QuizStore }) {
  const [all, setAll] = useState(false);
  const answers = useMemo(() => sessionAnswers(quiz.history, quiz.log), [quiz.history, quiz.log]);
  const list = [...quiz.history].reverse();
  const shown = list.slice(0, all ? 200 : 10);
  if (!list.length) return <p className="empty card">No quizzes yet</p>;
  return (
    <>
      {shown.map((s) => {
        const got = answers.get(s.t) ?? [];
        // older entries may have been dropped from the capped log: then the mistakes are not known
        const known = got.length === s.total;
        const wrong = got
          .filter((e) => !e.ok)
          .map((e, k) => {
            const x = qa(e.id, e.pair);
            return x ? { key: `${e.id}|${e.pair}|${k}`, ...x } : null;
          })
          .filter((r): r is NonNullable<typeof r> => !!r);
        return (
          <section key={s.t} className="card qh">
            <div className="qh-h">
              <span className="d">{fmtDate(s.t)}</span>
              <span className="t">
                {typeLabel(s.type)}
                <small>{s.scope}</small>
              </span>
              <span className="sc">
                {s.right}
                <small>/{s.n}</small>
              </span>
            </div>
            {s.total < s.n && <p className="qh-n">{s.total} of {s.n} answered</p>}
            {s.right === s.total ? <p className="qh-ok">All right</p> : known && wrong.length ? <QATable rows={wrong} /> : null}
          </section>
        );
      })}
      {list.length > 10 && (
        <button type="button" className="btn qh-more" onClick={() => setAll(!all)}>
          {all ? 'Last 10' : `All ${list.length}`}
        </button>
      )}
    </>
  );
}

/**
 * Collections: every collection as a folder (Starred first); a folder opens its own page with the buildings
 * it holds, what to do with them (map, quiz), and its name (rename, delete).
 */
function Collections(p: MeProps) {
  const { starred, collections, onQuiz, onMap, onCreate, onRename, onDelete, onUnstar, onRemoveFrom } = p;
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [arming, setArming] = useState(false);
  const folders = [{ id: 'starred', name: 'Starred', ids: [...starred], c: null as Collection | null }, ...collections.map((c) => ({ id: c.id, name: c.name, ids: c.ids, c }))];
  const cur = open ? folders.find((f) => f.id === open) : null;
  const items = (ids: string[]) => ids.map((id) => BY_ID.get(id)).filter((b): b is Building => !!b);

  if (cur) {
    const list = items(cur.ids).sort((a, b) => a.name.localeCompare(b.name));
    const filters: Filters = cur.c ? { ...EMPTY, col: { id: cur.c.id, name: cur.c.name, ids: cur.c.ids } } : { ...EMPTY, starred: true };
    const back = () => {
      setOpen(null);
      setEditing(false);
      setArming(false);
    };
    return (
      <>
        <button type="button" className="cf-back" onClick={back}>
          <Icon name="left" size={12} />
          Collections
        </button>
        <section className="card cf-page" aria-label={cur.name}>
          <div className="cf-h">
            <div className="cf-t">
              {editing && cur.c ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (draft.trim()) onRename(cur.id, draft);
                    setEditing(false);
                  }}
                >
                  <input autoFocus value={draft} maxLength={40} aria-label="Collection name" onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setEditing(false)} onBlur={() => { if (draft.trim()) onRename(cur.id, draft); setEditing(false); }} />
                </form>
              ) : (
                <h2>
                  {!cur.c && <Icon name="starOn" size={18} />}
                  {cur.name}
                </h2>
              )}
              <div className="cf-sub">
                <span>{list.length} buildings</span>
                {cur.c && !editing && (
                  <button type="button" onClick={() => { setDraft(cur.name); setEditing(true); }}>
                    Rename
                  </button>
                )}
                {cur.c && (
                  <button
                    type="button"
                    className={arming ? 'warn' : ''}
                    onBlur={() => setArming(false)}
                    onClick={() => {
                      if (!arming) return setArming(true);
                      onDelete(cur.id);
                      back();
                    }}
                  >
                    {arming ? 'Delete: click again' : 'Delete'}
                  </button>
                )}
              </div>
            </div>
            <div className="cf-acts">
              <button type="button" className="btn" disabled={!list.length} onClick={() => onMap(filters)}>
                <Icon name="map" size={14} />
                Map
              </button>
              <button type="button" className="btn dark" disabled={!list.length} onClick={() => onQuiz({ scope: cur.c ? `col:${cur.id}` : 'starred', type: 'mixed', count: list.length })}>
                Quiz these {list.length || ''}
                <Icon name="right" size={12} />
              </button>
            </div>
          </div>
          {list.length ? (
            <table className="ov-t cf-t2">
              <thead>
                <tr>
                  <th>Building</th>
                  <th>City</th>
                  <th>Architect</th>
                  <th>Style</th>
                  <th aria-label="Remove" />
                </tr>
              </thead>
              <tbody>
                {list.map((b) => {
                  const who = valueOf(b, 'architect');
                  return (
                    <tr key={b.id}>
                      <td>{b.name}</td>
                      <td>{valueOf(b, 'city')}</td>
                      <td className={who ? '' : 'z'}>{who || '\u2014'}</td>
                      <td>{valueOf(b, 'style')}</td>
                      <td className="cf-x">
                        <button type="button" aria-label={`Remove ${b.name} from ${cur.name}`} title="Remove from this collection" onClick={() => (cur.c ? onRemoveFrom(cur.id, b.id) : onUnstar(b.id))}>
                          <Icon name="close" size={11} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="empty">No buildings yet. Open a building and add it with the star at the top of its card.</p>
          )}
        </section>
      </>
    );
  }

  return (
    <>
      {/* folders in a details view: one row each, name and number of buildings */}
      <section className="card cf-list" aria-label="Collections">
        <div className="cf-row cf-head" aria-hidden="true">
          <span />
          <span>Name</span>
          <span className="cf-n">Buildings</span>
          <span />
        </div>
        {folders.map((f) => (
          <button type="button" key={f.id} className={`cf-row${f.c ? '' : ' star'}`} onClick={() => setOpen(f.id)}>
            <span className="cf-ic" aria-hidden="true" />
            <b>{f.name}</b>
            <span className="cf-n">{items(f.ids).length}</span>
            <Icon name="right" size={12} />
          </button>
        ))}
        {adding ? (
          <form
            className="cf-row cf-new on"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) onCreate(name);
              setName('');
              setAdding(false);
            }}
          >
            <Icon name="plus" size={13} />
            <input autoFocus value={name} maxLength={40} placeholder="Name of the new collection" aria-label="New collection name" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setAdding(false)} onBlur={() => { if (name.trim()) onCreate(name); setName(''); setAdding(false); }} />
          </form>
        ) : (
          <button type="button" className="cf-row cf-new" onClick={() => setAdding(true)}>
            <Icon name="plus" size={13} />
            <span>New collection</span>
          </button>
        )}
      </section>
    </>
  );
}

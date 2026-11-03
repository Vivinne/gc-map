'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { type Collection } from '../lib/collections';
import { BUILDINGS, BY_ID, ERAS, ERA_ORDER, byYear, type Building } from '../lib/model';
import {
  FIELDS,
  FIELD_LABEL,
  PAIRS,
  addSession,
  buildQuiz,
  capacity,
  record,
  splitPair,
  type Field,
  type Pair,
  type PairChoice,
  type Question,
  type QuizStore,
  type Session,
} from '../lib/quiz';
import { load, save } from '../lib/storage';
import { Icon } from './Icons';

export interface MeProps {
  mobile: boolean;
  starred: ReadonlySet<string>;
  collections: Collection[];
  quiz: QuizStore;
  onQuiz(q: QuizStore | ((q: QuizStore) => QuizStore)): void;
  onOpen(id: string): void;
  onShowStarred(): void;
  onShowCollection(c: Collection): void;
  onCreate(name: string): void;
  onRename(id: string, name: string): void;
  onDelete(id: string): void;
  onMove(id: string, by: number): void;
  onToggleIn(colId: string, building: string): void;
  onUnstar(building: string): void;
  onExport(): void;
  onImport(text: string): void;
}

export const COUNTS = [5, 10, 20, 30];

function pct(right: number, total: number): string {
  return total ? `${Math.round((right / total) * 100)}%` : '';
}

export function typeLabel(t: string): string {
  if (t === 'mixed') return 'Mixed';
  if (t === 'missed') return 'Missed';
  const [a, b] = t.split('>') as [Field, Field];
  return FIELD_LABEL[a] && FIELD_LABEL[b] ? `${FIELD_LABEL[a]} → ${FIELD_LABEL[b]}` : t;
}

/** Personal area: the quiz on the left; results and collections on the right */
export default function MeView(props: MeProps) {
  return (
    <div className={`me${props.mobile ? ' m' : ''}`}>
      <QuizPanel {...props} />
      <div className="me-side">
        <Results history={props.quiz.history} />
        <Collections {...props} />
      </div>
    </div>
  );
}

// ---------- quiz ----------

interface Setup {
  type: PairChoice;
  scope: string;
  count: number;
}

interface Answer {
  q: Question;
  picked: string;
}

type Phase = { kind: 'setup' } | { kind: 'run'; qs: Question[]; i: number; answers: Answer[]; missedOnly: boolean } | { kind: 'done'; qs: Question[]; answers: Answer[]; setup: Setup; missedOnly: boolean };

function QuizPanel({ starred, collections, quiz, onQuiz, onOpen }: MeProps) {
  const [setup, setSetupRaw] = useState<Setup>(() => {
    const s = load<Partial<Setup>>('quiz-setup', {});
    const type = s.type === 'mixed' || (PAIRS as string[]).includes(s.type ?? '') ? (s.type as PairChoice) : 'name>city';
    return { type, scope: typeof s.scope === 'string' ? s.scope : 'all', count: COUNTS.includes(s.count ?? 0) ? s.count! : 10 };
  });
  const setSetup = (p: Partial<Setup>) =>
    setSetupRaw((s) => {
      const n = { ...s, ...p };
      save('quiz-setup', n);
      return n;
    });
  const [phase, setPhase] = useState<Phase>({ kind: 'setup' });
  const nextRef = useRef<HTMLButtonElement>(null);

  const scopes = useMemo(() => {
    const list: { id: string; label: string; items: Building[]; color?: string }[] = [
      { id: 'all', label: 'All', items: BUILDINGS },
      { id: 'exam', label: 'TEST-ARCHED', items: BUILDINGS.filter((x) => x.exams.length) },
      { id: 'starred', label: 'Starred', items: BUILDINGS.filter((b) => starred.has(b.id)) },
      ...collections.map((c) => ({ id: `col:${c.id}`, label: c.name, items: c.ids.map((id) => BY_ID.get(id)).filter((b): b is Building => !!b) })),
      ...ERA_ORDER.map((e) => ({ id: `era:${e}`, label: ERAS[e].label, items: BUILDINGS.filter((x) => x.era === e), color: ERAS[e].color })),
    ];
    return list;
  }, [starred, collections]);
  const scope = scopes.find((s) => s.id === setup.scope) ?? scopes[0]!;
  const missedHere = useMemo(() => {
    const ids = new Set(scope.items.map((b) => b.id));
    return quiz.wrong.filter((w) => ids.has(w.split('|')[0]!));
  }, [quiz.wrong, scope]);
  const cap = capacity(scope.items, setup.type);

  const start = (s: Setup, missedOnly = false, missed?: string[]) => {
    const pool = (scopes.find((x) => x.id === s.scope) ?? scopes[0]!).items;
    const qs = buildQuiz(pool, s.type, s.count, BUILDINGS, Math.floor(Math.random() * 1e9), missedOnly ? (missed ?? missedHere) : undefined);
    if (!qs.length) return;
    setPhase({ kind: 'run', qs, i: 0, answers: [], missedOnly });
  };

  const finish = (qs: Question[], answers: Answer[], missedOnly: boolean) => {
    const right = answers.filter((a) => a.picked === a.q.answer).length;
    const session: Session = { t: Date.now(), type: missedOnly ? 'missed' : setup.type, scope: scope.label, n: qs.length, total: answers.length, right };
    onQuiz((q) => addSession(q, session));
    setPhase({ kind: 'done', qs, answers, setup, missedOnly });
  };

  const pick = (opt: string) => {
    if (phase.kind !== 'run') return;
    const q = phase.qs[phase.i]!;
    if (phase.answers.length > phase.i) return;
    onQuiz((s) => record(s, q, opt === q.answer));
    setPhase({ ...phase, answers: [...phase.answers, { q, picked: opt }] });
    window.requestAnimationFrame(() => nextRef.current?.focus());
  };
  const next = () => {
    if (phase.kind !== 'run') return;
    if (phase.i + 1 >= phase.qs.length) finish(phase.qs, phase.answers, phase.missedOnly);
    else setPhase({ ...phase, i: phase.i + 1 });
  };

  // Keys: 1-4 answer, Enter next
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (phase.kind !== 'run' || t?.closest('input, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
      const q = phase.qs[phase.i]!;
      const answered = phase.answers.length > phase.i;
      if (!answered && /^[1-4]$/.test(e.key)) {
        const o = q.options[Number(e.key) - 1];
        if (o) pick(o);
      } else if (answered && e.key === 'Enter' && t?.tagName !== 'BUTTON') next();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (phase.kind === 'run') {
    const q = phase.qs[phase.i]!;
    const ans = phase.answers[phase.i];
    const b = BY_ID.get(q.id)!;
    const [ask, askFor] = splitPair(q.pair);
    const right = phase.answers.filter((a) => a.picked === a.q.answer).length;
    return (
      <section className="me-quiz" aria-label="Quiz">
        <div className="qz-bar">
          <span className="qz-count">
            <b>{phase.i + 1}</b>/{phase.qs.length}
          </span>
          <div className="qz-track" aria-hidden>
            {phase.qs.map((x, k) => {
              const a = phase.answers[k];
              return <i key={k} className={a ? (a.picked === a.q.answer ? 'ok' : 'no') : k === phase.i ? 'cur' : ''} />;
            })}
          </div>
          <span className="qz-right">{right}</span>
          <button type="button" className="c-ic" aria-label="Restart" title="Restart" onClick={() => start(setup, phase.missedOnly, phase.missedOnly ? phase.qs.map((x) => `${x.id}|${x.pair}`) : undefined)}>
            <Icon name="undo" size={14} />
          </button>
          <button type="button" className="c-ic" aria-label="End" title="End" onClick={() => (phase.answers.length ? finish(phase.qs, phase.answers, phase.missedOnly) : setPhase({ kind: 'setup' }))}>
            <Icon name="close" size={13} />
          </button>
        </div>
        <div className="qz-card">
          <div className="qz-k">
            <span>{FIELD_LABEL[ask]}</span>
            <Icon name="right" size={10} />
            <span>{FIELD_LABEL[askFor]}</span>
          </div>
          <div className="qz-p" style={{ borderColor: ERAS[b.era].color }}>
            {q.prompt}
          </div>
          <ol className="qz-opts">
            {q.options.map((o, i) => {
              const cls = ans ? (o === q.answer ? ' ok' : o === ans.picked ? ' no' : ' dim') : '';
              return (
                <li key={o}>
                  <button type="button" className={`qz-o${cls}`} disabled={!!ans && o !== q.answer && o !== ans.picked} onClick={() => pick(o)}>
                    <span className="qz-i">{i + 1}</span>
                    <span>{o}</span>
                    {ans && o === q.answer && <Icon name="check" size={14} />}
                  </button>
                </li>
              );
            })}
          </ol>
          {ans && (
            <div className="qz-after">
              <button type="button" className="qz-b" onClick={() => onOpen(b.id)}>
                <i className="sw" style={{ background: ERAS[b.era].color }} />
                <span>{b.name}</span>
                <Icon name="map" size={14} />
              </button>
              <button type="button" className="btn dark" ref={nextRef} onClick={next}>
                {phase.i + 1 >= phase.qs.length ? 'Result' : 'Next'}
                <Icon name="right" size={13} />
              </button>
            </div>
          )}
        </div>
      </section>
    );
  }

  if (phase.kind === 'done') {
    const right = phase.answers.filter((a) => a.picked === a.q.answer).length;
    const missed = phase.answers.filter((a) => a.picked !== a.q.answer);
    return (
      <section className="me-quiz" aria-label="Quiz result">
        <div className="qz-res">
          <div className="qz-score">
            <b>{right}</b>
            <span>/{phase.answers.length}</span>
          </div>
          <div className="qz-pct">{pct(right, phase.answers.length)}</div>
          <div className="qz-meta">
            {phase.missedOnly ? 'Missed' : typeLabel(phase.setup.type)} · {scope.label}
            {phase.answers.length < phase.qs.length && ` · ${phase.answers.length}/${phase.qs.length}`}
          </div>
        </div>
        {missed.length > 0 && (
          <ol className="qz-miss">
            {missed.map(({ q, picked }) => {
              const b = BY_ID.get(q.id)!;
              return (
                <li key={`${q.id}|${q.pair}`}>
                  <button type="button" onClick={() => onOpen(q.id)}>
                    <i className="sw" style={{ background: ERAS[b.era].color }} />
                    <span className="pr">{q.prompt}</span>
                    <span className="an">{q.answer}</span>
                    <s>{picked}</s>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
        <div className="qz-acts">
          <button type="button" className="btn dark" onClick={() => start(phase.setup, phase.missedOnly, phase.missedOnly ? phase.qs.map((x) => `${x.id}|${x.pair}`) : undefined)}>
            <Icon name="undo" size={14} />
            Again
          </button>
          {missed.length > 0 && (
            <button type="button" className="btn" onClick={() => start(phase.setup, true, missed.map((a) => `${a.q.id}|${a.q.pair}`))}>
              Missed only
              <span className="n">{missed.length}</span>
            </button>
          )}
          <button type="button" className="btn" onClick={() => setPhase({ kind: 'setup' })}>
            New quiz
          </button>
        </div>
      </section>
    );
  }

  // ---------- set-up ----------
  return (
    <section className="me-quiz" aria-label="Quiz set-up">
      <div className="qz-row">
        <h3>Type</h3>
        <div className="qz-set">
          <div className="qz-grid" role="grid" aria-label="Shown and asked">
            <span className="qz-corner">
              ? <Icon name="right" size={10} />
            </span>
            {FIELDS.map((f) => (
              <span key={f} className="qz-h">
                {FIELD_LABEL[f]}
              </span>
            ))}
            {FIELDS.map((a) => (
              <div key={a} className="qz-r" role="row">
                <span className="qz-h row">{FIELD_LABEL[a]}</span>
                {FIELDS.map((c) => {
                  if (a === c) return <span key={c} className="qz-x" />;
                  const p = `${a}>${c}` as Pair;
                  const sc = quiz.score[p];
                  return (
                    <button type="button" key={c} className={`qz-c${setup.type === p ? ' on' : ''}`} aria-pressed={setup.type === p} aria-label={`${FIELD_LABEL[a]} to ${FIELD_LABEL[c]}`} onClick={() => setSetup({ type: p })}>
                      {sc ? pct(sc.right, sc.total) : ''}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          <button type="button" className={`chip qz-mix${setup.type === 'mixed' ? ' on' : ''}`} aria-pressed={setup.type === 'mixed'} onClick={() => setSetup({ type: 'mixed' })}>
            Mixed
          </button>
        </div>
      </div>
      <div className="qz-row">
        <h3>Scope</h3>
        <div className="chips qz-scope">
          {scopes.map((s) => (
            <button type="button" key={s.id} className={`chip${scope.id === s.id ? ' on' : ''}${s.items.length === 0 ? ' off' : ''}`} aria-pressed={scope.id === s.id} onClick={() => setSetup({ scope: s.id })}>
              {s.color && <i className="sw" style={{ background: s.color }} />}
              {s.id === 'starred' ? <Icon name={scope.id === s.id ? 'starOn' : 'star'} size={13} /> : null}
              {s.id === 'starred' ? null : s.label}
              <span className="n">{s.items.length}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="qz-row">
        <h3>Questions</h3>
        <div className="chips">
          {COUNTS.map((n) => (
            <button type="button" key={n} className={`chip qz-n${setup.count === n ? ' on' : ''}${n > cap ? ' off' : ''}`} aria-pressed={setup.count === n} onClick={() => setSetup({ count: n })}>
              {n}
            </button>
          ))}
        </div>
      </div>
      <div className="qz-go">
        <button type="button" className="btn dark qz-start" disabled={!cap} onClick={() => start(setup)}>
          Start
          <span className="n">{Math.min(setup.count, cap)}</span>
        </button>
        <button type="button" className="btn" disabled={!missedHere.length} onClick={() => start(setup, true)}>
          Missed
          <span className="n">{missedHere.length}</span>
        </button>
      </div>
    </section>
  );
}

// ---------- results ----------

const CW = 328;
const CH = 132;
const PAD = { l: 34, r: 8, t: 10, b: 20 };

function fmtDate(t: number): string {
  const d = new Date(t);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Past quizzes: totals, accuracy per quiz (line), accuracy per type (bars), last quizzes (table) */
function Results({ history }: { history: Session[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [tab, setTab] = useState<'chart' | 'table'>('chart');
  const last = history.slice(-30);
  const answered = history.reduce((n, s) => n + s.total, 0);
  const right = history.reduce((n, s) => n + s.right, 0);
  const byType = useMemo(() => {
    const m = new Map<string, { right: number; total: number }>();
    for (const s of history) {
      const c = m.get(s.type) ?? { right: 0, total: 0 };
      m.set(s.type, { right: c.right + s.right, total: c.total + s.total });
    }
    return [...m.entries()].sort((a, b) => b[1].total - a[1].total);
  }, [history]);

  if (!history.length) {
    return (
      <section className="me-res" aria-label="Results">
        <div className="rs-tiles">
          <div><b>0</b><span>quizzes</span></div>
        </div>
      </section>
    );
  }

  const iw = CW - PAD.l - PAD.r;
  const ih = CH - PAD.t - PAD.b;
  const x = (i: number) => PAD.l + (last.length === 1 ? iw / 2 : (i / (last.length - 1)) * iw);
  const y = (v: number) => PAD.t + (1 - v) * ih;
  const pts = last.map((s, i) => [x(i), y(s.right / s.total)] as const);
  const h = hover != null ? last[hover] : undefined;

  return (
    <section className="me-res" aria-label="Results">
      <div className="rs-tiles">
        <div><b>{history.length}</b><span>quizzes</span></div>
        <div><b>{answered}</b><span>questions</span></div>
        <div><b>{pct(right, answered)}</b><span>correct</span></div>
      </div>
      <div className="rs-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'chart'} className={tab === 'chart' ? 'on' : ''} onClick={() => setTab('chart')}>Chart</button>
        <button type="button" role="tab" aria-selected={tab === 'table'} className={tab === 'table' ? 'on' : ''} onClick={() => setTab('table')}>Table</button>
      </div>
      {tab === 'chart' ? (
        <>
          <div className="rs-h">Correct per quiz</div>
          <div className="rs-chart">
            <svg viewBox={`0 0 ${CW} ${CH}`} width="100%" role="img" aria-label={`Correct per quiz, last ${last.length} quizzes`} onPointerLeave={() => setHover(null)}>
              {[0, 0.5, 1].map((v) => (
                <g key={v}>
                  <line x1={PAD.l} x2={CW - PAD.r} y1={y(v)} y2={y(v)} className={v === 0 ? 'rs-base' : 'rs-grid'} />
                  <text x={PAD.l - 6} y={y(v) + 4} className="rs-ax" textAnchor="end">{v * 100}%</text>
                </g>
              ))}
              {hover != null && <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={PAD.t + ih} className="rs-cross" />}
              {pts.length > 1 && <polyline points={pts.map((p) => p.join(',')).join(' ')} className="rs-line" />}
              {pts.map(([px, py], i) => (
                <circle key={i} cx={px} cy={py} r={hover === i ? 5 : 4} className="rs-dot" />
              ))}
              {last.map((_, i) => (
                <rect key={i} x={x(i) - iw / Math.max(1, last.length - 1) / 2} y={PAD.t} width={Math.max(12, iw / Math.max(1, last.length - 1))} height={ih} fill="transparent" onPointerEnter={() => setHover(i)} />
              ))}
              <text x={PAD.l} y={CH - 4} className="rs-ax">{fmtDate(last[0]!.t)}</text>
              {last.length > 1 && <text x={CW - PAD.r} y={CH - 4} className="rs-ax" textAnchor="end">{fmtDate(last[last.length - 1]!.t)}</text>}
            </svg>
            {h && hover != null && (
              <div className="rs-tip" style={{ left: `${(x(hover) / CW) * 100}%` }}>
                <b>{pct(h.right, h.total)}</b> {h.right}/{h.total}
                <span>{typeLabel(h.type)} · {h.scope}</span>
                <span>{fmtDate(h.t)}</span>
              </div>
            )}
          </div>
          <div className="rs-h">Correct by type</div>
          <ul className="rs-bars">
            {byType.map(([t, s]) => (
              <li key={t} title={`${s.right}/${s.total}`}>
                <span className="lb">{typeLabel(t)}</span>
                <span className="tr"><i style={{ width: `${(s.right / s.total) * 100}%` }} /></span>
                <span className="v">{pct(s.right, s.total)}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <table className="rs-table">
          <thead>
            <tr><th>Date</th><th>Type</th><th>Scope</th><th className="num">Score</th></tr>
          </thead>
          <tbody>
            {[...history].reverse().slice(0, 50).map((s) => (
              <tr key={s.t}>
                <td>{fmtDate(s.t)}</td>
                <td>{typeLabel(s.type)}</td>
                <td>{s.scope}</td>
                <td className="num">{s.right}/{s.total} <b>{pct(s.right, s.total)}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

// ---------- collections ----------

function Collections({ starred, collections, onOpen, onShowStarred, onShowCollection, onCreate, onRename, onDelete, onMove, onToggleIn, onUnstar, onExport, onImport }: MeProps) {
  const [open, setOpen] = useState<string>('');
  const [editing, setEditing] = useState('');
  const [draft, setDraft] = useState('');
  const [arming, setArming] = useState('');
  const [name, setName] = useState('');
  const file = useRef<HTMLInputElement>(null);

  const starList = useMemo(() => BUILDINGS.filter((b) => starred.has(b.id)).sort(byYear), [starred]);

  const list = (ids: Building[], onRemove: (id: string) => void) => (
    <ol className="col-list">
      {ids.map((b) => (
        <li key={b.id}>
          <button type="button" className="col-b" onClick={() => onOpen(b.id)}>
            <i className="sw" style={{ background: ERAS[b.era].color }} />
            <span className="nm">{b.name}</span>
            <span className="ct">{b.city}</span>
          </button>
          <button type="button" className="c-ic" aria-label={`Remove ${b.name}`} title="Remove" onClick={() => onRemove(b.id)}>
            <Icon name="close" size={11} />
          </button>
        </li>
      ))}
    </ol>
  );

  const add = () => {
    if (!name.trim()) return;
    onCreate(name);
    setName('');
  };

  return (
    <section className="me-cols" aria-label="Collections">
      <ul className="cols">
        <li className={`col${open === '*' ? ' open' : ''}`}>
          <div className="col-h">
            <button type="button" className="col-name" aria-expanded={open === '*'} onClick={() => setOpen(open === '*' ? '' : '*')}>
              <Icon name="starOn" size={14} />
              <span>Starred</span>
              <span className="n">{starred.size}</span>
            </button>
            <button type="button" className="c-ic" aria-label="Show Starred on the map" title="Map" disabled={!starred.size} onClick={onShowStarred}>
              <Icon name="map" size={14} />
            </button>
          </div>
          {open === '*' && list(starList, onUnstar)}
        </li>
        {collections.map((c, i) => {
          const items = c.ids.map((id) => BY_ID.get(id)).filter((b): b is Building => !!b);
          return (
            <li key={c.id} className={`col${open === c.id ? ' open' : ''}`}>
              <div className="col-h">
                {editing === c.id ? (
                  <form
                    className="col-edit"
                    onSubmit={(e) => {
                      e.preventDefault();
                      onRename(c.id, draft);
                      setEditing('');
                    }}
                  >
                    <input
                      autoFocus
                      value={draft}
                      maxLength={40}
                      aria-label="Collection name"
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => e.key === 'Escape' && setEditing('')}
                      onBlur={() => {
                        onRename(c.id, draft);
                        setEditing('');
                      }}
                    />
                  </form>
                ) : (
                  <button type="button" className="col-name" aria-expanded={open === c.id} onClick={() => setOpen(open === c.id ? '' : c.id)} onDoubleClick={() => { setEditing(c.id); setDraft(c.name); }}>
                    <span>{c.name}</span>
                    <span className="n">{items.length}</span>
                  </button>
                )}
                <button type="button" className="c-ic" aria-label={`Show ${c.name} on the map`} title="Map" disabled={!items.length} onClick={() => onShowCollection(c)}>
                  <Icon name="map" size={14} />
                </button>
                {open === c.id && (
                  <>
                    <button type="button" className="c-ic" aria-label="Move up" title="Up" disabled={i === 0} onClick={() => onMove(c.id, -1)}>
                      <Icon name="up" size={12} />
                    </button>
                    <button type="button" className="c-ic" aria-label="Rename" title="Rename" onClick={() => { setEditing(c.id); setDraft(c.name); }}>
                      <Icon name="edit" size={13} />
                    </button>
                    <button
                      type="button"
                      className={`c-ic${arming === c.id ? ' warn' : ''}`}
                      aria-label={arming === c.id ? `Delete ${c.name}: click again` : `Delete ${c.name}`}
                      title={arming === c.id ? 'Click again' : 'Delete'}
                      onBlur={() => setArming('')}
                      onClick={() => {
                        if (arming === c.id) {
                          onDelete(c.id);
                          setArming('');
                        } else setArming(c.id);
                      }}
                    >
                      <Icon name="trash" size={13} />
                    </button>
                  </>
                )}
              </div>
              {open === c.id && list(items, (id) => onToggleIn(c.id, id))}
            </li>
          );
        })}
      </ul>
      <form
        className="col-new"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input value={name} maxLength={40} placeholder="New collection" aria-label="New collection" onChange={(e) => setName(e.target.value)} />
        <button type="submit" className="c-ic" aria-label="Add collection" disabled={!name.trim()}>
          <Icon name="plus" size={14} />
        </button>
      </form>
      <div className="col-io">
        <button type="button" className="btn" onClick={onExport}>
          <Icon name="download" size={14} />
          Export
        </button>
        <button type="button" className="btn" onClick={() => file.current?.click()}>
          <Icon name="upload" size={14} />
          Import
        </button>
        <input
          ref={file}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) onImport(await f.text());
          }}
        />
      </div>
    </section>
  );
}

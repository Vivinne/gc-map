'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { type Collection } from '../lib/collections';
import { BUILDINGS, BY_ID, COUNTRIES, ERAS, ERA_ORDER, EXAM_YEARS, type Building } from '../lib/model';
import { FIELDS, FIELD_LABEL, PAIRS, addSession, buildQuiz, capacity, record, splitPair, type Field, type Pair, type PairChoice, type Question, type QuizStore, type Session } from '../lib/quiz';
import { load, save } from '../lib/storage';
import { Icon } from './Icons';

export const COUNTS = [5, 10, 20, 30];

export function pct(right: number, total: number): string {
  return total ? `${Math.round((right / total) * 100)}%` : '';
}

export function typeLabel(t: string): string {
  if (t === 'mixed') return 'Mixed';
  if (t === 'missed') return 'Missed';
  const [a, b] = t.split('>') as [Field, Field];
  return FIELD_LABEL[a] && FIELD_LABEL[b] ? `${FIELD_LABEL[a]} \u2192 ${FIELD_LABEL[b]}` : t;
}

export interface QuizScope {
  id: string;
  label: string;
  items: Building[];
  color?: string;
}

/** Every scope a quiz can use; `extra` is a one-off list (e.g. buildings to practise) */
export function quizScopes(starred: ReadonlySet<string>, collections: Collection[], extra?: QuizScope | null): QuizScope[] {
  const out: QuizScope[] = [
    { id: 'all', label: 'All', items: BUILDINGS },
    { id: 'exam', label: 'TEST-ARCHED', items: BUILDINGS.filter((x) => x.exams.length) },
    { id: 'starred', label: 'Starred', items: BUILDINGS.filter((b) => starred.has(b.id)) },
    ...collections.map((c) => ({ id: `col:${c.id}`, label: c.name, items: c.ids.map((id) => BY_ID.get(id)).filter((b): b is Building => !!b) })),
    ...ERA_ORDER.map((e) => ({ id: `era:${e}`, label: ERAS[e].label, items: BUILDINGS.filter((x) => x.era === e), color: ERAS[e].color })),
    ...COUNTRIES.map((c) => ({ id: `country:${c}`, label: c, items: BUILDINGS.filter((x) => x.country === c) })),
    ...EXAM_YEARS.map((y) => ({ id: `year:${y}`, label: `TEST-ARCHED ${y}`, items: BUILDINGS.filter((x) => x.exams.includes(y)) })),
  ];
  if (extra) out.unshift(extra);
  return out;
}

/** A request from another view: open the quiz on this scope (and type), and start at once */
export interface QuizRequest {
  nonce: number;
  scope: string;
  type?: PairChoice;
  /** One-off scope (not in the chips) */
  extra?: QuizScope;
  /** Ask these "id|pair" questions with their own pair */
  missed?: string[];
}

interface Props {
  /** False while another tab is shown: the quiz keeps its state but ignores the keyboard */
  active: boolean;
  mobile: boolean;
  starred: ReadonlySet<string>;
  collections: Collection[];
  quiz: QuizStore;
  request: QuizRequest | null;
  onQuiz(q: QuizStore | ((q: QuizStore) => QuizStore)): void;
  onOpen(id: string): void;
}


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

/** Quiz: set-up (type, scope, number of questions), the run (restart / end) and the result */
export default function QuizView({ active, mobile, starred, collections, quiz, request, onQuiz, onOpen }: Props) {
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

  const [extra, setExtra] = useState<QuizScope | null>(null);
  const scopes = useMemo(() => quizScopes(starred, collections, extra), [starred, collections, extra]);
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

  // A request from Me: set the scope (and type) and start
  const handled = useRef(0);
  useEffect(() => {
    if (!request || handled.current === request.nonce) return;
    handled.current = request.nonce;
    setExtra(request.extra ?? null);
    const next = { ...setup, scope: request.scope, ...(request.type ? { type: request.type } : {}) };
    if (!request.extra) setSetup({ scope: request.scope, ...(request.type ? { type: request.type } : {}) });
    else setSetupRaw(next);
    const pool = request.extra && request.extra.id === request.scope ? request.extra.items : (quizScopes(starred, collections).find((x) => x.id === request.scope) ?? { items: BUILDINGS }).items;
    const qs = buildQuiz(pool, next.type, next.count, BUILDINGS, Math.floor(Math.random() * 1e9), request.missed);
    setPhase(qs.length ? { kind: 'run', qs, i: 0, answers: [], missedOnly: !!request.missed } : { kind: 'setup' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

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
      if (!active || phase.kind !== 'run' || t?.closest('input, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
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
      <section className={`me-quiz${mobile ? ' m' : ''}`} aria-label="Quiz">
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
      <section className={`me-quiz${mobile ? ' m' : ''}`} aria-label="Quiz result">
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
    <section className={`me-quiz${mobile ? ' m' : ''}`} aria-label="Quiz set-up">
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
          {scopes.filter((s) => !/^(country|year):/.test(s.id) || s.id === scope.id).map((s) => (
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


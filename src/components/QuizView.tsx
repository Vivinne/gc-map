'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { type Collection } from '../lib/collections';
import { BUILDINGS, BY_ID, COUNTRIES, ERAS, ERA_ORDER, EXAM_YEARS, type Building } from '../lib/model';
import { FIELDS, FIELD_LABEL, PAIRS, addSession, buildQuiz, capacity, record, splitPair, type Field, type Pair, type PairChoice, type Question, type QuizStore, type Session } from '../lib/quiz';
import { load, save } from '../lib/storage';
import { Icon } from './Icons';


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
    ...ERA_ORDER.map((e) => ({ id: `era:${e}`, label: ERAS[e].label, items: BUILDINGS.filter((x) => x.eras.includes(e)), color: ERAS[e].color })),
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
  /** Categories ticked (scope ids); the quiz takes every building of any of them; none = all buildings */
  scopes: string[];
  count: number;
  /** Show right / wrong as soon as an answer is picked (else all at the end) */
  reveal: boolean;
}

/** Fewest questions a quiz asks (when the categories hold that many) */
const MIN_Q = 5;

/** A pick per question; null = skipped or not answered yet */
type Picks = (string | null)[];

type Phase =
  | { kind: 'setup' }
  | { kind: 'run'; qs: Question[]; i: number; picks: Picks; seen: number; label: string; scope: string }
  | { kind: 'done'; qs: Question[]; picks: Picks; label: string; scope: string; again: () => void; planned: number };

/** Question types in the order users ask for them: from the building first, then back to it, then the rest */
const TYPE_ORDER: PairChoice[] = ['name>city', 'name>architect', 'name>style', 'city>name', 'architect>name', 'style>name', 'city>style', 'city>architect', 'style>city', 'style>architect', 'architect>city', 'architect>style', 'mixed'];

interface Opt {
  id: string;
  label: string;
  n?: number;
  color?: string;
  star?: boolean;
  /** A rule above this option */
  rule?: boolean;
}

/** Drop-down: a box with the value; the menu opens under it and closes on a pick, outside click or Esc */
function Dropdown({ label, value, options, onPick }: { label: string; value: string; options: Opt[]; onPick(id: string): void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const cur = options.find((o) => o.id === value) ?? options[0]!;
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopPropagation(), setOpen(false));
    window.addEventListener('pointerdown', down);
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('keydown', key, true);
    };
  }, [open]);
  return (
    <div className="qv-dd" ref={box}>
      <span className="qv-l">{label}</span>
      <button type="button" className={`qv-box${open ? ' open' : ''}`} aria-haspopup="listbox" aria-expanded={open} aria-label={`${label}: ${cur.label}${cur.n != null ? ` ${cur.n}` : ''}`} onClick={() => setOpen(!open)}>
        {cur.color && <i className="sw" style={{ background: cur.color }} />}
        {cur.star && <Icon name="starOn" size={13} />}
        <span className="v">{cur.label}</span>
        {cur.n != null && (
          <>
            {' '}
            <span className="n">{cur.n}</span>
          </>
        )}
        <Icon name="down" size={13} />
      </button>
      {open && (
        <ul className="qv-menu" role="listbox" aria-label={label}>
          {options.map((o) => (
            <li key={o.id} className={o.rule ? 'rule' : ''}>
              <button
                type="button"
                role="option"
                aria-selected={o.id === value}
                className={o.id === value ? 'on' : ''}
                disabled={o.n === 0}
                onClick={() => {
                  onPick(o.id);
                  setOpen(false);
                }}
              >
                {o.color && <i className="sw" style={{ background: o.color }} />}
                {o.star && <Icon name="starOn" size={13} />}
                <span className="v">{o.label}</span>
                {o.n != null && <span className="n">{o.n}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Range: one box ("All 204", or what is ticked and how many buildings that makes); its menu lists every
 * category as a tick box, in groups (period, country, TEST-ARCHED, the user's own). Any mix is quizzed together.
 */
function RangeMenu({ groups, picked, total, onTick }: { groups: { title: string; items: QuizScope[] }[]; picked: string[]; total: number; onTick(id: string): void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  // The menu fits the room left on screen: under the box down to the tab bar (phone) or the window edge,
  // or above the box when there is more room there; it scrolls only when even that is too short
  const [place, setPlace] = useState<{ up: boolean; max: number }>({ up: false, max: 420 });
  const toggle = () => {
    if (!open && box.current) {
      const r = box.current.getBoundingClientRect();
      const bar = document.querySelector('.tabbar')?.getBoundingClientRect().top ?? window.innerHeight;
      const top = document.querySelector('.top, .m-top')?.getBoundingClientRect().bottom ?? 0;
      const below = Math.min(bar, window.innerHeight) - r.bottom - 12;
      const above = r.top - top - 12;
      const up = below < 300 && above > below;
      setPlace({ up, max: Math.max(160, Math.min(600, up ? above : below)) });
    }
    setOpen(!open);
  };
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopPropagation(), setOpen(false));
    window.addEventListener('pointerdown', down);
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('keydown', key, true);
    };
  }, [open]);
  const short = (x: QuizScope) => (x.id.startsWith('year:') ? x.label.replace('TEST-ARCHED ', '') : x.id === 'exam' ? 'Any year' : x.label);
  const on = groups.flatMap((g) => g.items.filter((x) => picked.includes(x.id)).map((x) => (x.id.startsWith('year:') || x.id === 'exam' ? `TEST-ARCHED ${short(x)}` : x.label)));
  return (
    <div className="qv-dd qz2-range" ref={box}>
      <button type="button" className={`qv-box${open ? ' open' : ''}`} aria-haspopup="true" aria-expanded={open} aria-label={`Range: ${on.length ? on.join(', ') : 'all'}, ${total}`} onClick={toggle}>
        <span className="v">{on.length ? on.join(', ') : 'All'}</span>
        <span className="n">{total}</span>
        <Icon name="down" size={13} />
      </button>
      {open && (
        <div className={`qv-menu qz2-menu${place.up ? ' up' : ''}`} aria-label="Range" style={{ maxHeight: place.max }}>
          {groups.map((g) => (
            <div key={g.title} className={`qz2-g${g.title === 'TEST-ARCHED' ? ' yrs' : ''}`}>
              <h5>{g.title}</h5>
              <div className="qz2-its">
                {g.items.map((x) => {
                  const t = picked.includes(x.id);
                  return (
                    <button type="button" key={x.id} role="menuitemcheckbox" aria-checked={t} className={`qz2-it${t ? ' on' : ''}`} disabled={!x.items.length && !t} onClick={() => onTick(x.id)}>
                      <span className="bx">{t && <Icon name="check" size={10} />}</span>
                      {x.color && <i className="sw" style={{ background: x.color }} />}
                      {x.id === 'starred' && <Icon name="starOn" size={13} />}
                      <span className="v">{short(x)}</span>
                      <span className="n">{x.items.length}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Quiz: set-up with three drop-downs, the run (answers shown only at the end; Next always works), the result */
export default function QuizView({ active, mobile, starred, collections, quiz, request, onQuiz, onOpen }: Props) {
  const [setup, setSetupRaw] = useState<Setup>(() => {
    const s = load<Partial<Setup> & { scope?: string }>('quiz-setup', {});
    const type = s.type === 'mixed' || (PAIRS as string[]).includes(s.type ?? '') ? (s.type as PairChoice) : 'name>city';
    // older saves kept one scope
    const scopes = Array.isArray(s.scopes) ? s.scopes.filter((x): x is string => typeof x === 'string') : typeof s.scope === 'string' && s.scope !== 'all' ? [s.scope] : [];
    return { type, scopes, count: Number.isFinite(s.count) && s.count! >= 1 ? Math.round(s.count!) : 10, reveal: s.reveal === true };
  });
  const setSetup = (p: Partial<Setup>) =>
    setSetupRaw((s) => {
      const n = { ...s, ...p };
      save('quiz-setup', n);
      return n;
    });
  // A quiz in progress is kept in the browser, so a reload or a closed tab comes back to the same question
  const [phase, setPhase] = useState<Phase>(() => {
    const r = load<Extract<Phase, { kind: 'run' }> | null>('quiz-run', null);
    const ok = r && r.kind === 'run' && Array.isArray(r.qs) && r.qs.length && r.qs.every((q) => BY_ID.has(q.id)) && Array.isArray(r.picks) && r.picks.length === r.qs.length;
    return ok ? { ...r, i: Math.min(Math.max(0, r.i | 0), r.qs.length - 1) } : { kind: 'setup' };
  });
  useEffect(() => {
    save('quiz-run', phase.kind === 'run' ? phase : null);
  }, [phase]);
  const [extra, setExtra] = useState<QuizScope | null>(null);
  const scopes = useMemo(() => quizScopes(starred, collections, extra), [starred, collections, extra]);
  // The ticked categories together (any of them); none ticked = every building
  const picked = scopes.filter((x) => setup.scopes.includes(x.id) && x.id !== 'all');
  const scope: QuizScope = picked.length
    ? { id: picked.map((x) => x.id).join('+'), label: picked.map((x) => x.label).join(', '), items: [...new Map(picked.flatMap((x) => x.items).map((b) => [b.id, b])).values()] }
    : scopes.find((x) => x.id === 'all')!;
  const cap = capacity(scope.items, setup.type);
  const missedAll = useMemo(() => [...quiz.wrong].reverse(), [quiz.wrong]);

  const begin = (qs: Question[], label: string, scopeLabel: string) => {
    if (!qs.length) return;
    setPhase({ kind: 'run', qs, i: 0, picks: qs.map(() => null), seen: 1, label, scope: scopeLabel });
  };
  const startSetup = (s: Setup) => {
    begin(buildQuiz(scope.items, s.type, Math.max(Math.min(MIN_Q, cap), Math.min(s.count, cap)), BUILDINGS, Math.floor(Math.random() * 1e9)), typeLabel(s.type), scope.label);
  };
  const startMissed = (entries: string[], scopeLabel = 'Missed') => {
    begin(buildQuiz([], 'mixed', Math.min(30, entries.length), BUILDINGS, Math.floor(Math.random() * 1e9), entries), 'Missed', scopeLabel);
  };

  // A request from Me: set the scope (and type) and start
  const handled = useRef(0);
  useEffect(() => {
    if (!request || handled.current === request.nonce) return;
    handled.current = request.nonce;
    setExtra(request.extra ?? null);
    const one = request.scope === 'all' ? [] : [request.scope];
    const next = { ...setup, scopes: one, ...(request.type ? { type: request.type } : {}) };
    if (request.extra) setSetupRaw(next);
    else setSetup({ scopes: one, ...(request.type ? { type: request.type } : {}) });
    if (request.missed) return startMissed(request.missed, request.extra?.label ?? 'Missed');
    const pool = request.extra && request.extra.id === request.scope ? request.extra.items : (quizScopes(starred, collections).find((x) => x.id === request.scope) ?? { items: BUILDINGS }).items;
    const label = request.extra?.label ?? quizScopes(starred, collections).find((x) => x.id === request.scope)?.label ?? 'All';
    begin(buildQuiz(pool, next.type, next.count, BUILDINGS, Math.floor(Math.random() * 1e9)), typeLabel(next.type), label);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  // Finish: score, record every question that was reached (a skip counts as missed), keep the session
  const finish = (p: Extract<Phase, { kind: 'run' }>) => {
    const reached = p.qs.slice(0, Math.max(p.seen, p.picks.filter((x) => x != null).length));
    const picks = p.picks.slice(0, reached.length);
    const right = reached.filter((q, k) => picks[k] === q.answer).length;
    onQuiz((s) => {
      let n = s;
      reached.forEach((q, k) => (n = record(n, q, picks[k] === q.answer)));
      const session: Session = { t: Date.now(), type: p.label === 'Missed' ? 'missed' : (TYPE_ORDER.find((t) => typeLabel(t) === p.label) ?? 'mixed'), scope: p.scope, n: p.qs.length, total: reached.length, right };
      return addSession(n, session);
    });
    const again = p.label === 'Missed' ? () => startMissed(p.qs.map((q) => `${q.id}|${q.pair}`), p.scope) : () => startSetup(setup);
    setPhase({ kind: 'done', qs: reached, picks, label: p.label, scope: p.scope, again, planned: p.qs.length });
  };

  const run = phase.kind === 'run' ? phase : null;
  const go = (i: number) => run && setPhase({ ...run, i, seen: Math.max(run.seen, i + 1) });
  const pick = (o: string) => {
    if (!run) return;
    // answers shown at once: the first pick stands
    if (setup.reveal && run.picks[run.i] != null) return;
    const picks = [...run.picks];
    picks[run.i] = picks[run.i] === o ? null : o;
    setPhase({ ...run, picks });
  };
  const next = () => {
    if (!run) return;
    if (run.i + 1 >= run.qs.length) finish(run);
    else go(run.i + 1);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (!active || !run || t?.closest('input, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^[1-4]$/.test(e.key)) {
        const o = run.qs[run.i]!.options[Number(e.key) - 1];
        if (o) pick(o);
      } else if ((e.key === 'Enter' && t?.tagName !== 'BUTTON') || e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft' && run.i > 0) go(run.i - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ---------- missed list (right column) ----------
  const missedCard = (
    <section className="card qv-side" aria-label="To retry">
      <div className="hd">
        <h2>To retry</h2>
        <span className="rt">{missedAll.length}</span>
      </div>
      <div className="bd">
        {!missedAll.length && <p className="none">Nothing to retry yet</p>}
        <ol className="wk">
          {missedAll.slice(0, mobile ? 3 : 60).map((w) => {
            const [id, p] = w.split('|') as [string, Pair];
            const b = BY_ID.get(id);
            if (!b) return null;
            return (
              <li key={w}>
                <span className="wn">{b.name}</span>
                <span className="wf">{FIELD_LABEL[splitPair(p)[1]]}</span>
                <span className="wc">{b.city}</span>
              </li>
            );
          })}
        </ol>
        <p className="qv-note">Answered wrong or skipped. A right answer takes it off the list.</p>
      </div>
      <div className="act">
        <button type="button" className={`btn wide${mobile ? '' : ' dark'}`} disabled={!missedAll.length} onClick={() => startMissed(missedAll)}>
          Retry {Math.min(30, missedAll.length) || ''}
          <Icon name="right" size={12} />
        </button>
      </div>
    </section>
  );

  // ---------- run ----------
  if (run) {
    const q = run.qs[run.i]!;
    const b = BY_ID.get(q.id)!;
    const done = run.picks.filter((x) => x != null).length;
    const last = run.i + 1 >= run.qs.length;
    const state = (k: number) => (run.picks[k] != null ? 'ans' : k < run.seen && k !== run.i ? 'skip' : '');
    return (
      <div className={`qv${mobile ? ' m' : ''}`}>
        <section className="card qv-main" aria-label="Question">
          <div className="hd">
            <h2>{mobile ? `${run.i + 1} / ${run.qs.length}` : `Question ${run.i + 1} of ${run.qs.length}`}</h2>
            <div className="qv-prog" aria-hidden="true">
              {run.qs.map((_, k) => (
                <i key={k} className={k === run.i ? 'cur' : state(k)} />
              ))}
            </div>
          </div>
          <div className="bd">
            <div className="qv-k">{typeLabel(q.pair)}</div>
            {/* no style colour here: it would give the style away */}
            <div className="qv-p">
              {q.prompt}
            </div>
            <ol className="qv-ops" role="radiogroup" aria-label="Answers">
              {q.options.map((o, k) => {
                const mine = run.picks[run.i] === o;
                // answers shown at once: after a pick, the right answer turns green and a wrong pick red
                const shown = setup.reveal && run.picks[run.i] != null;
                const cls = shown ? (o === q.answer ? ' ok' : mine ? ' no' : ' dim') : mine ? ' pick' : '';
                return (
                  <li key={o}>
                    <button type="button" role="radio" className={`qv-o${cls}`} aria-checked={mine} onClick={() => pick(o)}>
                      <span className="i">{shown && o === q.answer ? <Icon name="check" size={11} /> : shown && mine ? <Icon name="close" size={10} /> : k + 1}</span>
                      <span>{o}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
          <div className="act">
            {mobile ? (
              <button type="button" className="btn sq" aria-label="Back" disabled={run.i === 0} onClick={() => go(run.i - 1)}>
                <Icon name="left" size={12} />
              </button>
            ) : (
              <span className="sel">
                <em>{setup.reveal ? '' : 'Answers are shown at the end'}</em>
              </span>
            )}
            {mobile && <span className="sel" />}
            {!mobile && (
              <button type="button" className="btn" disabled={run.i === 0} onClick={() => go(run.i - 1)}>
                <Icon name="left" size={12} />
                Back
              </button>
            )}
            {mobile && (
              <button type="button" className="btn" onClick={() => finish(run)}>
                Score now
              </button>
            )}
            <button type="button" className="btn dark" onClick={next}>
              {last ? 'Score' : 'Next'}
              <Icon name="right" size={12} />
            </button>
          </div>
        </section>
        {!mobile && (
          <section className="card qv-side" aria-label="This quiz">
            <div className="hd">
              <h2>This quiz</h2>
              <span className="rt">
                {done} of {run.qs.length} done
              </span>
            </div>
            <div className="bd">
              <ol className="qv-list">
                {run.qs.map((x, k) => {
                  const st = state(k);
                  const reached = k < run.seen || run.picks[k] != null;
                  return (
                    <li key={`${x.id}|${x.pair}`} className={k === run.i ? 'cur' : ''}>
                      <button type="button" disabled={!reached} onClick={() => go(k)}>
                        <span className={`m ${st}`}>{k === run.i ? k + 1 : st === 'ans' ? '●' : st === 'skip' ? '–' : k + 1}</span>
                        <span className="nm">{reached ? x.prompt : '—'}</span>
                        <span className="a">{st === 'ans' ? 'Answered' : st === 'skip' ? 'Skipped' : ''}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
            <div className="act">
              <button type="button" className="btn wide" onClick={() => setPhase({ kind: 'setup' })}>
                <Icon name="undo" size={13} />
                Set up again
              </button>
              <button type="button" className="btn wide" onClick={() => finish(run)}>
                Score now
              </button>
            </div>
          </section>
        )}
      </div>
    );
  }

  // ---------- result ----------
  if (phase.kind === 'done') {
    const right = phase.qs.filter((q, k) => phase.picks[k] === q.answer).length;
    const skipped = phase.picks.filter((x) => x == null).length;
    const wrong = phase.qs.filter((q, k) => phase.picks[k] !== q.answer);
    const planned = phase.planned;
    const notReached = planned - phase.qs.length;
    const covered = new Set(phase.qs.map((q) => q.id)).size;
    // The score is always out of the questions planned: questions never reached count as not answered
    const verdict = notReached > 0 ? `Scored after ${phase.qs.length} of ${planned} questions` : wrong.length ? `${wrong.length} to retry` : 'All right';
    return (
      <div className={`qv${mobile ? ' m' : ''}`}>
        <section className="card qv-main" aria-label="Result">
          <div className="hd">
            <h2>Result</h2>
            <span className="rt">
              {phase.label} · {phase.scope}
            </span>
          </div>
          <div className="bd">
            <div className="qv-res">
              <b>
                {right} / {planned}
              </b>
              <span>{pct(right, planned)}</span>
            </div>
            <p className="qv-sum">
              {verdict}
              {skipped ? ` · ${skipped} skipped` : ''}
              {notReached > 0 ? ` · ${notReached} not reached` : ''} · {covered} {covered === 1 ? 'building' : 'buildings'}
            </p>
            <ol className="qv-rl">
              {phase.qs.map((q, k) => {
                const p = phase.picks[k];
                const ok = p === q.answer;
                return (
                  <li key={`${q.id}|${q.pair}`}>
                    <button type="button" onClick={() => onOpen(q.id)}>
                      <span className={`m ${ok ? 'ok' : p == null ? 'sk' : 'bad'}`}>{ok ? '✓' : p == null ? '–' : '✕'}</span>
                      <span className="nm">
                        <b>{q.prompt}</b>
                        <span>{typeLabel(q.pair)}</span>
                      </span>
                      <span className="an">
                        {!ok && p != null && <s>{p}</s>}
                        {ok ? q.answer : <em>{q.answer}</em>}
                        {p == null && <small>skipped</small>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
          <div className="act">
            <button type="button" className="btn" onClick={() => setPhase({ kind: 'setup' })}>
              Change settings
            </button>
            {wrong.length > 0 && (
              <button type="button" className="btn" onClick={() => startMissed(wrong.map((q) => `${q.id}|${q.pair}`), phase.scope)}>
                Retry wrong <span className="n">{wrong.length}</span>
              </button>
            )}
            <button type="button" className="btn dark" onClick={phase.again}>
              New questions, same settings
              <Icon name="right" size={12} />
            </button>
          </div>
        </section>
        {!mobile && missedCard}
      </div>
    );
  }

  // ---------- set-up ----------
  // The question type as two short choices: what is shown, and what is asked (the other three fields)
  const [see, ask] = setup.type === 'mixed' ? ['any', ''] : setup.type.split('>');
  const seeOpts: Opt[] = [...FIELDS.map((f) => ({ id: f, label: FIELD_LABEL[f] })), { id: 'any', label: 'Any', rule: true }];
  const askOpts: Opt[] = see === 'any' ? [{ id: '', label: 'Any' }] : FIELDS.filter((f) => f !== see).map((f) => ({ id: f, label: FIELD_LABEL[f] }));
  const pickSee = (v: string) => {
    if (v === 'any') return setSetup({ type: 'mixed' });
    const keep = ask && ask !== v ? ask : v === 'name' ? 'city' : 'name';
    setSetup({ type: `${v}>${keep}` as PairChoice });
  };
  // The range: every category as a tick box in one menu, in groups; any mix of them is quizzed together
  const groups: { title: string; items: QuizScope[] }[] = [
    { title: 'Period', items: scopes.filter((x) => x.id.startsWith('era:')) },
    { title: 'Country', items: scopes.filter((x) => x.id.startsWith('country:')) },
    { title: 'TEST-ARCHED', items: scopes.filter((x) => x.id === 'exam' || x.id.startsWith('year:')) },
    { title: 'Mine', items: scopes.filter((x) => x.id === 'starred' || x.id.startsWith('col:') || (extra && x.id === extra.id)) },
  ];
  const tick = (id: string) => setSetup({ scopes: setup.scopes.includes(id) ? setup.scopes.filter((x) => x !== id) : [...setup.scopes, id] });
  const lo = Math.min(MIN_Q, cap);
  const n = Math.max(lo, Math.min(setup.count, cap));
  const setCount = (v: number) => setSetup({ count: Math.max(lo, Math.min(cap, Math.round(v) || lo)) });
  return (
    <div className={`qv${mobile ? ' m' : ''}`}>
      <section className="card qv-main qv-setup qz2" aria-label="New quiz">
        <div className="hd">
          <h2>New quiz</h2>
        </div>
        <div className="bd">
          <div className="qz2-row">
            <span className="qz2-l">Question</span>
            <div className="qz2-line">
              <Dropdown label="Question in" value={see!} options={seeOpts} onPick={pickSee} />
              <Icon name="right" size={12} />
              <Dropdown label="Answer in" value={ask ?? ''} options={askOpts} onPick={(id) => id && setSetup({ type: `${see}>${id}` as PairChoice })} />
              <span className="qz2-hint">{see === 'any' ? 'Each question asks a different pair of fields.' : `You see a ${FIELD_LABEL[see as Field].toLowerCase()} and pick its ${FIELD_LABEL[ask as Field].toLowerCase()} from 4 choices.`}</span>
            </div>
          </div>
          <div className="qz2-row">
            <span className="qz2-l">Range</span>
            <div className="qz2-line">
              <RangeMenu groups={groups.filter((g) => g.items.length)} picked={setup.scopes} total={scope.items.length} onTick={tick} />
            </div>
          </div>
          <div className="qz2-row">
            <span className="qz2-l">Questions</span>
            <div className="qz2-line">
              <div className="qv-num">
                <button type="button" aria-label="Fewer questions" disabled={n <= lo} onClick={() => setCount(n - 1)}>
                  <Icon name="minus" size={12} />
                </button>
                <input
                  type="number"
                  inputMode="numeric"
                  min={lo}
                  max={cap}
                  value={n}
                  aria-label={`Questions, ${lo} to ${cap}`}
                  onChange={(e) => setSetup({ count: Number(e.target.value) || lo })}
                  onBlur={(e) => setCount(Number(e.target.value))}
                />
                <button type="button" aria-label="More questions" disabled={n >= cap} onClick={() => setCount(n + 1)}>
                  <Icon name="plus" size={12} />
                </button>
              </div>
            </div>
          </div>
          <div className="qz2-row">
            <span className="qz2-l">Answers</span>
            <div className="qz2-line">
              <button type="button" role="switch" aria-checked={setup.reveal} className="qz2-sw" onClick={() => setSetup({ reveal: !setup.reveal })}>
                <span className={`sw2${setup.reveal ? ' on' : ''}`}>
                  <i />
                </span>
                Show the right answer after each question
              </button>
              <span className="qz2-hint">{setup.reveal ? 'Your first pick counts and cannot be changed.' : 'Answers can be changed until you score.'}</span>
            </div>
          </div>
        </div>
        <div className="qz2-go">
          <button type="button" className="btn dark" disabled={!cap} onClick={() => startSetup(setup)}>
            Start
          </button>
        </div>
      </section>
      {missedCard}
    </div>
  );
}

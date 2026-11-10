'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { type Collection } from '../lib/collections';
import { BY_ID, COUNTRIES, ERAS, ERA_ORDER, type Building } from '../lib/model';
import { QUIZ_BUILDINGS as BUILDINGS } from '../lib/quiz';
import { FIELDS, FIELD_LABEL, PAIRS, QUICK_COUNT, addSession, shuffle, buildQuick, buildQuiz, capacity, pairsFrom, questionText, record, splitPair, type Field, type Pair, type PairChoice, type Question, type QuizStore, type Session } from '../lib/quiz';
import { BUILDINGS as EVERY_BUILDING } from '../lib/model';
import { load, save } from '../lib/storage';
import { Icon } from './Icons';
import Help from './Help';


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
  /** Questions to ask (else the set-up's number) */
  count?: number;
  /** The quick quiz (five questions: city, architect, style) */
  quick?: boolean;
}

interface Props {
  /** First visit: a note at the page's ? */
  hint?: boolean;
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
  /** Fields shown in the question, and fields asked for: every valid pair of them is quizzed together */
  shown: Field[];
  asked: Field[];
  /** Categories ticked (scope ids); the quiz takes every building of any of them; none = all buildings */
  scopes: string[];
  count: number;
  /** Show right / wrong as soon as an answer is picked (else all at the end) */
  reveal: boolean;
}

/** Fewest questions a quiz asks (when the categories hold that many) */
const MIN_Q = 1;

/** A pick per question; null = skipped or not answered yet */
type Picks = (string | null)[];

/** How a quiz was made, so it can be made again with new questions (Practice again) */
type Recipe = { kind: 'quick' } | { kind: 'setup'; setup: Setup; pool: Building[] } | { kind: 'missed'; entries: string[] };

type Phase =
  | { kind: 'setup' }
  | {
      kind: 'run';
      qs: Question[];
      i: number;
      picks: Picks;
      /** Answer shown after each question: the pick is checked (and fixed) with Check */
      reveal: boolean;
      checked: boolean[];
      seen: number;
      label: string;
      scope: string;
      recipe: Recipe;
    }
  | { kind: 'done'; qs: Question[]; picks: Picks; answered: boolean[]; label: string; scope: string; recipe: Recipe; at: number };

/** The last quiz made, kept so the set-up can offer Practice again */
interface Last {
  label: string;
  scope: string;
  recipe: { kind: 'quick' } | { kind: 'setup'; setup: Setup } | { kind: 'missed' };
  ids: string[];
}

/** 199 of the 200 buildings are in the quiz; said where the range of a quiz is chosen */
const IN_QUIZ_NOTE = `${BUILDINGS.length} of ${EVERY_BUILDING.length} buildings are in the quiz (${EVERY_BUILDING.filter((b) => !BUILDINGS.includes(b))
  .map((b) => b.name)
  .join(', ')} ${EVERY_BUILDING.length - BUILDINGS.length === 1 ? 'is' : 'are'} left out). A question needs the facts it asks about: a building with no known architect is not asked about its architect.`;

/** A small "i" that shows a note under it while open */
function Info({ text, label }: { text: string; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="qz-info">
      <button type="button" className="qv-ib" aria-expanded={open} aria-label={label} title={label} onClick={() => setOpen(!open)}>
        i
      </button>
      {open && <span className="qz-note" role="note">{text}</span>}
    </span>
  );
}

/** Question types in the order users ask for them: from the building first, then back to it, then the rest */
const TYPE_ORDER: PairChoice[] = ['name>city', 'name>architect', 'name>style', 'city>name', 'architect>name', 'style>name', 'city>architect', 'style>architect', 'architect>city', 'architect>style', 'mixed'];

/**
 * Range: one box ("All 204", or what is ticked and how many buildings that makes); its menu lists every
 * category as a tick box, in groups (period, country, TEST-ARCHED, the user's own). Any mix is quizzed together.
 */
/**
 * The number of questions, typed freely: what is typed stays as typed while the box has focus (so "20" can
 * be typed through "2"), and is kept within lo..hi when the box is left or Enter is pressed.
 */
function CountBox({ value, lo, hi, onSet }: { value: number; lo: number; hi: number; onSet(v: number): void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft !== null) onSet(Number(draft));
    setDraft(null);
  };
  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      value={draft ?? String(value)}
      aria-label={`Questions, ${lo} to ${hi}`}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setDraft(e.target.value.replace(/\D/g, '').slice(0, 4))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setDraft(null);
          e.currentTarget.blur();
        }
      }}
    />
  );
}

/** The fields of one question type, for the set-up: "mixed" is every field on both sides */
function fieldsOf(t: PairChoice): { shown: Field[]; asked: Field[] } {
  if (t === 'mixed') return { shown: [...FIELDS], asked: [...FIELDS] };
  const [a, b] = splitPair(t);
  return { shown: [a], asked: [b] };
}

/** Name of a set of pairs: one pair by its fields, one shown or asked field with the others listed, else Mixed */
export function pairsLabel(ps: Pair[]): string {
  if (ps.length === 1) return typeLabel(ps[0]!);
  const shown = [...new Set(ps.map((p) => splitPair(p)[0]))];
  const asked = [...new Set(ps.map((p) => splitPair(p)[1]))];
  if (ps.length === PAIRS.length || (shown.length > 1 && asked.length > 1)) return 'Mixed';
  return `${shown.map((f) => FIELD_LABEL[f]).join(', ')} \u2192 ${asked.map((f) => FIELD_LABEL[f]).join(', ')}`;
}

/** One side of the question: a box with what is ticked, its menu the four fields as tick boxes (one at least) */
function FieldMenu({ label, picked, onTick }: { label: string; picked: Field[]; onTick(f: Field): void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
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
  const text = picked.length === FIELDS.length ? 'Any' : picked.map((f) => FIELD_LABEL[f]).join(', ');
  return (
    <div className="qv-dd qz2-fd" ref={box}>
      <button type="button" className={`qv-box${open ? ' open' : ''}`} aria-haspopup="true" aria-expanded={open} aria-label={`${label}: ${text}`} onClick={() => setOpen(!open)}>
        <span className="v">{text}</span>
        <Icon name="down" size={13} />
      </button>
      {open && (
        <div className="qv-menu qz2-menu" aria-label={label}>
          <div className="qz2-its">
            {FIELDS.map((f) => {
              const t = picked.includes(f);
              return (
                <button type="button" key={f} role="menuitemcheckbox" aria-checked={t} className={`qz2-it${t ? ' on' : ''}`} disabled={t && picked.length === 1} onClick={() => onTick(f)}>
                  <span className="bx">{t && <Icon name="check" size={10} />}</span>
                  <span className="v">{FIELD_LABEL[f]}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

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
  const short = (x: QuizScope) => x.label;
  const on = groups.flatMap((g) => g.items.filter((x) => picked.includes(x.id)).map((x) => x.label));
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
export default function QuizView({ hint, active, mobile, starred, collections, quiz, request, onQuiz, onOpen }: Props) {
  const [setup, setSetupRaw] = useState<Setup>(() => {
    const s = load<Partial<Setup> & { scope?: string }>('quiz-setup', {});
    const fields = (x: unknown) => (Array.isArray(x) ? x.filter((f): f is Field => (FIELDS as string[]).includes(f)) : []);
    // older saves kept one type ("name>city" or "mixed")
    const old = (s as { type?: string }).type;
    const [o1, o2] = old && (PAIRS as string[]).includes(old) ? (old.split('>') as [Field, Field]) : old === 'mixed' ? [null, null] : (['name', 'city'] as const);
    const shown = fields(s.shown).length ? fields(s.shown) : o1 ? [o1] : [...FIELDS];
    const asked = fields(s.asked).length ? fields(s.asked) : o2 ? [o2] : [...FIELDS];
    // older saves kept one scope
    const scopes = Array.isArray(s.scopes) ? s.scopes.filter((x): x is string => typeof x === 'string') : typeof s.scope === 'string' && s.scope !== 'all' ? [s.scope] : [];
    return { shown, asked, scopes, count: Number.isFinite(s.count) && s.count! >= 1 ? Math.round(s.count!) : 10, reveal: s.reveal === true };
  });
  const setSetup = (p: Partial<Setup>) =>
    setSetupRaw((s) => {
      const n = { ...s, ...p };
      save('quiz-setup', n);
      return n;
    });
  // Custom quiz: open or folded, as last left
  const [customOpen, setCustomOpen] = useState(() => load<boolean>('quiz-custom-open', false));
  const setCustom = (v: boolean) => {
    save('quiz-custom-open', v);
    setCustomOpen(v);
  };
  // A reload starts the quiz page afresh: a quiz in progress is not kept (an older copy kept by earlier versions is cleared)
  const [phase, setPhase] = useState<Phase>({ kind: 'setup' });
  useEffect(() => {
    save('quiz-run', null);
  }, []);
  const [extra, setExtra] = useState<QuizScope | null>(null);
  const scopes = useMemo(() => quizScopes(starred, collections, extra), [starred, collections, extra]);
  // The ticked categories together (any of them); none ticked = every building
  const picked = scopes.filter((x) => setup.scopes.includes(x.id) && x.id !== 'all');
  const scope: QuizScope = picked.length
    ? { id: picked.map((x) => x.id).join('+'), label: picked.map((x) => x.label).join(', '), items: [...new Map(picked.flatMap((x) => x.items).map((b) => [b.id, b])).values()] }
    : scopes.find((x) => x.id === 'all')!;
  const pairs = pairsFrom(setup.shown, setup.asked);
  const cap = capacity(scope.items, pairs);
  const missedAll = useMemo(() => [...quiz.wrong].reverse(), [quiz.wrong]);

  const [last, setLastRaw] = useState<Last | null>(() => load<Last | null>('quiz-last', null));
  const begin = (qs: Question[], label: string, scopeLabel: string, recipe: Recipe) => {
    if (!qs.length) return;
    const l: Last = { label, scope: scopeLabel, recipe: recipe.kind === 'setup' ? { kind: 'setup', setup: recipe.setup } : recipe, ids: qs.map((q) => q.id) };
    save('quiz-last', l);
    setLastRaw(l);
    setPhase({ kind: 'run', qs, i: 0, picks: qs.map(() => null), reveal: setup.reveal, checked: qs.map(() => false), seen: 1, label, scope: scopeLabel, recipe });
  };
  const seed = () => Math.floor(Math.random() * 1e9);
  const startQuick = (avoid?: ReadonlySet<string>) => begin(buildQuick(BUILDINGS, BUILDINGS, seed(), avoid), 'Quick quiz', 'All', { kind: 'quick' });
  const startSetup = (s: Setup, pool: Building[] = scope.items, label = scope.label, avoid?: ReadonlySet<string>) => {
    const ps = pairsFrom(s.shown, s.asked);
    const c = capacity(pool, ps);
    begin(buildQuiz(pool, ps, Math.max(Math.min(MIN_Q, c), Math.min(s.count, c)), BUILDINGS, seed(), undefined, avoid), pairsLabel(ps), label, { kind: 'setup', setup: s, pool });
  };
  const startMissed = (entries: string[], scopeLabel = 'Missed') => {
    begin(buildQuiz([], 'mixed', Math.min(30, entries.length), BUILDINGS, seed(), entries), 'Missed', scopeLabel, { kind: 'missed', entries });
  };
  /** The same kind of quiz again, with new questions: the last set's buildings go last */
  const practiseAgain = (recipe: Recipe, label: string, avoid: ReadonlySet<string>) => {
    if (recipe.kind === 'quick') startQuick(avoid);
    else if (recipe.kind === 'setup') startSetup(recipe.setup, recipe.pool, label, avoid);
    else startMissed(recipe.entries, label);
  };
  /** The same questions again, choices in a new order */
  const retry = (qs: Question[], label: string, scopeLabel: string, recipe: Recipe) =>
    begin(
      qs.map((q, k) => ({ ...q, options: shuffle(q.options, seed() + k) })),
      label,
      scopeLabel,
      recipe,
    );

  // A request from Me: set the scope (and type) and start
  const handled = useRef(0);
  useEffect(() => {
    if (!request || handled.current === request.nonce) return;
    handled.current = request.nonce;
    setExtra(request.extra ?? null);
    const one = request.scope === 'all' ? [] : [request.scope];
    const typed = request.type ? fieldsOf(request.type) : {};
    const next = { ...setup, scopes: one, ...typed };
    if (!request.quick) {
      if (request.extra) setSetupRaw(next);
      else setSetup({ scopes: one, ...typed });
    }
    if (request.quick) return startQuick();
    if (request.missed) return startMissed(request.missed, request.extra?.label ?? 'Missed');
    const pool = request.extra && request.extra.id === request.scope ? request.extra.items : (quizScopes(starred, collections).find((x) => x.id === request.scope) ?? { items: BUILDINGS }).items;
    const label = request.extra?.label ?? quizScopes(starred, collections).find((x) => x.id === request.scope)?.label ?? 'All';
    startSetup({ ...next, count: request.count ?? next.count }, pool, label);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  // An answer counts when given: with answers shown after each question, once checked
  const answeredOf = (p: Extract<Phase, { kind: 'run' }>): boolean[] => p.qs.map((_, k) => p.picks[k] != null && (!p.reveal || !!p.checked[k]));
  // End: record each answered question once (a skipped one is not an answer: it changes neither score nor
  // mastery), keep the session. A second tap while it ends does nothing.
  const ending = useRef(false);
  const finish = (p: Extract<Phase, { kind: 'run' }>) => {
    if (ending.current) return;
    ending.current = true;
    const answered = answeredOf(p);
    const total = answered.filter(Boolean).length;
    const right = p.qs.filter((q, k) => answered[k] && p.picks[k] === q.answer).length;
    const t = Date.now();
    onQuiz((s) => {
      let n = s;
      p.qs.forEach((q, k) => {
        if (answered[k]) n = record(n, q, p.picks[k] === q.answer, t);
      });
      const type = p.label === 'Missed' ? 'missed' : p.label === 'Quick quiz' ? 'quick' : (TYPE_ORDER.find((x) => typeLabel(x) === p.label) ?? (p.label === 'Mixed' ? 'mixed' : p.label));
      const session: Session = { t, type, scope: p.scope, n: p.qs.length, total, right, skipped: p.qs.length - total };
      return addSession(n, session);
    });
    setConfirm(false);
    setPhase({ kind: 'done', qs: p.qs, picks: p.picks, answered, label: p.label, scope: p.scope, recipe: p.recipe, at: Date.now() });
  };
  useEffect(() => {
    if (phase.kind !== 'done') ending.current = false;
  }, [phase]);
  const [confirm, setConfirm] = useState(false);
  /** End quiz: straight to the result when all is answered, else ask first */
  const askEnd = (p: Extract<Phase, { kind: 'run' }>) => {
    if (answeredOf(p).every(Boolean)) finish(p);
    else setConfirm(true);
  };

  const run = phase.kind === 'run' ? phase : null;
  const go = (i: number) => run && setPhase({ ...run, i, seen: Math.max(run.seen, i + 1) });
  const pick = (o: string) => {
    if (!run) return;
    // a checked answer stays as it is
    if (run.reveal && run.checked[run.i]) return;
    const picks = [...run.picks];
    picks[run.i] = picks[run.i] === o ? null : o;
    setPhase({ ...run, picks });
  };
  // The main button: Check (answers shown, a pick not checked yet), Skip (nothing picked), Next, or See results.
  // Taps closer than 350 ms count once, so a double tap never checks and moves on in one go.
  const tapAt = useRef(0);
  const primary = () => {
    if (!run) return;
    const now = Date.now();
    if (now - tapAt.current < 350) return;
    tapAt.current = now;
    const picked = run.picks[run.i] != null;
    if (run.reveal && picked && !run.checked[run.i]) {
      const checked = [...run.checked];
      checked[run.i] = true;
      setPhase({ ...run, checked });
      return;
    }
    if (run.i + 1 >= run.qs.length) askEnd(run);
    else go(run.i + 1);
  };
  const next = primary;

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
    <section className="card qv-side" aria-label="Mistakes">
      <div className="hd">
        <h2>Mistakes</h2>
        <span className="rt">{missedAll.length}</span>
      </div>
      <div className="bd">
        {!missedAll.length && <p className="none">None yet</p>}
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
      </div>
      <div className="act">
        <button type="button" className={`btn wide${mobile ? '' : ' dark'}`} disabled={!missedAll.length} onClick={() => startMissed(missedAll)}>
          Quiz {Math.min(30, missedAll.length) || ''}
          <Icon name="right" size={12} />
        </button>
      </div>
    </section>
  );

  // ---------- run ----------
  if (run) {
    const q = run.qs[run.i]!;
    const answered = answeredOf(run);
    const done = answered.filter(Boolean).length;
    const last = run.i + 1 >= run.qs.length;
    const picked = run.picks[run.i] != null;
    const checkedHere = run.reveal && run.checked[run.i];
    const mainLabel = run.reveal && picked && !checkedHere ? 'Check' : !picked ? 'Skip' : last ? 'See results' : 'Next';
    const state = (k: number) => (answered[k] ? 'ans' : k < run.seen && k !== run.i ? 'skip' : '');
    const [before, after] = questionText(q.pair);
    const unanswered = run.qs.length - done;
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
            {mobile && (
              <button type="button" className="btn qv-end" onClick={() => askEnd(run)}>
                End quiz
              </button>
            )}
          </div>
          <div className="bd">
            <div className="qv-k">{typeLabel(q.pair)}</div>
            {/* the question as a sentence around its prompt; no style colour here: it would give the style away */}
            <div className="qv-p qv-sent">
              {before}
              <b>{q.prompt}</b>
              {after}
            </div>
            <ol className="qv-ops" role="radiogroup" aria-label="Answers">
              {q.options.map((o, k) => {
                const mine = run.picks[run.i] === o;
                // checked: the right answer turns green and a wrong pick red
                const cls = checkedHere ? (o === q.answer ? ' ok' : mine ? ' no' : ' dim') : mine ? ' pick' : '';
                return (
                  <li key={o}>
                    <button type="button" role="radio" className={`qv-o${cls}`} aria-checked={mine} aria-disabled={checkedHere || undefined} onClick={() => pick(o)}>
                      <span className="i">{checkedHere && o === q.answer ? <Icon name="check" size={11} /> : checkedHere && mine ? <Icon name="close" size={10} /> : k + 1}</span>
                      <span>{o}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
            {checkedHere && <p className={`qv-fb ${run.picks[run.i] === q.answer ? 'ok' : 'no'}`}>{run.picks[run.i] === q.answer ? 'Right.' : `The answer is ${q.answer}.`}</p>}
          </div>
          <div className="act">
            {mobile ? (
              <button type="button" className="btn sq" aria-label="Back" disabled={run.i === 0} onClick={() => go(run.i - 1)}>
                <Icon name="left" size={12} />
              </button>
            ) : (
              <span className="sel">
                <em />
              </span>
            )}
            {mobile && <span className="sel" />}
            {!mobile && (
              <button type="button" className="btn" disabled={run.i === 0} onClick={() => go(run.i - 1)}>
                <Icon name="left" size={12} />
                Back
              </button>
            )}
            <button type="button" className={`btn${picked ? ' dark' : ''}`} onClick={primary}>
              {mainLabel}
              <Icon name="right" size={12} />
            </button>
          </div>
          {confirm && (
            <div className="qv-confirm" role="alertdialog" aria-label="End quiz">
              <p>
                End now? {unanswered} unanswered question{unanswered === 1 ? '' : 's'} will be listed as skipped.
              </p>
              <div className="qv-confirm-b">
                <button type="button" className="btn" onClick={() => setConfirm(false)}>
                  Keep going
                </button>
                <button type="button" className="btn dark" onClick={() => finish(run)}>
                  End and see results
                </button>
              </div>
            </div>
          )}
        </section>
        {!mobile && (
          <section className="card qv-side" aria-label="This quiz">
            <div className="hd">
              <h2>This quiz</h2>
              <span className="rt">
                {done} of {run.qs.length} answered
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
                Quiz menu
              </button>
              <button type="button" className="btn wide" onClick={() => askEnd(run)}>
                End quiz
              </button>
            </div>
          </section>
        )}
      </div>
    );
  }

  // ---------- result ----------
  if (phase.kind === 'done') {
    const n = phase.qs.length;
    const answered = phase.answered.filter(Boolean).length;
    const right = phase.qs.filter((q, k) => phase.answered[k] && phase.picks[k] === q.answer).length;
    const wrong = phase.qs.filter((q, k) => phase.answered[k] && phase.picks[k] !== q.answer);
    const skipped = n - answered;
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
            {/* how much was answered stands as large as the accuracy beside it, so a score of few answers never reads
                as a whole quiz done well; under half answered, the accuracy is greyed */}
            <div className="qv-res">
              <div>
                <b>
                  {answered}
                  <small> / {n}</small>
                </b>
                <span>Answered</span>
              </div>
              <div className={answered * 2 < n ? 'low' : ''}>
                <b>{answered ? pct(right, answered) : '\u2014'}</b>
                <span>Accuracy</span>
              </div>
            </div>
            <p className="qv-sum">
              <span>
                Right <b>{right}</b>
              </span>
              <span>
                Wrong <b>{wrong.length}</b>
              </span>
              <span>
                Skipped <b>{skipped}</b>
              </span>
            </p>
            <ol className="qv-rl">
              {phase.qs.map((q, k) => {
                const p = phase.answered[k] ? phase.picks[k] : null;
                const ok = p === q.answer;
                return (
                  <li key={`${q.id}|${q.pair}`}>
                    {/* a second tap of End that lands here right after does not open the building */}
                    <button type="button" onClick={() => Date.now() - phase.at > 600 && onOpen(q.id)}>
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
          <div className="act qv-res-act">
            <button type="button" className="btn" onClick={() => setPhase({ kind: 'setup' })}>
              <Icon name="undo" size={13} />
              Quiz menu
            </button>
            {wrong.length > 0 && (
              <button type="button" className="btn" onClick={() => startMissed(wrong.map((q) => `${q.id}|${q.pair}`), phase.scope)}>
                Mistakes <span className="n">{wrong.length}</span>
              </button>
            )}
            <button type="button" className="btn" onClick={() => retry(phase.qs, phase.label, phase.scope, phase.recipe)}>
              Retry these questions
            </button>
            <button type="button" className="btn dark" onClick={() => practiseAgain(phase.recipe, phase.scope, new Set(phase.qs.map((q) => q.id)))}>
              Practice again
              <Icon name="right" size={12} />
            </button>
          </div>
        </section>
        {!mobile && missedCard}
      </div>
    );
  }

  // ---------- set-up ----------
  // The question: fields shown and fields asked for, each a set of tick boxes; every valid pair is asked
  const tickField = (key: 'shown' | 'asked', f: Field) => {
    const cur = setup[key];
    if (cur.includes(f) && cur.length === 1) return;
    setSetup({ [key]: cur.includes(f) ? cur.filter((x) => x !== f) : FIELDS.filter((x) => x === f || cur.includes(x)) } as Partial<Setup>);
  };
  // The range: every category as a tick box in one menu, in groups; any mix of them is quizzed together
  const groups: { title: string; items: QuizScope[] }[] = [
    { title: 'Period', items: scopes.filter((x) => x.id.startsWith('era:')) },
    { title: 'Country', items: scopes.filter((x) => x.id.startsWith('country:')) },
    { title: 'TEST-ARCHED', items: scopes.filter((x) => x.id === 'exam') },
    { title: 'Mine', items: scopes.filter((x) => x.id === 'starred' || x.id.startsWith('col:') || (extra && x.id === extra.id)) },
  ];
  const tick = (id: string) => setSetup({ scopes: setup.scopes.includes(id) ? setup.scopes.filter((x) => x !== id) : [...setup.scopes, id] });
  const lo = Math.min(MIN_Q, cap);
  const n = Math.max(lo, Math.min(setup.count, cap));
  const setCount = (v: number) => setSetup({ count: Math.max(lo, Math.min(cap, Math.round(v) || lo)) });
  // fewer questions than asked for, or the most there can be while some buildings of the range lack the facts
  const short = cap > 0 && pairs.length > 0 && (setup.count > cap || (n >= cap && cap < scope.items.length));
  const lastText =
    last?.recipe.kind === 'quick'
      ? 'Last: Quick quiz'
      : last?.recipe.kind === 'setup'
        ? `Last: ${last.label} \u00b7 ${last.scope} \u00b7 ${last.recipe.setup.count} questions`
        : last
          ? `Last: Mistakes \u00b7 ${last.scope}`
          : '';
  const again = () => {
    if (!last) return;
    const avoid = new Set(last.ids);
    if (last.recipe.kind === 'quick') startQuick(avoid);
    else if (last.recipe.kind === 'setup') {
      const pool = scopes.find((x) => x.id === 'all')!.items;
      const picks = scopes.filter((x) => last.recipe.kind === 'setup' && last.recipe.setup.scopes.includes(x.id) && x.id !== 'all');
      const items = picks.length ? [...new Map(picks.flatMap((x) => x.items).map((b) => [b.id, b])).values()] : pool;
      startSetup(last.recipe.setup, items, last.scope, avoid);
    } else startMissed(missedAll, 'Missed');
  };
  return (
    <div className={`qv${mobile ? ' m' : ''}`}>
      <div className={`qv-col${customOpen ? ' open' : ''}`}>
        {/* the first step: one button, five questions from the building to its city, architect and style */}
        <section className="card qv-quick" aria-label="Quick quiz">
          <div className="qq-row">
            <div className="qq-t">
              <h2>Quick quiz</h2>
              <p>
                {QUICK_COUNT} questions {'\u00b7'} City, architect &amp; style
                <Info label="Which buildings are asked" text={IN_QUIZ_NOTE} />
              </p>
            </div>
            <div className="qq-go">
              <button type="button" className="btn dark" onClick={() => startQuick()}>
                Start {QUICK_COUNT} questions
                <Icon name="right" size={12} />
              </button>
            </div>
          </div>
        </section>
        {/* your own quiz, under the quick one: the same card as the others, its current set-up said in one line, a Start of its own;
            the settings open under it */}
        <section className={`card qv-quick qv-custom qz2${customOpen ? ' open' : ''}`} aria-label="Custom quiz">
          <div className="qq-row">
            <div className="qq-t">
              <h2>
                Custom quiz
                <Help topic="quiz" hint={hint} />
              </h2>
              <p>Choose the question type, the range and how many.</p>
              <p className="qq-now">
                {pairs.length ? pairsLabel(pairs) : 'No question type'} {'\u00b7'} {scope.label} {'\u00b7'} {cap && pairs.length ? `${n} question${n === 1 ? '' : 's'}` : 'no questions fit'}
              </p>
            </div>
            <div className="qq-go">
              {/* secondary to the Quick quiz, but plainly a button that works: an ink outline, the count it starts */}
              <button type="button" className="btn line" disabled={!cap || !pairs.length} onClick={() => startSetup(setup)}>
                {cap && pairs.length ? `Start ${n} question${n === 1 ? '' : 's'}` : 'Start'}
                <Icon name="right" size={12} />
              </button>
              <button type="button" className="btn qv-fold" aria-expanded={customOpen} onClick={() => setCustom(!customOpen)}>
                {customOpen ? 'Hide settings' : 'Settings'}
                <Icon name="down" size={12} />
              </button>
            </div>
          </div>
          {customOpen && (
            <div className="bd qq-set">
              <div className="qz2-row">
                <span className="qz2-l">Question type</span>
                <div className="qz2-line">
                  <FieldMenu label="Question in" picked={setup.shown} onTick={(f) => tickField('shown', f)} />
                  <Icon name="right" size={12} />
                  <FieldMenu label="Answer in" picked={setup.asked} onTick={(f) => tickField('asked', f)} />
                </div>
                {!pairs.length && <p className="qz2-note">No question pairs these: City and Style are never asked together, nor a field with itself.</p>}
              </div>
              <div className="qz2-row">
                <span className="qz2-l">
                  Range
                  <Info label="Which buildings are in the quiz" text={IN_QUIZ_NOTE} />
                </span>
                <div className="qz2-line">
                  <RangeMenu groups={groups.filter((g) => g.items.length)} picked={setup.scopes} total={scope.items.length} onTick={tick} />
                </div>
              </div>
              <div className="qz2-row">
                <span className="qz2-l">Number of questions</span>
                <div className="qz2-line">
                  <div className="qv-num">
                    <button type="button" aria-label="Fewer questions" disabled={!cap || n <= lo} onClick={() => setCount(n - 1)}>
                      <Icon name="minus" size={12} />
                    </button>
                    <CountBox value={n} lo={lo} hi={cap} onSet={setCount} />
                    <button type="button" aria-label="More questions" disabled={!cap || n >= cap} onClick={() => setCount(n + 1)}>
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
                    Show the answer after each question
                  </button>
                </div>
              </div>
              {(!cap || !pairs.length) && <p className="qz2-why">No questions fit this range. Add styles or countries.</p>}
              {short && <p className="qz2-why">Only {cap} building{cap === 1 ? '' : 's'} in this range {cap === 1 ? 'has' : 'have'} the facts these questions need.</p>}
            </div>
          )}
        </section>
        {last && (
          <section className="card qv-quick qv-again" aria-label="Practice again">
            <div className="qq-row">
              <div className="qq-t">
                <h2>Practice again</h2>
                <p>{lastText}. New questions, avoiding the last set where possible.</p>
              </div>
              <div className="qq-go">
                <button type="button" className="btn" onClick={again} disabled={last.recipe.kind === 'missed' && !missedAll.length}>
                  Practice again
                  <Icon name="right" size={12} />
                </button>
              </div>
            </div>
          </section>
        )}
      </div>
      {missedCard}
    </div>
  );
}

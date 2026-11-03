'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type Collection } from '../lib/collections';
import { BUILDINGS, BY_ID, ERAS, ERA_ORDER, byYear, type Building } from '../lib/model';
import { FIELDS, FIELD_LABEL, type Field, PAIRS, askable, question, record, splitPair, type Pair, type Question, type QuizStore } from '../lib/quiz';
import { load, save } from '../lib/storage';
import { Icon } from './Icons';

type PairChoice = Pair | 'mixed';

export interface MeProps {
  mobile: boolean;
  starred: ReadonlySet<string>;
  collections: Collection[];
  quiz: QuizStore;
  onQuiz(q: QuizStore): void;
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

function pct(s: { right: number; total: number } | undefined): string {
  return s && s.total ? `${Math.round((s.right / s.total) * 100)}%` : '';
}

/** Personal area: cross quiz on the left, the user's collections on the right */
export default function MeView(props: MeProps) {
  return (
    <div className={`me${props.mobile ? ' m' : ''}`}>
      <QuizPanel {...props} />
      <Collections {...props} />
    </div>
  );
}

// ---------- quiz ----------

function QuizPanel({ starred, collections, quiz, onQuiz, onOpen }: MeProps) {
  const [pair, setPairRaw] = useState<PairChoice>(() => {
    const p = load<string>('quiz-pair', 'name>architect');
    return p === 'mixed' || (PAIRS as string[]).includes(p) ? (p as PairChoice) : 'name>architect';
  });
  const [scope, setScope] = useState('all');
  const [retry, setRetry] = useState(false);
  const [q, setQ] = useState<Question | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [session, setSession] = useState({ right: 0, total: 0 });
  const recent = useRef<string[]>([]);
  const nextRef = useRef<HTMLButtonElement>(null);

  const setPair = (p: PairChoice) => {
    setPairRaw(p);
    save('quiz-pair', p);
  };

  const pool = useMemo<Building[]>(() => {
    if (scope === 'exam') return BUILDINGS.filter((b) => b.exams.length > 0);
    if (scope === 'starred') return BUILDINGS.filter((b) => starred.has(b.id));
    if (scope.startsWith('col:')) {
      const c = collections.find((x) => x.id === scope.slice(4));
      return c ? c.ids.map((id) => BY_ID.get(id)).filter((b): b is Building => !!b) : [];
    }
    if (scope.startsWith('era:')) return BUILDINGS.filter((b) => b.era === scope.slice(4));
    return BUILDINGS;
  }, [scope, starred, collections]);

  // A scope that no longer exists (deleted collection) falls back to all buildings
  useEffect(() => {
    if (scope.startsWith('col:') && !collections.some((c) => c.id === scope.slice(4))) setScope('all');
  }, [collections, scope]);

  const wrongHere = useMemo(() => {
    const ids = new Set(pool.map((b) => b.id));
    return quiz.wrong.filter((w) => ids.has(w.split('|')[0]!));
  }, [quiz.wrong, pool]);

  const draw = useCallback((): Question | null => {
    const seed = Math.floor(Math.random() * 1e9);
    if (retry) {
      for (const w of wrongHere) {
        const [id, p] = w.split('|') as [string, Pair];
        const b = BY_ID.get(id);
        if (!b || (wrongHere.length > 1 && recent.current[0] === w)) continue;
        const out = question(b, p, BUILDINGS, seed);
        if (out) return out;
      }
      return null;
    }
    for (let tries = 0; tries < 12; tries++) {
      const p = pair === 'mixed' ? PAIRS[Math.floor(Math.random() * PAIRS.length)]! : pair;
      const cands = askable(pool, p);
      if (!cands.length) continue;
      const fresh = cands.filter((b) => !recent.current.includes(b.id));
      const from = fresh.length ? fresh : cands;
      const b = from[Math.floor(Math.random() * from.length)]!;
      const out = question(b, p, BUILDINGS, seed + tries);
      if (out) return out;
    }
    return null;
  }, [retry, wrongHere, pair, pool]);

  const next = useCallback(() => {
    const n = draw();
    if (n) recent.current = [retry ? `${n.id}|${n.pair}` : n.id, ...recent.current].slice(0, Math.min(12, Math.max(1, pool.length - 1)));
    setQ(n);
    setPicked(null);
  }, [draw, retry, pool.length]);

  // New question whenever the set-up changes
  useEffect(() => {
    next();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pair, scope, retry]);
  useEffect(() => {
    if (retry && !wrongHere.length) setRetry(false);
  }, [retry, wrongHere.length]);

  const pick = (opt: string) => {
    if (!q || picked) return;
    const ok = opt === q.answer;
    setPicked(opt);
    setSession((s) => ({ right: s.right + (ok ? 1 : 0), total: s.total + 1 }));
    onQuiz(record(quiz, q, ok));
    window.requestAnimationFrame(() => nextRef.current?.focus());
  };

  // Keys 1-4 answer, Enter goes on
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t?.closest('input, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
      if (q && !picked && /^[1-4]$/.test(e.key)) {
        const o = q.options[Number(e.key) - 1];
        if (o) pick(o);
      } else if (picked && e.key === 'Enter' && t?.tagName !== 'BUTTON') next();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const [ask, ans]: [Field, Field] = q ? splitPair(q.pair) : ['name', 'name'];
  const b = q ? BY_ID.get(q.id) : undefined;
  const scopes: [string, string, number, string?][] = [
    ['all', 'All', BUILDINGS.length],
    ['exam', 'TEST-ARCHED', BUILDINGS.filter((x) => x.exams.length).length],
    ['starred', '', starred.size],
    ...collections.map((c) => [`col:${c.id}`, c.name, c.ids.length] as [string, string, number]),
    ...ERA_ORDER.map((e) => [`era:${e}`, ERAS[e].label, BUILDINGS.filter((x) => x.era === e).length, ERAS[e].color] as [string, string, number, string]),
  ];

  return (
    <section className="me-quiz" aria-label="Quiz">
      <div className="qz-set">
        <div className="qz-grid" role="grid" aria-label="Question and answer">
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
                return (
                  <button type="button" key={c} className={`qz-c${pair === p ? ' on' : ''}`} aria-pressed={pair === p} aria-label={`${FIELD_LABEL[a]} to ${FIELD_LABEL[c]}`} onClick={() => { setRetry(false); setPair(p); }}>
                    {pct(quiz.score[p])}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <button type="button" className={`chip qz-mix${pair === 'mixed' ? ' on' : ''}`} aria-pressed={pair === 'mixed'} onClick={() => { setRetry(false); setPair('mixed'); }}>
          Mixed
        </button>
      </div>

      <div className="chips qz-scope">
        {scopes.map(([id, label, n, color]) => (
          <button type="button" key={id} className={`chip${scope === id ? ' on' : ''}${n === 0 ? ' off' : ''}`} aria-pressed={scope === id} aria-label={id === 'starred' ? 'Starred' : undefined} onClick={() => setScope(id)}>
            {color && <i className="sw" style={{ background: color }} />}
            {id === 'starred' && <Icon name={scope === id ? 'starOn' : 'star'} size={13} />}
            {label}
            <span className="n">{n}</span>
          </button>
        ))}
      </div>

      <div className="qz-card">
        {q && b ? (
          <>
            <div className="qz-k">
              <span>{FIELD_LABEL[ask]}</span>
              <Icon name="right" size={10} />
              <span>{FIELD_LABEL[ans]}</span>
              {retry && <span className="qz-retry">{wrongHere.length}</span>}
            </div>
            <div className="qz-p" style={{ borderColor: ERAS[b.era].color }}>
              {q.prompt}
            </div>
            <ol className="qz-opts">
              {q.options.map((o, i) => {
                const cls = picked ? (o === q.answer ? ' ok' : o === picked ? ' no' : ' dim') : '';
                return (
                  <li key={o}>
                    <button type="button" className={`qz-o${cls}`} disabled={!!picked && o !== q.answer && o !== picked} onClick={() => pick(o)}>
                      <span className="qz-i">{i + 1}</span>
                      <span>{o}</span>
                      {picked && o === q.answer && <Icon name="check" size={14} />}
                    </button>
                  </li>
                );
              })}
            </ol>
            {picked && (
              <div className="qz-after">
                <button type="button" className="qz-b" onClick={() => onOpen(b.id)}>
                  <i className="sw" style={{ background: ERAS[b.era].color }} />
                  <span>{b.name}</span>
                  <Icon name="map" size={14} />
                </button>
                <button type="button" className="btn dark" ref={nextRef} onClick={next}>
                  Next
                  <Icon name="right" size={13} />
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="qz-none">0</div>
        )}
      </div>

      <div className="qz-foot">
        <span className="qz-sess">
          <b>{session.right}</b>/{session.total}
        </span>
        <button type="button" className={`chip${retry ? ' on' : ''}${wrongHere.length ? '' : ' off'}`} disabled={!wrongHere.length && !retry} aria-pressed={retry} onClick={() => setRetry(!retry)}>
          <Icon name="undo" size={13} />
          Missed
          <span className="n">{wrongHere.length}</span>
        </button>
      </div>
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

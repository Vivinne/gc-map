'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BUILDINGS, BY_ID, ERAS, dataLines } from '../lib/model';
import { again, gotIt, newDeck, syncDeck, type Deck } from '../lib/review';
import { load, save } from '../lib/storage';
import Facts from './Facts';
import { Icon } from './Icons';
import MiniMap from './MiniMap';

type DeckId = 'all' | 'asked';

interface Props {
  mobile: boolean;
  onSeen(id: string): void;
  onOpen(id: string): void;
  onExit(): void;
}

const IDS: Record<DeckId, string[]> = {
  all: BUILDINGS.map((b) => b.id),
  asked: BUILDINGS.filter((b) => b.exams.length).map((b) => b.id),
};

export default function ReviewView({ mobile, onSeen, onOpen, onExit }: Props) {
  const [deckId, setDeckId] = useState<DeckId>(() => load<DeckId>('deck-choice', 'all'));
  const [deck, setDeck] = useState<Deck>(() => syncDeck(load<Deck | null>(`deck-${deckId}`, null), IDS[deckId], Date.now()));
  const [shown, setShown] = useState(false);
  const [swipe, setSwipe] = useState(0);
  const start = useRef<number | null>(null);

  useEffect(() => {
    setDeck(syncDeck(load<Deck | null>(`deck-${deckId}`, null), IDS[deckId], Date.now()));
    setShown(false);
    save('deck-choice', deckId);
  }, [deckId]);
  useEffect(() => {
    save(`deck-${deckId}`, deck);
  }, [deck, deckId]);

  const card = deck.queue[0] ? BY_ID.get(deck.queue[0]) : undefined;
  const total = IDS[deckId].length;

  const reveal = useCallback(() => {
    if (!card) return;
    setShown(true);
    onSeen(card.id);
  }, [card, onSeen]);
  const answer = useCallback(
    (ok: boolean) => {
      if (!card || !shown) return;
      setDeck((d) => (ok ? gotIt(d) : again(d)));
      setShown(false);
    },
    [card, shown],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea')) return;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (!shown) reveal();
      } else if (e.key === '1') answer(false);
      else if (e.key === '2') answer(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shown, reveal, answer]);

  const focus = useMemo(() => (card ? { b: card, km: card.country === 'Others' || card.country === 'United States' ? 3000 : 1500 } : undefined), [card]);

  return (
    <div className="review">
      <div className="r-top">
        {mobile && (
          <button type="button" className="icon-btn" aria-label="Leave review" onClick={onExit}>
            <Icon name="close" size={14} />
          </button>
        )}
        <div className="r-deck" role="radiogroup" aria-label="Cards">
          {(
            [
              ['all', `All ${IDS.all.length}`],
              ['asked', `TEST-ARCHED ${IDS.asked.length}`],
            ] as const
          ).map(([k, l]) => (
            <button type="button" key={k} role="radio" aria-checked={deckId === k} className={`chip${deckId === k ? ' on' : ''}`} onClick={() => setDeckId(k)}>
              {l}
            </button>
          ))}
        </div>
        <div className="r-prog">
          <span>
            <b>{deck.known.length}</b>/{total}
          </span>
          <div className="bar">
            <i style={{ width: `${(deck.known.length / total) * 100}%` }} />
          </div>
        </div>
      </div>

      {!card ? (
        <div className="r-done">
          <h2>
            {total}/{total}
          </h2>
          <button type="button" className="btn dark" aria-label="Start again" title="Start again" onClick={() => setDeck(newDeck(IDS[deckId], Date.now()))}>
            <Icon name="undo" size={16} />
          </button>
        </div>
      ) : (
        <div className="r-stage">
          <div
            className={`rcard${shown ? ' shown' : ''}`}
            style={swipe ? { transform: `translateX(${swipe}px) rotate(${swipe / 40}deg)` } : undefined}
            onPointerDown={(e) => {
              if (!shown) return;
              start.current = e.clientX;
              (e.currentTarget as Element).setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => start.current != null && setSwipe(e.clientX - start.current)}
            onPointerUp={() => {
              const d = swipe;
              start.current = null;
              setSwipe(0);
              if (d > 90) answer(true);
              else if (d < -90) answer(false);
            }}
          >
            <div className="rc-head" style={{ background: ERAS[card.era].color }}>
              {shown ? (
                <h2>{card.name.toUpperCase()}</h2>
              ) : (
                <h2 className="q">?</h2>
              )}
            </div>
            <div className="rc-body">
              <MiniMap width={mobile ? 320 : 360} height={mobile ? 150 : 200} items={[]} focus={focus} />
              <div className="rc-data">
                {dataLines(card).map((l, i) => (
                  <p key={i}>{l}</p>
                ))}
              </div>
            </div>
            {shown ? (
              <div className="rc-ans">
                <Facts b={card} data={false} />
                <button type="button" className="icon-btn" aria-label="Open on the map" title="Open on the map" onClick={() => onOpen(card.id)}>
                  <Icon name="map" size={16} />
                </button>
              </div>
            ) : null}
          </div>
          {!shown ? (
            <button type="button" className="btn dark big" onClick={reveal}>
              Show answer
            </button>
          ) : (
            <div className="r-after">
              <button type="button" className="btn big" onClick={() => answer(false)}>
                Again
              </button>
              <button type="button" className="btn dark big" onClick={() => answer(true)}>
                Got it
              </button>
            </div>
          )}

        </div>
      )}
    </div>
  );
}

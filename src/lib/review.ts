/**
 * Review deck: every building once, in a shuffled order. "Got it" retires a card; "Again" puts it
 * back a few cards later so it returns in the same session.
 */
export interface Deck {
  /** Remaining card ids, the first is the current card */
  queue: string[];
  /** Retired card ids */
  known: string[];
  /** How many times each card was sent back */
  again: Record<string, number>;
}

export const AGAIN_GAP = 4;

export function shuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  let s = seed >>> 0 || 1;
  const rnd = () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export function newDeck(ids: string[], seed: number): Deck {
  return { queue: shuffle(ids, seed), known: [], again: {} };
}

/** Bring a stored deck in line with the current card set (cards added or removed since it was saved) */
export function syncDeck(deck: Deck | null, ids: string[], seed: number): Deck {
  if (!deck) return newDeck(ids, seed);
  const set = new Set(ids);
  const known = deck.known.filter((id) => set.has(id));
  const queue = deck.queue.filter((id) => set.has(id) && !known.includes(id));
  const missing = ids.filter((id) => !queue.includes(id) && !known.includes(id));
  return { queue: [...queue, ...shuffle(missing, seed)], known, again: deck.again ?? {} };
}

export function gotIt(d: Deck): Deck {
  const [cur, ...rest] = d.queue;
  if (!cur) return d;
  return { ...d, queue: rest, known: [...d.known, cur] };
}

export function again(d: Deck): Deck {
  const [cur, ...rest] = d.queue;
  if (!cur) return d;
  const at = Math.min(AGAIN_GAP, rest.length);
  const queue = [...rest.slice(0, at), cur, ...rest.slice(at)];
  return { ...d, queue, again: { ...d.again, [cur]: (d.again[cur] ?? 0) + 1 } };
}

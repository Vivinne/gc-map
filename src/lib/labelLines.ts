/**
 * Map names on two lines (user, 2026-11-25): a name longer than `max` characters is broken between words into
 * two lines of at most `max` characters each, never shortened with an ellipsis. Of the possible breaks, the one
 * with the shorter longer line is taken, so the two lines are as even as the words allow.
 */
export const LABEL_MAX = 24;

const ELLIPSIS = '…';

/** Cut a line to `most` characters, the last one being an ellipsis */
const cut = (t: string, most: number) => (t.length > most ? `${t.slice(0, Math.max(1, most - 1)).trimEnd()}${ELLIPSIS}` : t);

/** The name as one or two lines of at most `max` characters, broken between words */
export function labelLines(name: string, max = LABEL_MAX): string[] {
  if (name.length <= max) return [name];
  const words = name.split(' ');
  let best: string[] | null = null;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ');
    const b = words.slice(i).join(' ');
    if (a.length > max || b.length > max) continue;
    if (!best || Math.max(a.length, b.length) < Math.max(best[0]!.length, best[1]!.length)) best = [a, b];
  }
  if (best) return best;
  // no break gives two short enough lines: the first line takes as many words as fit, the second ends in …
  return fill(name, max);
}

/**
 * The open building's name when the map has room for only `most` characters on either side: two lines filled
 * word by word, the second line ending in … only when the two lines cannot hold the whole name.
 */
export function fill(name: string, most: number): string[] {
  const words = name.split(' ');
  let a = '';
  let i = 0;
  for (; i < words.length; i++) {
    const next = a ? `${a} ${words[i]}` : words[i]!;
    if (next.length > most) break;
    a = next;
  }
  // a first word longer than the room: it is cut itself
  if (!a) return [cut(name, most)];
  const rest = words.slice(i).join(' ');
  return rest ? [a, cut(rest, most)] : [a];
}

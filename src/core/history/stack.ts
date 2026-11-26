/* C1 history: the history behind ＜, kept for this tab (survives a reload, no step limit). */
import { BY_ID } from '../../data';
import { sessionGet, sessionSet } from '../../shared/storage';
import { EMPTY_SCREEN, isEmptyScreen, sameScreen, type Screen } from './screen';

const STACK_KEY = 'gc-map:history';

/** The history behind ＜, kept for this tab so a reload restores it */
export function loadStack(): Screen[] | null {
  try {
    const raw = sessionGet(STACK_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : null;
    if (!Array.isArray(list)) return null;
    // a building removed or renamed since the history was saved (a new version of the data) leaves its screen:
    // the step goes, so ＜ never lands on an empty screen (N4); a step equal to the one before it goes too
    const out: Screen[] = [];
    for (const s of list as Partial<Screen>[]) {
      if (!s || typeof s !== 'object') continue;
      const group = Array.isArray(s.group) ? s.group.filter((id): id is string => typeof id === 'string' && BY_ID.has(id)) : [];
      const b = typeof s.b === 'string' && BY_ID.has(s.b) ? s.b : '';
      if ((s.b && !b) || (s.list === 'group' && !group.length)) continue;
      const next = { ...(s as Screen), q: typeof s.q === 'string' ? s.q : '', group, b };
      if (out.length && sameScreen(out[out.length - 1]!, next)) continue;
      out.push(next);
    }
    return out.length ? out : null;
  } catch {
    return null;
  }
}

export function saveStack(stack: Screen[]): void {
  sessionSet(STACK_KEY, JSON.stringify(stack));
}

/**
 * Stack to start from: the saved one when its top is the screen the address names (a reload),
 * else the address alone (a shared link: no history, ＜ hidden).
 */
export function startStack(fromAddress: Screen): Screen[] {
  const saved = loadStack();
  if (saved && sameScreen(saved[saved.length - 1]!, fromAddress)) return saved;
  return isEmptyScreen(fromAddress) ? [EMPTY_SCREEN] : [fromAddress];
}


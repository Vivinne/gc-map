import { load, save } from '../../shared/storage';

const MAX = 3;
const TEXT_KEY = 'recent-text';
const BUILDING_KEY = 'recent-building';

/** The saved list, or nothing when the saved data is damaged (not a list of texts): N3 */
const listOf = (key: string): string[] => {
  const v = load<unknown>(key, []);
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : [];
};

/** `same`: when two entries count as one (the newest is kept) */
function push(key: string, value: string, same = (a: string, b: string) => a === b): string[] {
  const list = [value, ...listOf(key).filter((v) => !same(v, value))].slice(0, MAX);
  save(key, list);
  return list;
}

/** Recent search texts (typed, Category, architect), newest first, at most 3 */
export const recentTexts = (): string[] => listOf(TEXT_KEY).slice(0, MAX);
/** "Rome" and "rome" are one entry: the spelling typed last stays */
export const addRecentText = (text: string): string[] => push(TEXT_KEY, text, (a, b) => a.toLowerCase() === b.toLowerCase());

/** Recent buildings whose card was opened, newest first, at most 3 (ids) */
export const recentBuildings = (): string[] => listOf(BUILDING_KEY).slice(0, MAX);
export const addRecentBuilding = (id: string): string[] => push(BUILDING_KEY, id);

/** Take one entry off the recent list (the small × at the end of its row in the search preview; user, 2026-11-24) */
function drop(key: string, value: string, same = (a: string, b: string) => a === b): string[] {
  const list = listOf(key).filter((v) => !same(v, value)).slice(0, MAX);
  save(key, list);
  return list;
}
export const removeRecentText = (text: string): string[] => drop(TEXT_KEY, text, (a, b) => a.toLowerCase() === b.toLowerCase());
export const removeRecentBuilding = (id: string): string[] => drop(BUILDING_KEY, id);

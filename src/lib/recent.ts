import { load, save } from './storage';

const MAX = 3;
const TEXT_KEY = 'recent-text';
const BUILDING_KEY = 'recent-building';

/** `same`: when two entries count as one (the newest is kept) */
function push(key: string, value: string, same = (a: string, b: string) => a === b): string[] {
  const list = [value, ...load<string[]>(key, []).filter((v) => !same(v, value))].slice(0, MAX);
  save(key, list);
  return list;
}

/** Recent search texts (typed, Category, architect), newest first, at most 3 */
export const recentTexts = (): string[] => load<string[]>(TEXT_KEY, []).slice(0, MAX);
/** "Rome" and "rome" are one entry: the spelling typed last stays */
export const addRecentText = (text: string): string[] => push(TEXT_KEY, text, (a, b) => a.toLowerCase() === b.toLowerCase());

/** Recent buildings whose card was opened, newest first, at most 3 (ids) */
export const recentBuildings = (): string[] => load<string[]>(BUILDING_KEY, []).slice(0, MAX);
export const addRecentBuilding = (id: string): string[] => push(BUILDING_KEY, id);

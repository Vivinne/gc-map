import { load, save } from './storage';

const MAX = 5;
const TEXT_KEY = 'recent-text';
const BUILDING_KEY = 'recent-building';

function push(key: string, value: string): string[] {
  const list = [value, ...load<string[]>(key, []).filter((v) => v !== value)].slice(0, MAX);
  save(key, list);
  return list;
}

/** Recent search texts (typed, Category, architect), newest first, at most 5 */
export const recentTexts = (): string[] => load<string[]>(TEXT_KEY, []).slice(0, MAX);
export const addRecentText = (text: string): string[] => push(TEXT_KEY, text);

/** Recent buildings whose card was opened, newest first, at most 5 (ids) */
export const recentBuildings = (): string[] => load<string[]>(BUILDING_KEY, []).slice(0, MAX);
export const addRecentBuilding = (id: string): string[] => push(BUILDING_KEY, id);

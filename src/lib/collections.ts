/**
 * User-made collections of buildings, kept in this browser. Export / import moves them (with the other
 * personal data) to another browser as a JSON file.
 */
import { BY_ID } from './model';

export interface Collection {
  id: string;
  name: string;
  /** Building ids, in the order they were added */
  ids: string[];
}

export const NAME_MAX = 40;

export function cleanName(s: string): string {
  return s.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
}

export function newId(list: Collection[], now = Date.now()): string {
  let id = `c${now.toString(36)}`;
  while (list.some((c) => c.id === id)) id += 'x';
  return id;
}

export function create(list: Collection[], name: string, now = Date.now()): Collection[] {
  const n = cleanName(name);
  if (!n) return list;
  return [...list, { id: newId(list, now), name: n, ids: [] }];
}

export function rename(list: Collection[], id: string, name: string): Collection[] {
  const n = cleanName(name);
  if (!n) return list;
  return list.map((c) => (c.id === id ? { ...c, name: n } : c));
}

export function remove(list: Collection[], id: string): Collection[] {
  return list.filter((c) => c.id !== id);
}

export function move(list: Collection[], id: string, by: number): Collection[] {
  const i = list.findIndex((c) => c.id === id);
  const j = i + by;
  if (i < 0 || j < 0 || j >= list.length) return list;
  const out = [...list];
  [out[i], out[j]] = [out[j]!, out[i]!];
  return out;
}

export function toggleIn(list: Collection[], id: string, building: string): Collection[] {
  return list.map((c) => (c.id !== id ? c : { ...c, ids: c.ids.includes(building) ? c.ids.filter((x) => x !== building) : [...c.ids, building] }));
}

/** Everything personal that a file export carries */
export interface Personal {
  seen: string[];
  starred: string[];
  collections: Collection[];
  quiz: unknown;
}

export const FILE_KIND = 'gc-atlas-personal';

export function toFile(p: Personal): string {
  return JSON.stringify({ kind: FILE_KIND, version: 1, ...p }, null, 1);
}

const known = (ids: unknown): string[] => (Array.isArray(ids) ? [...new Set(ids.filter((x): x is string => typeof x === 'string' && BY_ID.has(x)))] : []);

/** Read an exported file; unknown buildings are dropped. Throws on a file that is not an export. */
export function fromFile(text: string): Personal {
  const raw = JSON.parse(text) as Record<string, unknown>;
  if (!raw || raw.kind !== FILE_KIND) throw new Error('Not a GC Atlas file');
  const cols = Array.isArray(raw.collections) ? raw.collections : [];
  const collections: Collection[] = [];
  for (const c of cols as Record<string, unknown>[]) {
    const name = cleanName(typeof c?.name === 'string' ? c.name : '');
    if (!name) continue;
    const id = typeof c.id === 'string' && c.id && !collections.some((x) => x.id === c.id) ? c.id : newId(collections, Date.now() + collections.length);
    collections.push({ id, name, ids: known(c.ids) });
  }
  return { seen: known(raw.seen), starred: known(raw.starred), collections, quiz: raw.quiz ?? null };
}

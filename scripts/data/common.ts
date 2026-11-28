// D1 data pipeline: shared paths, data-file readers, category groups and ids
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EraId } from '../../src/data';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const P = (...a: string[]) => resolve(ROOT, ...a);
// ---------- Era groups, in time order (their colours live in src/shared/tokens/tokens.ts) ----------
export const ERAS: { id: EraId; label: string; styles: string[] }[] = [
  { id: 'ancient', label: 'Ancient', styles: ['6.1', '6.2'] },
  { id: 'medieval', label: 'Medieval', styles: ['6.3', '6.4', '6.5'] },
  { id: 'renaissance', label: 'Renaissance', styles: ['6.6'] },
  // Mannerism has no handout heading of its own: its buildings move here through data/style-split.txt
  { id: 'mannerism', label: 'Mannerism', styles: [] },
  { id: 'baroque', label: 'Baroque', styles: ['6.7'] },
  { id: 'neoclassicism', label: 'Neoclassicism', styles: ['6.8'] },
  { id: 'artnouveau', label: 'Art Nouveau', styles: ['6.10'] },
  { id: 'beauxarts', label: 'Beaux-Arts', styles: ['6.14'] },
  { id: 'modern', label: 'Modern', styles: ['6.9', '6.11', '6.12', '6.13'] },
  { id: 'others', label: 'Others', styles: ['6.15'] },
];
export const isEra = (id: string): id is EraId => ERAS.some((e) => e.id === id);
export const eraOfStyle = (sid: string) => ERAS.find((e) => e.styles.includes(sid))?.id;

const realText = (file: string): string | null => (existsSync(P(file)) ? readFileSync(P(file), 'utf8') : null);
let source = realText;
/** A repo file as text (path from the repo root), or null when it is not there */
export const readText = (file: string): string | null => source(file);
/** A repo file as text; a missing file stops the build */
export const mustRead = (file: string): string => {
  const t = readText(file);
  if (t === null) throw new Error(`Missing file: ${file}`);
  return t;
};
/**
 * Tests: read some files from `files` instead of the repo (to feed broken data and check every error the build
 * reports). Returns a function that puts the repo files back.
 */
export function useFiles(files: Record<string, string | null>): () => void {
  source = (file) => (file in files ? files[file]! : realText(file));
  return () => void (source = realText);
}

/** Data lines of a file in data/: blank lines and # comments left out */
export const dataLines = (file: string) =>
  mustRead(file)
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.startsWith('#'));
/** Fields of a "a | b | c" line, trimmed */
export const fields = (l: string) => l.split('|').map((x) => x.trim());

export const ascii = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

export function slug(name: string): string {
  const base = ascii(name) || 'x';
  // names containing Han characters (or nothing ASCII at all) get a short hash so that distinct names never collapse to one slug
  return /\p{Script=Han}/u.test(name) || base === 'x' ? `${base}-${createHash('sha1').update(name).digest('hex').slice(0, 4)}` : base;
}

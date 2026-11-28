/*
 * Layer 3A doors: every name a module's door (index.ts) offers is used by another module (no door left open
 * for nothing), and every name another module takes through a door is offered there (MODULES.md).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

const SRC = join(__dirname, '..', 'src');
const files = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? files(join(d, f)) : /\.tsx?$/.test(f) ? [join(d, f)] : []));
const code = files(SRC).filter((f) => !/\.(test|ct|story)\.tsx?$/.test(f));
const doors = code.filter((f) => f.endsWith('index.ts') && f !== join(SRC, 'shell', 'index.ts'));

const offered = (door: string): string[] =>
  [...readFileSync(door, 'utf8').matchAll(/export\s*\{([^}]*)\}/g)].flatMap((m) => m[1]!.split(',').map((x) => x.trim().replace(/^type\s+/, '').split(/\s+as\s+/).pop()!).filter(Boolean));

// T5-3 (fixed 2026-11-28): a module's own tests reach inside it; its door offers only what other modules use
test('doors: every name offered is used outside its module', () => {
  const unused: string[] = [];
  for (const door of doors) {
    const home = dirname(door);
    const outside = code.filter((f) => !f.startsWith(home + '/')).map((f) => readFileSync(f, 'utf8')).join('\n');
    for (const name of offered(door)) if (!new RegExp(`\\b${name}\\b`).test(outside)) unused.push(`${relative(SRC, door)}: ${name}`);
  }
  assert.deepEqual(unused, []);
});

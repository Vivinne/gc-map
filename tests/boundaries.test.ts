/*
 * Module boundaries (MODULES.md): which module may use which, and only through its index.
 * Every import in src/ and scripts/ is checked; a new folder that is not listed here fails the test.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Each module: its folder, its layer, and the modules it may use besides itself */
const MODULES: Record<string, { dir: string; uses: string[] }> = {
  tokens: { dir: 'src/shared/tokens', uses: [] },
  ui: { dir: 'src/shared/ui', uses: ['tokens'] },
  storage: { dir: 'src/shared/storage', uses: [] },
  device: { dir: 'src/shared/device', uses: [] },
  data: { dir: 'src/data', uses: ['tokens'] },
  pipeline: { dir: 'scripts/data', uses: ['data'] },
  history: { dir: 'src/core/history', uses: ['data', 'storage'] },
  address: { dir: 'src/core/address', uses: ['data', 'history'] },
  pointing: { dir: 'src/core/pointing', uses: [] },
  // features use shared parts, data, core state and the layout's panel frame; never another feature
  search: { dir: 'src/features/search', uses: ['tokens', 'ui', 'storage', 'device', 'data', 'history'] },
  category: { dir: 'src/features/category', uses: ['tokens', 'ui', 'data'] },
  list: { dir: 'src/features/list', uses: ['tokens', 'ui', 'device', 'data'] },
  card: { dir: 'src/features/card', uses: ['tokens', 'ui', 'data', 'layout'] },
  map: { dir: 'src/features/map', uses: ['tokens', 'ui', 'device', 'data', 'history'] },
  rail: { dir: 'src/features/rail', uses: ['tokens', 'ui'] },
  // the layout never uses a feature
  layout: { dir: 'src/layout', uses: ['tokens', 'ui', 'storage', 'device'] },
  flows: { dir: 'src/flows', uses: ['data', 'history', 'address', 'pointing', 'search', 'category', 'list', 'card', 'map', 'rail', 'layout'] },
  shell: { dir: 'src/shell', uses: ['tokens', 'ui', 'storage', 'device', 'data', 'history', 'address', 'pointing', 'search', 'category', 'list', 'card', 'map', 'rail', 'layout', 'flows'] },
  entry: { dir: 'src/entry', uses: ['shell', 'address'] },
  app: { dir: 'src/app', uses: ['entry', 'tokens'] },
};

const moduleOf = (file: string) => Object.keys(MODULES).find((m) => file === MODULES[m]!.dir || file.startsWith(MODULES[m]!.dir + '/'));

function walk(dir: string): string[] {
  return readdirSync(join(ROOT, dir)).flatMap((n) => {
    const p = join(dir, n);
    return statSync(join(ROOT, p)).isDirectory() ? walk(p) : /\.tsx?$/.test(n) ? [p] : [];
  });
}

/** The file an import points at (null: a package or a data file) */
function target(from: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const base = relative(ROOT, resolve(ROOT, dirname(from), spec));
  for (const t of [base + '.ts', base + '.tsx', base + '/index.ts', base + '/index.tsx', base]) if (existsSync(join(ROOT, t)) && statSync(join(ROOT, t)).isFile()) return t;
  return null;
}

const files = [...walk('src'), ...walk('scripts')].filter((f) => !f.endsWith('.test.ts'));

test('boundaries: every source file belongs to a module', () => {
  const loose = files.filter((f) => !moduleOf(f) && !f.startsWith('scripts/build-'));
  assert.deepEqual(loose, []);
});

test('boundaries: a module uses only the modules it may use, and another module only through its index', () => {
  const wrong: string[] = [];
  for (const f of files) {
    const from = moduleOf(f);
    if (!from) continue;
    for (const [, spec] of readFileSync(join(ROOT, f), 'utf8').matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) {
      const t = target(f, spec!);
      if (!t || /\.(json|css)$/.test(t)) continue;
      const to = moduleOf(t);
      if (to === from) continue;
      if (!to) wrong.push(`${f}: ${spec} (not in a module)`);
      else if (!MODULES[from]!.uses.includes(to)) wrong.push(`${f}: ${from} may not use ${to}`);
      else if (!/\/index\.tsx?$/.test(t) || dirname(t) !== MODULES[to]!.dir) wrong.push(`${f}: ${spec} reaches inside ${to} (use its index)`);
    }
  }
  assert.deepEqual(wrong, []);
});

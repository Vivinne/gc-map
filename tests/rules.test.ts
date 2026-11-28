/*
 * Repo rules (SPEC §13): only TypeScript, CSS and data files; no .js files; code and repo docs in English
 * (study content in content/ and data/ keeps its original wording; the card's keyword label E3 is written as escapes).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = new Set(['node_modules', '.cache', '.git', '.next', 'out', 'site', '.e2e', 'test-results', 'playwright-report', 'coverage']);

function walk(dir: string): string[] {
  return readdirSync(join(ROOT, dir)).flatMap((n) => {
    if (SKIP.has(n)) return [];
    const p = dir ? join(dir, n) : n;
    return statSync(join(ROOT, p)).isDirectory() ? walk(p) : [p];
  });
}
const files = walk('');

test('rules: no .js, .jsx, .mjs or .cjs files in the repo', () => {
  assert.deepEqual(files.filter((f) => /\.(m|c)?jsx?$/.test(f)), []);
});

test('rules: no Chinese characters in code, styles, scripts, tests, workflows or repo docs', () => {
  // CJK ideographs and CJK punctuation; study content (content/, data/, the generated data) is left out
  const CJK = /[\u3000-\u303F\u3400-\u4DBF\u4E00-\u9FFF]/;
  const checked = files.filter((f) => /\.(tsx?|css|ya?ml|md|json)$/.test(f) && !/^(content|data)\//.test(f) && !/^src\/data\/(places|basemap)\.json$/.test(f) && f !== 'package-lock.json');
  // SPEC.md and its approved exception E3 name the label itself
  const found = checked.filter((f) => CJK.test(readFileSync(join(ROOT, f), 'utf8').replace(/`\u95DC\u9375\u5B57\uFF1A`/g, '')));
  assert.deepEqual(found.map((f) => relative('', f)), []);
});

/* A2 deploy: type check and tests before the build; outside actions pinned to a commit. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('D2 / S5 deploy: type check and tests before the build; outside actions pinned to a commit', () => {
  const wf = readFileSync(new URL('../../.github/workflows/deploy.yml', import.meta.url), 'utf8');
  assert.ok(wf.indexOf('npm run typecheck') > 0 && wf.indexOf('npm test') > wf.indexOf('npm run typecheck') && wf.indexOf('npm run build') > wf.indexOf('npm test'));
  for (const line of wf.split('\n').filter((l) => /uses:\s/.test(l))) assert.match(line, /@[0-9a-f]{40}\b/, line.trim());
});

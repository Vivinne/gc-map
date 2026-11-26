/* S1 tokens: style files write no lengths or colours of their own; motion times match. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('C2 tokens: the style modules write no lengths or colours of their own; motion times match tokens.css', async () => {
  const { readdirSync } = await import('node:fs');
  // every module's style file (tokens.css itself holds the values)
  const src = new URL('../../', import.meta.url);
  const files = (readdirSync(src, { recursive: true }) as string[]).filter((f) => f.endsWith('.css') && !f.endsWith('tokens.css'));
  assert.ok(files.length >= 12, `${files.length} style files`);
  for (const f of files) {
    const css = readFileSync(new URL(f, src), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/var\([^,()]+,\s*0px\)/g, '');
    assert.equal(css.match(/(?<![\w-])\d+(\.\d+)?px\b/g), null, `${f}: lengths`);
    assert.equal(css.match(/#[0-9a-fA-F]{3,6}\b|rgba?\(/g), null, `${f}: colours`);
  }
  const { MOTION, PAPER } = await import('./index');
  const tokens = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');
  for (const [k, css] of [['fast', '--t-fast'], ['mid', '--t-mid'], ['slow', '--t-slow'], ['leave', '--leave'], ['slide', '--t-slide']] as const) assert.match(tokens, new RegExp(`${css}: ${MOTION[k]}ms;`));
  assert.match(tokens, new RegExp(`--paper: ${PAPER};`));
});

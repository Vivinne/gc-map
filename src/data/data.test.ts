/* D2 building data: architects joined with "and", one part per person. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

// 2026-11-25 (user): several architects are joined with "and" (two) or commas and a last "and" (three or more);
// a firm stays whole; each name is its own part, the joining words plain text
test('architects joined with and; parts split per person', async () => {
  const { BUILDINGS } = await import('./index');
  const { architectOf, architectParts } = await import('./index');
  const who = BUILDINGS.map(architectOf);
  assert.ok(!who.some((w) => w.includes(' / ')), 'no " / " left');
  assert.ok(who.includes('Richard Rogers and Renzo Piano'));
  const b = BUILDINGS.find((x) => architectOf(x) === 'Enrico Del Debbio, Arnaldo Foschini and Vittorio Ballio Morpurgo')!;
  assert.deepEqual(architectParts(b).map((p) => [p.text, !!p.search]), [['Enrico Del Debbio', true], [', ', false], ['Arnaldo Foschini', true], [' and ', false], ['Vittorio Ballio Morpurgo', true]]);
  const f = BUILDINGS.find((x) => architectOf(x) === 'Shreve, Lamb & Harmon')!;
  assert.equal(architectParts(f).length, 1);
});

/*
 * Compares two flow recordings (e2e/flows.spec.ts with FLOW_RECORD), step by step: the new site against the old.
 * Usage: npx tsx scripts/tools/compare-flows.ts old.jsonl new.jsonl. Prints every step whose state differs.
 */
import { readFileSync } from 'node:fs';

type Row = Record<string, unknown> & { test: string; project: string; step: string };
const read = (f: string): Map<string, Row> => {
  const out = new Map<string, Row>();
  for (const line of readFileSync(f, 'utf8').split('\n').filter(Boolean)) {
    const r = JSON.parse(line) as Row;
    out.set(`${r.project} | ${r.test} | ${r.step}`, r);
  }
  return out;
};

const [oldFile, newFile] = process.argv.slice(2);
if (!oldFile || !newFile) throw new Error('Usage: compare-flows.ts old.jsonl new.jsonl');
const a = read(oldFile);
const b = read(newFile);
let same = 0;
const diffs: string[] = [];
for (const key of new Set([...a.keys(), ...b.keys()])) {
  const x = a.get(key), y = b.get(key);
  if (!x || !y) {
    diffs.push(`${key}: only in ${x ? 'old' : 'new'}`);
    continue;
  }
  const fields = Object.keys(y).filter((k) => JSON.stringify(x[k]) !== JSON.stringify(y[k]));
  if (fields.length) diffs.push(`${key}: ${fields.map((f) => `${f} old=${JSON.stringify(x[f])} new=${JSON.stringify(y[f])}`).join('; ')}`);
  else same++;
}
console.log(`${same} steps the same, ${diffs.length} different`);
for (const d of diffs) console.log(d);
process.exitCode = diffs.length ? 1 : 0;

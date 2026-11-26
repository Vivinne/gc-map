// D1 data pipeline: handout §6 tables + geo-raw.txt (coordinates) + geo-estimate.csv + geo-manual.csv (manual overrides)
//   -> src/data/places.json (only the fields the site reads) and GAPS.md (gaps report)
// Run: npm run data. buildData() is also used by the tests (scripts/data/index.ts).
import { mkdirSync, writeFileSync } from 'node:fs';
import { P } from './common';
import { buildData, siteData } from './build';
import { gapsMarkdown } from './check';
import type { Unlocated } from './types';

export function main() {
  const r = buildData();
  writeFileSync(P('GAPS.md'), gapsMarkdown(r.places, r.unlocated));
  mkdirSync(P('src/data'), { recursive: true });
  writeFileSync(P('src/data/places.json'), JSON.stringify(siteData(r), null, 1));
  const { places, unlocated } = r;
  const count = (k: Unlocated['kind']) => unlocated.filter((u) => u.kind === k).length;
  const report = [
    `Rows ${places.length} | located ${places.filter((p) => p.points.length).length} | markers ${places.reduce((n, p) => n + p.points.length, 0)} | unlocated ${unlocated.length} (no-location ${count('no-location')} / not-found ${count('not-found')} / partial ${count('partial')})`,
    ...r.warns.map((w) => `Warning: ${w}`),
    ...r.errors.map((e) => `Error: ${e}`),
  ];
  console.log(report.join('\n'));
  if (r.errors.length) process.exit(1);
}

main();

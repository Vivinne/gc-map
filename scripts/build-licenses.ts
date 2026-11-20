// Licence notices of the code and font the site ships (P2, licences): MapLibre (BSD-3), the Archivo font (OFL),
// React, Next.js, d3, TopoJSON, world-atlas, and the map data sources. Written to public/licenses.txt at every
// build, so the published site carries them; nothing on screen links to it.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PACKAGES = ['maplibre-gl', '@fontsource-variable/archivo', 'react', 'react-dom', 'scheduler', 'next', 'd3-geo', 'd3-array', 'internmap', 'topojson-client', 'world-atlas'];
const FILES = ['LICENSE', 'LICENSE.txt', 'LICENSE.md', 'license.md', 'license'];

const root = join(import.meta.dirname, '..');
const parts = [
  'GC Atlas — licence notices for the software, font and map data used by this site.',
  '',
  'Map data: Natural Earth (public domain); OpenFreeMap tiles built with OpenMapTiles; © OpenStreetMap contributors (ODbL, https://www.openstreetmap.org/copyright).',
];
for (const name of PACKAGES) {
  const dir = join(root, 'node_modules', name);
  const file = FILES.map((f) => join(dir, f)).find((f) => existsSync(f));
  if (!file) throw new Error(`no licence file for ${name}`);
  const { version } = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { version: string };
  parts.push('', '='.repeat(72), `${name} ${version}`, '='.repeat(72), readFileSync(file, 'utf8').trim());
}
writeFileSync(join(root, 'public', 'licenses.txt'), `${parts.join('\n')}\n`);
console.log(`licenses: ${PACKAGES.length} packages`);

// Builds the offline basemap (src/data/basemap.json) from Natural Earth via the world-atlas package:
// the 1:50m country polygons as one TopoJSON topology, simplified (Visvalingam, keeping the most
// significant points) and quantized so the file stays small. The site fills the countries as land and
// draws the shared country edges as borders, so the map works without any tile server.
// Countries are used instead of the merged land polygon because the merged Eurasia ring, which runs
// along the antimeridian, is cut into broken pieces by MapLibre's tiler.
// Run: npx tsx scripts/build-basemap.ts (part of npm run data)
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { quantize } from 'topojson-client';
import { filter, filterWeight, presimplify, quantile, simplify } from 'topojson-simplify';
import type { GeometryCollection, Topology } from 'topojson-specification';

type Countries = Topology<{ countries: GeometryCollection<{ name?: string }> }>;

const require = createRequire(import.meta.url);
const read = (name: string) => JSON.parse(readFileSync(require.resolve(`world-atlas/${name}`), 'utf8')) as Countries;

/** Keep the given share of points (by Visvalingam weight), drop rings that become too small, then quantize */
function lighten(topo: Countries, keep: number): Countries {
  let t = presimplify(topo);
  const minWeight = quantile(t, 1 - keep);
  t = simplify(t, minWeight);
  return quantize(filter(t, filterWeight(t, minWeight)), 4e4) as Countries;
}

const countries = lighten(read('countries-50m.json'), 0.45);
delete countries.bbox;
// Names are not used by the site
for (const g of countries.objects.countries.geometries) delete g.properties;
const json = JSON.stringify(countries);
writeFileSync(new URL('../src/data/basemap.json', import.meta.url), json);
console.log(`basemap.json written (${(json.length / 1024).toFixed(0)} KB)`);

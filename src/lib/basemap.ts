import type { FeatureCollection, Geometry } from 'geojson';
import { feature, mesh } from 'topojson-client';
import type { GeometryObject, Topology } from 'topojson-specification';
import basemapJson from '../data/basemap.json';

const raw = basemapJson as unknown as Topology;

type Ring = number[][];

/** Signed area (shoelace); positive = counter-clockwise */
function area(r: Ring): number {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += ((r[j]![0] ?? 0) - (r[i]![0] ?? 0)) * ((r[j]![1] ?? 0) + (r[i]![1] ?? 0));
  return a / 2;
}

/**
 * TopoJSON decodes polygons clockwise (the d3 convention). MapLibre's tiler reads ring roles from the
 * winding (RFC 7946: outer counter-clockwise, holes clockwise), so rings are rewound before use.
 */
/**
 * Rings that cross the antimeridian (Russia, the Aleutians of the United States, Fiji) jump from +180 to
 * -180 inside one ring, which the tiler draws as bands and boxes across the whole world. Such a ring is
 * made continuous by moving its western-hemisphere points 360 degrees east (that part then lies off the
 * single world copy the map shows).
 */
function unwrap(r: Ring): Ring {
  let crosses = false;
  for (let i = 1; i < r.length; i++) if (Math.abs((r[i]![0] ?? 0) - (r[i - 1]![0] ?? 0)) > 180) crosses = true;
  if (!crosses) return r;
  return r.map(([x = 0, y = 0]) => [x < 0 ? x + 360 : x, y]);
}

function rewindPolygon(rings: Ring[]): Ring[] {
  return rings.map(unwrap).map((r, i) => {
    const ccw = area(r) > 0;
    return (i === 0) === ccw ? r : [...r].reverse();
  });
}

function rewind(fc: FeatureCollection<Geometry>): FeatureCollection<Geometry> {
  for (const f of fc.features) {
    const g = f.geometry;
    if (g.type === 'Polygon') g.coordinates = rewindPolygon(g.coordinates);
    else if (g.type === 'MultiPolygon') g.coordinates = g.coordinates.map(rewindPolygon);
  }
  return fc;
}

let cache: { land: FeatureCollection<Geometry>; borders: FeatureCollection<Geometry> } | null = null;

/** Natural Earth countries (filled as land) and inland borders as GeoJSON, decoded once; polygons rewound to RFC 7946 */
export function basemap() {
  if (!cache) {
    const asFc = (g: ReturnType<typeof feature>): FeatureCollection<Geometry> =>
      (g.type === 'FeatureCollection' ? g : { type: 'FeatureCollection', features: [g] }) as FeatureCollection<Geometry>;
    cache = {
      land: rewind(asFc(feature(raw, raw.objects.countries as GeometryObject))),
      borders: { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: mesh(raw, raw.objects.countries as GeometryObject, (a, b) => a !== b) }] },
    };
  }
  return cache;
}

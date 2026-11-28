// D1 data pipeline: coordinates (geo-raw.txt, geo-estimate.csv, geo-manual.csv), range checks and countries
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { geoArea, geoContains, geoDistance } from 'd3-geo';
import type { Feature, FeatureCollection, MultiPolygon, Polygon, Position } from 'geojson';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import type { Precision } from '../../src/data';
import { fields, mustRead, readText } from './common';
import { parseCoord } from './parse';
import type { RawPoint, Row } from './types';

// ---------- Range check (coarse: location column -> centre point + allowed km) ----------
const CITY: Record<string, [number, number, number]> = {
  Rome: [41.9, 12.49, 25], Vatican: [41.9, 12.49, 25], Milan: [45.465, 9.19, 25], Pisa: [43.72, 10.4, 15], Florence: [43.77, 11.255, 15],
  Siena: [43.32, 11.33, 15], Venice: [45.44, 12.33, 15], Vicenza: [45.55, 11.55, 15], Veneto: [45.6, 11.8, 120], Parma: [44.8, 10.33, 15],
  Puglia: [41.0, 16.3, 150], Assisi: [43.07, 12.62, 15], Rimini: [44.06, 12.57, 15], Caprarola: [42.33, 12.23, 15], Turin: [45.07, 7.69, 25],
  Caserta: [41.07, 14.33, 15], Pienza: [43.08, 11.68, 15], Mantua: [45.16, 10.79, 15], Agrigento: [37.3, 13.58, 30], 'Mont-Saint-Michel': [48.636, -1.511, 15],
  'Saint-Denis': [48.936, 2.357, 15], Mantes: [48.99, 1.72, 15], Paris: [48.857, 2.35, 25], Chartres: [48.447, 1.488, 15], Bourges: [47.08, 2.4, 15],
  Reims: [49.25, 4.03, 15], Amiens: [49.895, 2.3, 15], Strasbourg: [48.58, 7.75, 15], 'Orléans': [47.9, 1.91, 15], Fontainebleau: [48.4, 2.7, 15],
  Versailles: [48.8, 2.12, 15], Poissy: [48.93, 2.05, 20], Ronchamp: [47.7, 6.62, 15], Athens: [37.97, 23.73, 20], Istanbul: [41.01, 28.98, 30],
  Salisbury: [51.07, -1.79, 15], Cologne: [50.94, 6.96, 20], Seville: [37.39, -5.99, 20], Berlin: [52.52, 13.4, 25], Munich: [48.14, 11.57, 20],
  London: [51.507, -0.128, 20], Kent: [51.2, 0.7, 80], Barcelona: [41.39, 2.17, 20], Vienna: [48.21, 16.37, 20], Brussels: [50.85, 4.36, 20],
  Dessau: [51.84, 12.23, 20], Stuttgart: [48.78, 9.18, 20], Utrecht: [52.09, 5.12, 20], 'New York': [40.75, -73.98, 30], Pennsylvania: [40.9, -77.8, 300],
  Prague: [50.08, 14.43, 20], Paimio: [60.45, 22.7, 20], Cambridge: [42.37, -71.1, 20], Como: [45.81, 9.08, 15], Verona: [45.44, 10.99, 15],
  Bilbao: [43.26, -2.93, 20], Tokyo: [35.68, 139.76, 30], 'Abu Dhabi': [24.47, 54.37, 40],
  // "Supplementary locations" for rows with no handout location, or where the source disagrees with the handout
  Marseille: [43.3, 5.37, 20], Altivole: [45.75, 11.91, 10], 'Weil am Rhein': [47.6, 7.61, 10], Wolfsburg: [52.42, 10.79, 15],
  'Saint Petersburg': [59.94, 30.31, 20], Naples: [40.85, 14.27, 20], Padua: [45.41, 11.88, 15], Urbino: [43.72, 12.64, 10], Madrid: [40.42, -3.7, 20],
  Glasgow: [55.86, -4.25, 20], Chicago: [41.88, -87.63, 30], Seattle: [47.61, -122.33, 25], 'Kuala Lumpur': [3.14, 101.69, 20], 'New Canaan': [41.15, -73.49, 10],
  Pasadena: [34.15, -118.14, 15], 'Palm Springs': [33.83, -116.55, 15], 'Éveux': [45.82, 4.62, 10], Amsterdam: [52.37, 4.9, 20], Elciego: [42.51, -2.62, 10],
  Noormarkku: [61.59, 21.88, 15], Vyborg: [60.71, 28.75, 20], Alfeld: [51.98, 9.82, 10],
  Columbus: [39.99, -83.0, 25], 'San Diego': [32.85, -117.2, 30], Philadelphia: [39.95, -75.17, 30], Imola: [44.36, 11.71, 15],
};
// Drop parenthesised qualifiers (ASCII or full-width) and any CJK words, e.g. a country suffix or a "near" qualifier
export const cityKey = (loc: string) => loc.replace(/[(\uFF08].*?[)\uFF09]/g, '').replace(/[\u3000-\u9FFF\uFF00-\uFFEF]+/g, '').trim();
const km = (a: number, b: number, c: number, d: number) => {
  const R = 6371;
  const r = Math.PI / 180;
  const dLat = (c - a) * r;
  const dLng = (d - b) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
};

/** Every coordinate line for the rows, checked against the handout location; problems go to errors and warns */
export function loadPoints(byName: Map<string, Row>, gone: (name: string) => boolean, errors: string[], warns: string[]) {
  // Coordinate file
  const pts = new Map<string, RawPoint[]>();
  const addPoint = (name: string, p: RawPoint) => pts.set(name, [...(pts.get(name) ?? []), p]);
  const misses: { name: string; sub: string; page: string; reason: string }[] = [];
  for (const [i, line] of mustRead('data/geo-raw.txt').split(/\r?\n/).entries()) {
    if (!line.trim() || line.startsWith('#')) continue;
    const [key = '', sub = '', page = '', raw = '', note = ''] = fields(line);
    const at = `geo-raw line ${i + 1}`;
    const row = byName.get(key);
    if (!row) {
      if (!gone(key)) errors.push(`${at}: building not found: "${key}"`);
      continue;
    }
    if (raw === 'NONE' || raw === '') {
      misses.push({ name: key, sub, page, reason: note || 'No coordinate found' });
      continue;
    }
    let c: { lat: number; lng: number };
    try {
      c = parseCoord(raw);
    } catch (e) {
      errors.push(`${at}: ${(e as Error).message}`);
      continue;
    }
    // A note starting with "Supplementary location: X" or "Location per source: X" -> range-check against X; a row with no handout location must have "Supplementary location"
    const ov = /^(Supplementary location|Location per source): ([^;(]+)/.exec(note);
    if (!row.loc && ov?.[1] !== 'Supplementary location') {
      errors.push(`${at}: "${key}" has no handout location, so its note must start with "Supplementary location: City"`);
      continue;
    }
    const ck = ov ? ov[2]!.trim() : cityKey(row.loc);
    const box = CITY[ck];
    if (!box) {
      if (ov || !row.loc) errors.push(`CITY has no range for "${ck}", cannot check: ${key}`);
      else warns.push(`No range check: ${row.name} (${row.loc})`);
    } else {
      const d = km(box[0], box[1], c.lat, c.lng);
      if (d > box[2]) errors.push(`Coordinate is ${d.toFixed(0)} km from "${ck}" (limit ${box[2]}): ${row.name} ${raw}`);
    }
    const precision: Precision = /approximate/i.test(note) ? 'approx' : /taken from the containing|original site/i.test(note) ? 'contained' : 'page';
    let sourceUrl: string;
    if (page.startsWith('url:')) {
      sourceUrl = page.slice(4);
      if (!/^https:\/\/[^\s]+$/.test(sourceUrl)) {
        errors.push(`${at}: url must be an https URL`);
        continue;
      }
    } else {
      const k = page.indexOf(':');
      sourceUrl = `https://${page.slice(0, k)}.wikipedia.org/wiki/${encodeURI(page.slice(k + 1))}`;
    }
    addPoint(key, { sub, lat: c.lat, lng: c.lng, precision, note, sourceUrl, status: 'Supplementary - to be verified' });
  }

  // Memory estimates (geo-estimate.csv: name,sub,lat,lng,conf,note): no source, unverified; they never override a point already in geo-raw, and are not allowed for rows with no handout location
  const CONF: Record<string, string> = {
    h: 'High confidence (within about 300 m)',
    m: 'Medium confidence (within about 1 km)',
    l: 'Low confidence (may be several km off, or a linear / grouped item)',
  };
  const csvLines = (file: string) => readText(file)?.split(/\r?\n/).entries() ?? [];
  const badLatLng = (lat: string, lng: string) => !Number.isFinite(+lat) || !Number.isFinite(+lng) || Math.abs(+lat) > 90 || Math.abs(+lng) > 180;
  const rangeCheck = (at: string, row: Row, lat: number, lng: number, warnMissing: boolean) => {
    const box = CITY[cityKey(row.loc)];
    if (box) {
      const d = km(box[0], box[1], lat, lng);
      if (d > box[2]) errors.push(`${at}: coordinate is ${d.toFixed(0)} km from "${cityKey(row.loc)}" (limit ${box[2]}): ${row.name}`);
    } else if (warnMissing) warns.push(`No range check: ${row.name} (${row.loc})`);
  };
  for (const [i, line] of csvLines('data/geo-estimate.csv')) {
    if (i === 0 || !line.trim() || line.startsWith('#')) continue;
    const [name = '', sub = '', lat = '', lng = '', conf = '', note = ''] = line.split(',').map((s) => s.trim());
    const at = `geo-estimate line ${i + 1}`;
    const row = byName.get(name);
    if (!row) {
      if (!gone(name)) errors.push(`${at}: building not found: "${name}"`);
      continue;
    }
    if (!row.loc) {
      errors.push(`${at}: "${name}" has no handout location, so no estimate is allowed`);
      continue;
    }
    if (!lat || !lng || badLatLng(lat, lng)) {
      errors.push(`${at}: lat/lng is not a valid number`);
      continue;
    }
    if (!CONF[conf]) {
      errors.push(`${at}: conf must be h, m or l`);
      continue;
    }
    rangeCheck(at, row, +lat, +lng, true);
    if ((pts.get(name) ?? []).some((p) => p.sub === sub)) {
      warns.push(`geo-estimate skipped (coordinate already present): ${name}${sub ? ' / ' + sub : ''}`);
      continue;
    }
    addPoint(name, { sub, lat: +lat, lng: +lng, precision: 'estimate', note: [CONF[conf], note].filter(Boolean).join('; '), sourceUrl: '', status: 'Memory estimate - unverified' });
  }

  // Manual overrides (geo-manual.csv: name,sub,lat,lng,source_url,note)
  for (const [i, line] of csvLines('data/geo-manual.csv')) {
    if (i === 0 || !line.trim() || line.startsWith('#')) continue;
    const [name = '', sub = '', lat = '', lng = '', url = '', note = ''] = line.split(',').map((s) => s.trim());
    if (!lat || !lng) continue;
    const at = `geo-manual line ${i + 1}`;
    const row = byName.get(name);
    if (!row) {
      if (!gone(name)) errors.push(`${at}: building not found: "${name}"`);
      continue;
    }
    if (badLatLng(lat, lng)) {
      errors.push(`${at}: lat/lng is not a valid number`);
      continue;
    }
    rangeCheck(at, row, +lat, +lng, false);
    pts.set(name, [...(pts.get(name) ?? []).filter((p) => p.sub !== sub), { sub, lat: +lat, lng: +lng, precision: 'manual', note, sourceUrl: url, status: 'Entered manually' }]);
  }

  return { pts, misses };
}

/** Country of each building from its first coordinate (Natural Earth 1:10m country polygons) */
export function nationsOf(places: { points: { lat: number; lng: number }[] }[]): string[] {
  const req = createRequire(import.meta.url);
  const topo = JSON.parse(readFileSync(req.resolve('world-atlas/countries-10m.json'), 'utf8')) as Topology<{ countries: GeometryCollection<{ name: string }> }>;
  const nations = (feature(topo, topo.objects.countries) as FeatureCollection<Polygon | MultiPolygon, { name: string }>).features;
  // A ring wound the wrong way covers the rest of the globe (area above a hemisphere): leave those out of the test
  const sane = nations.filter((n) => geoArea(n) < 2 * Math.PI);
  const polygonsOf = (n: Feature<Polygon | MultiPolygon>): Position[][][] =>
    n.geometry?.type === 'Polygon' ? [n.geometry.coordinates] : n.geometry?.type === 'MultiPolygon' ? n.geometry.coordinates : [];
  return places.map((p) => {
    const pt = p.points[0];
    if (!pt) return '';
    const at: [number, number] = [pt.lng, pt.lat];
    let f = sane.find((n) => geoContains(n, at));
    if (!f) {
      // On an island or coast missing from the outline: the country with the closest outline point
      let best = Infinity;
      for (const n of nations) {
        for (const poly of polygonsOf(n))
          for (const ring of poly)
            for (const c of ring) {
              const d = geoDistance(at, c as [number, number]);
              if (d < best) {
                best = d;
                f = n;
              }
            }
      }
    }
    return f?.properties?.name ?? '';
  });
}

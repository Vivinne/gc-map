// Build data: handout §6 tables + geo-raw.txt (coordinates) + geo-estimate.csv + geo-manual.csv (manual overrides)
//   -> src/data/places.json (only the fields the site reads) and GAPS.md (gaps report)
// Run: npx tsx scripts/build-data.ts (npm run data). buildData() is also used by the tests, which check the
// source and audit fields (coordinate sources, precision) that the site file leaves out.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { geoArea, geoBounds, geoContains, geoDistance } from 'd3-geo';
import type { Feature, FeatureCollection, MultiPolygon, Polygon, Position } from 'geojson';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import type { EraId, Precision, SiteData } from '../src/lib/types';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const P = (...a: string[]) => resolve(ROOT, ...a);

// ---------- Era groups, in time order (their colours live in src/styles/tokens.ts) ----------
export const ERAS: { id: EraId; label: string; styles: string[] }[] = [
  { id: 'ancient', label: 'Ancient', styles: ['6.1', '6.2'] },
  { id: 'medieval', label: 'Medieval', styles: ['6.3', '6.4', '6.5'] },
  { id: 'renaissance', label: 'Renaissance', styles: ['6.6'] },
  // Mannerism has no handout heading of its own: its buildings move here through data/style-split.txt
  { id: 'mannerism', label: 'Mannerism', styles: [] },
  { id: 'baroque', label: 'Baroque', styles: ['6.7'] },
  { id: 'neoclassicism', label: 'Neoclassicism', styles: ['6.8'] },
  { id: 'artnouveau', label: 'Art Nouveau', styles: ['6.10'] },
  { id: 'beauxarts', label: 'Beaux-Arts', styles: ['6.14'] },
  { id: 'modern', label: 'Modern', styles: ['6.9', '6.11', '6.12', '6.13'] },
  { id: 'others', label: 'Others', styles: ['6.15'] },
];
const isEra = (id: string): id is EraId => ERAS.some((e) => e.id === id);
const eraOfStyle = (sid: string) => ERAS.find((e) => e.styles.includes(sid))?.id;

/** Data lines of a file in data/: blank lines and # comments left out */
const dataLines = (file: string) =>
  readFileSync(resolve(ROOT, file), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.startsWith('#'));
/** Fields of a "a | b | c" line, trimmed */
const fields = (l: string) => l.split('|').map((x) => x.trim());

// ---------- Parse handout §6 ----------
export interface Style {
  id: string;
  name: string;
}

export interface HandoutRow {
  name: string;
  loc: string;
  year: string;
  who: string;
  note: string;
  style: Style;
}

export function parseHandout(md: string): { rows: HandoutRow[]; styles: Style[] } {
  const rows: HandoutRow[] = [];
  const styles: Style[] = [];
  let style: Style | null = null;
  let inTable = false;
  let headerOk = false;
  for (const line of md.split(/\r?\n/)) {
    const h = /^###\s+(6\.\d+)\s+(.+?)\s*$/.exec(line);
    if (h) {
      style = { id: h[1]!, name: h[2]! };
      styles.push(style);
      inTable = false;
      headerOk = false;
      continue;
    }
    if (!line.startsWith('|')) {
      inTable = false;
      headerOk = false;
      continue;
    }
    const cells = line.replace(/^\||\|\s*$/g, '').split('|').map((s) => s.trim());
    if (!inTable) {
      inTable = true;
      headerOk = cells.length === 4; // columns: building, year, architect / person, notes
      continue;
    }
    if (/^:?-{3,}/.test(cells[0]!)) continue;
    if (!headerOk || !style) continue;
    if (cells.length !== 4) throw new Error(`Wrong column count in ${style.id}: ${line.slice(0, 50)}`);
    const [first, year, who, note] = cells as [string, string, string, string];
    const [name, ...rest] = first.split(/<br\s*\/?>/i);
    const loc = (/<span class="loc">(.*?)<\/span>/.exec(rest.join(''))?.[1] ?? '').trim();
    rows.push({ name: name!.trim(), loc, year, who, note, style });
  }
  return { rows, styles };
}

const ascii = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

export function slug(name: string): string {
  const base = ascii(name) || 'x';
  // names containing Han characters (or nothing ASCII at all) get a short hash so that distinct names never collapse to one slug
  return /\p{Script=Han}/u.test(name) || base === 'x' ? `${base}-${createHash('sha1').update(name).digest('hex').slice(0, 4)}` : base;
}

// ---------- Coordinate parsing ----------
export function parseCoord(raw: string): { lat: number; lng: number } {
  const s = raw.replace(/\s*\/\s*.*$/, '').trim(); // drop a trailing " / decimal" part and keep the first group
  const re = /(-?\d+(?:\.\d+)?)\s*°?\s*(?:(\d+(?:\.\d+)?)\s*[′']\s*)?(?:(\d+(?:\.\d+)?)\s*[″"]\s*)?\s*([NSEW])\b/g;
  const hits = [...s.matchAll(re)];
  let lat: number | undefined;
  let lng: number | undefined;
  if (hits.length >= 2) {
    for (const m of hits) {
      const v = (Math.abs(+m[1]!) + (m[2] ? +m[2] / 60 : 0) + (m[3] ? +m[3] / 3600 : 0)) * (/[SW]/.test(m[4]!) ? -1 : 1);
      if (/[NS]/.test(m[4]!)) lat = v;
      else lng = v;
    }
  } else {
    const d = /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/.exec(s);
    if (d) {
      lat = +d[1]!;
      lng = +d[2]!;
    }
  }
  if (lat == null || lng == null || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new Error(`Cannot parse coordinate: ${raw}`);
  return { lat: +lat.toFixed(6), lng: +lng.toFixed(6) };
}

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
const cityKey = (loc: string) => loc.replace(/[(（].*?[)）]/g, '').replace(/[　-鿿＀-￯]+/g, '').trim();
const km = (a: number, b: number, c: number, d: number) => {
  const R = 6371;
  const r = Math.PI / 180;
  const dLat = (c - a) * r;
  const dLng = (d - b) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
};

/** Patterns that must never appear in displayed fields (data/leak-patterns.txt, one /regex/flags per line) */
export const LEAK = dataLines('data/leak-patterns.txt').map((l) => {
  const k = l.lastIndexOf('/');
  return new RegExp(l.slice(1, k), l.slice(k + 1));
});

// ---------- Full dataset (with source and audit fields) ----------
export interface AuditPoint {
  id: string;
  sub: string;
  lat: number;
  lng: number;
  precision: Precision;
  note: string;
  sourceUrl: string;
  status: string;
}

export interface AuditPlace {
  id: string;
  name: string;
  loc: string;
  locLabel: string;
  year: string;
  built: string;
  who: string;
  note: string;
  summary: string;
  country: string;
  exams: number[];
  style: string;
  styleId: string;
  era: EraId;
  eras: EraId[];
  points: AuditPoint[];
  tags: string[];
  tagsEn: string[];
  styleCard: string;
  nation: string;
  styleShown: string;
}

export interface Unlocated {
  id: string;
  name: string;
  loc: string;
  kind: 'no-location' | 'not-found' | 'partial';
  sub?: string;
  reason: string;
}

export interface BuildResult {
  styles: Style[];
  places: AuditPlace[];
  unlocated: Unlocated[];
  /** Handout rows before the removed buildings are taken out */
  handoutRows: number;
  errors: string[];
  warns: string[];
}

interface Row extends HandoutRow {
  id: string;
  summary: string;
  built: string;
  country: string;
  exams: number[];
  era: EraId;
  eras: EraId[];
}

type RawPoint = Omit<AuditPoint, 'id'>;

/** Country of each building from its first coordinate (Natural Earth 1:10m country polygons) */
function nationsOf(places: { points: { lat: number; lng: number }[] }[]): string[] {
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

export function buildData(): BuildResult {
  const errors: string[] = [];
  const warns: string[] = [];
  // Fixed ids for names that would otherwise get a hash-suffixed slug (data/id-aliases.txt: name | id)
  const ID_ALIAS = new Map(dataLines('data/id-aliases.txt').map((l) => fields(l) as [string, string]));
  // Buildings the user took off the site (data/removed.txt): dropped here, and lines about them in the other data files are ignored
  const REMOVED = new Set(dataLines('data/removed.txt').map((l) => l.trim()));
  const gone = (n: string) => REMOVED.has(n);
  const parsed = parseHandout(readFileSync(P('content/handout-c3-s6.md'), 'utf8'));
  const { styles } = parsed;
  for (const n of REMOVED) if (!parsed.rows.some((r) => r.name === n)) errors.push(`removed.txt: no handout row named "${n}"`);
  const handout = parsed.rows.filter((r) => !gone(r.name));
  const names = new Set(handout.map((r) => r.name));
  const unknown = (file: string, keys: Iterable<string>) => {
    for (const n of keys) if (!gone(n) && !names.has(n)) errors.push(`${file}: name matches no handout row: ${n}`);
  };

  // Displayed person names (data/architects.txt): full names for architects, short common names for rulers
  const ARCH = new Map(dataLines('data/architects.txt').map((l) => fields(l) as [string, string]));
  // Per-row span and summary (data/entries.txt)
  const entries = new Map<string, { span: string; summary: string }>();
  for (const l of dataLines('data/entries.txt')) {
    const [name = '', span = '', summary = ''] = fields(l);
    if (entries.has(name)) errors.push(`entries.txt: duplicate name: ${name}`);
    entries.set(name, { span, summary });
  }
  unknown('entries.txt', entries.keys());
  // English built span for display (data/years-display.txt); rows not listed show their span as written
  const BUILT = new Map(dataLines('data/years-display.txt').map((l) => fields(l) as [string, string]));
  unknown('years-display.txt', BUILT.keys());
  const COUNTRIES = ['Italy', 'France', 'Germany', 'United Kingdom', 'United States', 'Others'];
  const cmap = new Map(dataLines('data/countries.txt').map((l) => fields(l) as [string, string]));
  // Extra style tags (data/extra-styles.txt): a building whose source states several styles counts under all of them
  const extraMap = new Map<string, EraId[]>();
  for (const l of dataLines('data/extra-styles.txt')) {
    const [n = '', ids = ''] = fields(l);
    const list = ids.split(',').map((x) => x.trim()).filter(Boolean);
    if (!list.length || !list.every(isEra)) errors.push(`extra-styles.txt: bad era id for ${n}`);
    extraMap.set(n, list.filter(isEra));
  }
  unknown('extra-styles.txt', extraMap.keys());
  const exMap = new Map<string, number[]>();
  for (const l of dataLines('data/exams.txt')) {
    const [n = '', ys = ''] = fields(l);
    const yrs = ys.split(',').map((x) => Number(x.trim()));
    if (!yrs.length || yrs.some((y) => !Number.isInteger(y) || y < 2007 || y > 2019)) errors.push(`exams.txt: bad years for ${n}`);
    exMap.set(n, yrs.sort((a, c) => a - c));
  }
  unknown('exams.txt', exMap.keys());

  const seen = new Map<string, string>();
  const rows: Row[] = handout.map((h) => {
    const who = ARCH.get(h.who) ?? h.who;
    const e = entries.get(h.name);
    if (!e) errors.push(`entries.txt: no line for handout row: ${h.name}`);
    const year = e?.span || h.year;
    const country = cmap.get(h.loc || h.name) ?? '';
    if (!COUNTRIES.includes(country)) errors.push(`countries.txt: no valid country for "${h.loc || h.name}" (${h.name})`);
    const id = (ID_ALIAS.get(h.name) ?? slug(h.name)) + (h.loc ? '-' + (ascii(cityKey(h.loc)) || 'x') : '');
    if (seen.has(id)) errors.push(`Duplicate id: ${id} (${seen.get(id)} / ${h.name})`);
    seen.set(id, h.name);
    const era = eraOfStyle(h.style.id);
    if (!era) errors.push(`No era group: ${h.style.id}`);
    const row: Row = {
      ...h,
      who,
      year,
      id,
      summary: e?.summary ?? '',
      built: BUILT.get(h.name) ?? year,
      country,
      exams: exMap.get(h.name) ?? [],
      era: era ?? 'others',
      eras: [...new Set([era ?? 'others', ...(extraMap.get(h.name) ?? [])])],
    };
    // Leak scan
    for (const f of ['name', 'loc', 'year', 'who', 'note', 'summary'] as const) for (const re of LEAK) if (re.test(row[f])) errors.push(`Leak: ${row.name}.${f} matches ${re}`);
    return row;
  });
  const byName = new Map(rows.map((r) => [r.name, r]));
  if (byName.size !== rows.length) errors.push('Duplicate building names; the coordinate files cannot map them uniquely');

  // Coordinate file
  const pts = new Map<string, RawPoint[]>();
  const addPoint = (name: string, p: RawPoint) => pts.set(name, [...(pts.get(name) ?? []), p]);
  const misses: { name: string; sub: string; page: string; reason: string }[] = [];
  for (const [i, line] of readFileSync(P('data/geo-raw.txt'), 'utf8').split(/\r?\n/).entries()) {
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
  const csvLines = (file: string) => (existsSync(P(file)) ? readFileSync(P(file), 'utf8').split(/\r?\n/).entries() : []);
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

  // Display overrides synced from the user's Doc (data/doc-display.txt): name, location label and architect shown to readers; keys stay as in the handout
  const DISP = new Map(
    dataLines('data/doc-display.txt').map((l) => {
      const [k = '', n = '', lc = '', w = ''] = fields(l);
      return [k, { n, lc, w }] as const;
    }),
  );
  for (const k of DISP.keys()) if (!gone(k) && !names.has(k)) errors.push(`doc-display.txt: no building named "${k}"`);
  /** "id | name | value" files: value by id; every id must be a building */
  const byId = <T>(file: string, value: (v: string) => T) => {
    const m = new Map(
      dataLines(file).map((l) => {
        const [id = '', , v = ''] = fields(l);
        return [id, value(v)] as const;
      }),
    );
    for (const id of m.keys()) if (!seen.has(id)) errors.push(`${file.replace('data/', '')}: no building with id "${id}"`);
    return m;
  };
  const list = (sep: string) => (v: string) => v.split(sep).map((x) => x.trim()).filter(Boolean);
  // Building tags, edited by the user: "~~x~~" = the building lacks x
  const TAGS_ZH = byId('data/tags-zh.txt', list('・'));
  const TAGS_EN = byId('data/tags-en.txt', list(' · '));
  // Style shown on the card instead of Modernism
  const STYLE_CARD = byId('data/style-card.txt', (v) => v);
  // Photo link search words: the photo link was removed in the redesign; the file is kept and still checked
  byId('data/photo-query.txt', (v) => v);

  const places: AuditPlace[] = rows.map((r) => {
    const d = DISP.get(r.name);
    return {
      id: r.id,
      name: d?.n || r.name,
      loc: r.loc,
      locLabel: d?.lc || r.loc,
      year: r.year,
      built: r.built,
      who: d?.w || r.who,
      note: r.note,
      summary: r.summary,
      country: r.country,
      exams: r.exams,
      style: r.style.name,
      styleId: r.style.id,
      era: r.era,
      eras: r.eras,
      points: (pts.get(r.name) ?? []).map((p, n) => ({ id: `${r.id}~${n}`, ...p })),
      tags: TAGS_ZH.get(r.id) ?? [],
      tagsEn: TAGS_EN.get(r.id) ?? [],
      styleCard: STYLE_CARD.get(r.id) ?? '',
      nation: '',
      styleShown: '',
    };
  });
  nationsOf(places).forEach((n, i) => (places[i]!.nation = n));

  // One style for buildings filed under a combined heading (data/style-split.txt, reviewed by the user)
  for (const l of dataLines('data/style-split.txt')) {
    const [n = '', st = '', era = ''] = fields(l);
    if (gone(n)) continue;
    const p = places.find((x) => x.id === byName.get(n)?.id) ?? places.find((x) => x.name === n);
    if (!p) {
      errors.push(`style-split.txt: no building named "${n}"`);
      continue;
    }
    p.styleShown = st;
    if (era) {
      if (!isEra(era)) {
        errors.push(`style-split.txt: bad era id ${era}`);
        continue;
      }
      p.eras = [...new Set([era, ...p.eras.filter((e) => e !== p.era)])];
      p.era = era;
    }
  }
  // The style an architect was quizzed under: the quiz was removed in the redesign; the file is kept and still checked
  for (const l of dataLines('data/architect-style.txt')) {
    const [k = ''] = fields(l);
    if (!places.some((p) => p.who === k)) errors.push(`architect-style.txt: no architect "${k}"`);
  }

  const unlocated: Unlocated[] = [];
  for (const p of places) {
    const m = misses.filter((x) => x.name === p.name && !p.points.some((pt) => pt.sub === x.sub));
    if (!p.loc && !p.points.length) unlocated.push({ id: p.id, name: p.name, loc: '', kind: 'no-location', reason: 'No location in the handout and no coordinate found' });
    else if (p.loc && !p.points.length) unlocated.push({ id: p.id, name: p.name, loc: p.loc, kind: 'not-found', reason: m[0]?.reason ?? 'Not yet looked up' });
    else if (p.loc) for (const x of m) unlocated.push({ id: p.id, name: p.name, loc: p.loc, kind: 'partial', sub: x.sub, reason: x.reason });
  }
  const geoMissingOnly = misses.filter((x) => !byName.get(x.name)?.loc);
  if (geoMissingOnly.length) warns.push(`Rows with no location but with lookup records: ${geoMissingOnly.map((x) => x.name).join(', ')}`);

  return { styles, places, unlocated, handoutRows: parsed.rows.length, errors, warns };
}

/** The site file: only the fields the site reads, and only buildings that have a coordinate */
export function siteData(r: BuildResult): SiteData {
  return {
    eras: ERAS.map(({ id, label }) => ({ id, label })),
    places: r.places
      .filter((p) => p.points.length > 0)
      .map(({ id, name, loc, locLabel, year, built, who, note, summary, nation, country, exams, style, styleShown, tags, tagsEn, styleCard, era, eras, points }) => ({
        id, name, loc, locLabel, year, built, who, note, summary, nation, country, exams, style, styleShown, tags, tagsEn, styleCard, era, eras,
        points: points.map(({ sub, lat, lng }) => ({ sub, lat, lng })),
      })),
  };
}

// ---------- GAPS.md ----------
function gapsMarkdown(places: AuditPlace[], unlocated: Unlocated[]): string {
  const esc = (t: unknown) => String(t ?? '').replace(/\|/g, '/');
  const table = (head: string[], rows: unknown[][]) =>
    rows.length ? [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.map(esc).join(' | ')} |`), ''] : ['(none)', ''];
  const est = places.flatMap((p) => p.points.filter((pt) => pt.precision === 'estimate').map((pt) => [p.name, pt.sub, p.loc, `${pt.lat}, ${pt.lng}`, pt.note]));
  const of = (k: Unlocated['kind']) => unlocated.filter((u) => u.kind === k);
  const withNote = (re: RegExp) => places.flatMap((p) => p.points.filter((pt) => re.test(pt.note)).map((pt) => ({ p, pt })));
  const supp = withNote(/^Supplementary location: /)
    .filter(({ p }) => !p.loc)
    .map(({ p, pt }) => [p.name, /^Supplementary location: (.+)$/.exec(pt.note)?.[1] ?? '', `${pt.lat}, ${pt.lng}`, pt.sourceUrl]);
  const conflict = withNote(/^Location per source: /).map(({ p, pt }) => [p.name, p.loc, `${pt.lat}, ${pt.lng}`, pt.note, pt.sourceUrl]);
  return [
    '# Coordinate gaps',
    '',
    '> Generated by `npm run data`; do not edit by hand. To fill a gap, add a sourced coordinate to `data/geo-manual.csv`; estimates live in `data/geo-estimate.csv`.',
    '',
    `## Memory estimates, unverified (${est.length})`,
    '',
    'No source at all; shown semi-transparent on the map. After checking, put the correct coordinate in `geo-manual.csv` to override the estimate.',
    '',
    ...table(['Building', 'Sub-item', 'Location', 'Coordinate', 'Confidence / note'], est),
    `## No location in the handout, supplied by a source (${supp.length})`,
    '',
    'The handout row has no location; the coordinate and location come from a source page, and the detail panel still shows the handout location as missing.',
    '',
    ...table(['Building', 'Supplementary location', 'Coordinate', 'Source'], supp),
    `## Source location disagrees with the handout (${conflict.length})`,
    '',
    'The map marks the position given by the source; the handout text is unchanged. Decide whether to change the handout or the coordinate.',
    '',
    ...table(['Building', 'Handout location', 'Coordinate', 'Explanation', 'Source'], conflict),
    `## No coordinate found and no estimate (${of('not-found').length})`,
    '',
    ...table(['Building', 'Location', 'Explanation'], of('not-found').map((u) => [u.name, u.loc, u.reason])),
    `## Some sub-items have no coordinate (${of('partial').length})`,
    '',
    ...table(['Building', 'Sub-item', 'Location', 'Explanation'], of('partial').map((u) => [u.name, u.sub, u.loc, u.reason])),
    `## No location in the handout and no coordinate found (${of('no-location').length})`,
    '',
    ...table(['Building'], of('no-location').map((u) => [u.name])),
  ].join('\n');
}

function main() {
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

if (process.argv[1] === fileURLToPath(import.meta.url)) main();

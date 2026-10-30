// Build data: handout §6 tables + geo-raw.txt (coordinates) + geo-estimate.csv + geo-manual.csv (manual overrides) -> src/data/*.json
// No external packages; run: node scripts/build-data.mjs
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const P = (...a) => resolve(ROOT, ...a);

// ---------- Era groups (5 colours) ----------
export const ERAS = [
  { id: 'ancient',     label: 'Ancient',      color: '#B5452E', styles: ['6.1', '6.2'] },
  { id: 'medieval',    label: 'Medieval',     color: '#2F5D8C', styles: ['6.3', '6.4', '6.5'] },
  { id: 'renaissance', label: 'Renaissance',  color: '#9A6700', styles: ['6.6'] },
  { id: 'baroque',     label: 'Baroque',      color: '#C2185B', styles: ['6.7'] },
  { id: 'c19',         label: '19th Century', color: '#2E7D5B', styles: ['6.8', '6.9', '6.10'] },
  { id: 'modern',      label: 'Modern',       color: '#6B3FA0', styles: ['6.11', '6.12', '6.13'] },
  { id: 'beauxarts',   label: 'Beaux-Arts',   color: '#5D4037', styles: ['6.14'] },
  { id: 'others',      label: 'Others',       color: '#546E7A', styles: ['6.15'] },
];
const eraOfStyle = (sid) => ERAS.find((e) => e.styles.includes(sid))?.id;

// Fixed ids for names that would otherwise get a hash-suffixed slug (data/id-aliases.txt: name | id)
const dataLines = (file) => readFileSync(resolve(ROOT, file), 'utf8').split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('#'));
const ID_ALIAS = Object.fromEntries(dataLines('data/id-aliases.txt').map((l) => l.split('|').map((x) => x.trim())));

// ---------- Parse handout §6 ----------
export function parseHandout(md) {
  const rows = [];
  const styles = [];
  let style = null, inTable = false, headerOk = false;
  for (const line of md.split(/\r?\n/)) {
    const h = /^###\s+(6\.\d+)\s+(.+?)\s*$/.exec(line);
    if (h) { style = { id: h[1], name: h[2] }; styles.push(style); inTable = false; headerOk = false; continue; }
    if (!line.startsWith('|')) { inTable = false; headerOk = false; continue; }
    const cells = line.replace(/^\||\|\s*$/g, '').split('|').map((s) => s.trim());
    if (!inTable) {
      inTable = true;
      headerOk = cells.length === 4; // columns: building, year, architect / person, notes
      continue;
    }
    if (/^:?-{3,}/.test(cells[0])) continue;
    if (!headerOk || !style) continue;
    if (cells.length !== 4) throw new Error(`Wrong column count in ${style.id}: ${line.slice(0, 50)}`);
    const [first, year, who, note] = cells;
    const [name, ...rest] = first.split(/<br\s*\/?>/i);
    const loc = (/<span class="loc">(.*?)<\/span>/.exec(rest.join('')) ?? [, ''])[1].trim();
    rows.push({ name: name.trim(), loc, year, who, note, style });
  }
  return { rows, styles };
}

const ascii = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
export function slug(name) {
  const base = ascii(name) || 'x';
  // names containing Han characters (or nothing ASCII at all) get a short hash so that distinct names never collapse to one slug
  return /\p{Script=Han}/u.test(name) || base === 'x' ? `${base}-${createHash('sha1').update(name).digest('hex').slice(0, 4)}` : base;
}

// ---------- Coordinate parsing ----------
export function parseCoord(raw) {
  const s = raw.replace(/\s*\/\s*.*$/, '').trim(); // drop a trailing " / decimal" part and keep the first group
  const re = /(-?\d+(?:\.\d+)?)\s*°?\s*(?:(\d+(?:\.\d+)?)\s*[′']\s*)?(?:(\d+(?:\.\d+)?)\s*[″"]\s*)?\s*([NSEW])\b/g;
  const hits = [...s.matchAll(re)];
  let lat, lng;
  if (hits.length >= 2) {
    for (const m of hits) {
      const v = (Math.abs(+m[1]) + (m[2] ? +m[2] / 60 : 0) + (m[3] ? +m[3] / 3600 : 0)) * (/[SW]/.test(m[4]) ? -1 : 1);
      if (/[NS]/.test(m[4])) lat = v; else lng = v;
    }
  } else {
    const d = /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/.exec(s);
    if (d) { lat = +d[1]; lng = +d[2]; }
  }
  if (lat == null || lng == null || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new Error(`Cannot parse coordinate: ${raw}`);
  return { lat: +lat.toFixed(6), lng: +lng.toFixed(6) };
}

// ---------- Range check (coarse: location column -> centre point + allowed km) ----------
const CITY = {
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
const cityKey = (loc) => loc.replace(/[(\uFF08].*?[)\uFF09]/g, '').replace(/[\u3000-\u9FFF\uFF00-\uFFEF]+/g, '').trim();
const km = (a, b, c, d) => { const R = 6371, r = Math.PI / 180, dLat = (c - a) * r, dLng = (d - b) * r; const x = Math.sin(dLat / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };

// ---------- Leak scan ----------
const LEAK = dataLines('data/leak-patterns.txt').map((l) => { const k = l.lastIndexOf('/'); return new RegExp(l.slice(1, k), l.slice(k + 1)); });

// ---------- GAPS.md ----------
function gapsMarkdown(places, unlocated) {
  const esc = (t) => String(t ?? '').replace(/\|/g, '/');
  const table = (head, rows) => (rows.length ? [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.map(esc).join(' | ')} |`), ''] : ['(none)', '']);
  const est = places.flatMap((p) => p.points.filter((pt) => pt.precision === 'estimate').map((pt) => [p.name, pt.sub, p.loc, `${pt.lat}, ${pt.lng}`, pt.note]));
  const of = (k) => unlocated.filter((u) => u.kind === k);
  const withNote = (re) => places.flatMap((p) => p.points.filter((pt) => re.test(pt.note)).map((pt) => ({ p, pt })));
  const supp = withNote(/^Supplementary location: /).filter(({ p }) => !p.loc).map(({ p, pt }) => [p.name, /^Supplementary location: (.+)$/.exec(pt.note)?.[1] ?? '', `${pt.lat}, ${pt.lng}`, pt.sourceUrl]);
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

// ---------- Main ----------
function main() {
  const { rows, styles } = parseHandout(readFileSync(P('content/handout-c3-s6.md'), 'utf8'));
  const errors = [], warns = [];

  // Full architect names (data/architects.txt)
  const ARCH = new Map(dataLines('data/architects.txt').map((l) => l.split('|').map((x) => x.trim())));
  for (const r of rows) r.who = ARCH.get(r.who) ?? r.who;

  // Per-row span and summary (data/entries.txt)
  const entries = new Map();
  for (const l of dataLines('data/entries.txt')) {
    const [name, span = '', summary = ''] = l.split('|').map((x) => x.trim());
    if (entries.has(name)) errors.push(`entries.txt: duplicate name: ${name}`);
    entries.set(name, { span, summary });
  }
  for (const r of rows) {
    const e = entries.get(r.name);
    if (!e) { errors.push(`entries.txt: no line for handout row: ${r.name}`); continue; }
    r.year = e.span || r.year;
    r.summary = e.summary;
  }
  const COUNTRIES = ['Italy', 'France', 'Germany', 'United Kingdom', 'United States', 'Others'];
  const cmap = new Map(dataLines('data/countries.txt').map((l) => l.split('|').map((x) => x.trim())));
  for (const r of rows) {
    r.country = cmap.get(r.loc || r.name) ?? '';
    if (!COUNTRIES.includes(r.country)) errors.push(`countries.txt: no valid country for "${r.loc || r.name}" (${r.name})`);
  }
  // Extra style tags (data/extra-styles.txt): a building whose source states several styles counts under all of them
  const extraMap = new Map();
  for (const l of dataLines('data/extra-styles.txt')) {
    const [n, ids = ''] = l.split('|').map((x) => x.trim());
    const list = ids.split(',').map((x) => x.trim()).filter(Boolean);
    if (!list.length || list.some((id) => !ERAS.some((e) => e.id === id))) errors.push(`extra-styles.txt: bad era id for ${n}`);
    extraMap.set(n, list);
  }
  for (const n of extraMap.keys()) if (!rows.some((r) => r.name === n)) errors.push(`extra-styles.txt: name matches no handout row: ${n}`);
  const exMap = new Map();
  for (const l of dataLines('data/exams.txt')) {
    const [n, ys] = l.split('|').map((x) => x.trim());
    const yrs = (ys ?? '').split(',').map((x) => Number(x.trim()));
    if (!yrs.length || yrs.some((y) => !Number.isInteger(y) || y < 2007 || y > 2019)) errors.push(`exams.txt: bad years for ${n}`);
    exMap.set(n, yrs.sort((a, c) => a - c));
  }
  for (const r of rows) r.exams = exMap.get(r.name) ?? [];
  for (const n of exMap.keys()) if (!rows.some((r) => r.name === n)) errors.push(`exams.txt: name matches no handout row: ${n}`);
  const rowNames = new Set(rows.map((r) => r.name));
  for (const n of entries.keys()) if (!rowNames.has(n)) errors.push(`entries.txt: name matches no handout row: ${n}`);

  // Leak scan
  for (const r of rows) for (const f of ['name', 'loc', 'year', 'who', 'note', 'summary']) for (const re of LEAK) if (re.test(r[f])) errors.push(`Leak: ${r.name}.${f} matches ${re}`);

  // Unique ids
  const seen = new Map();
  for (const r of rows) {
    r.id = (ID_ALIAS[r.name] ?? slug(r.name)) + (r.loc ? '-' + (ascii(cityKey(r.loc)) || 'x') : '');
    if (seen.has(r.id)) errors.push(`Duplicate id: ${r.id} (${seen.get(r.id)} / ${r.name})`);
    seen.set(r.id, r.name);
    r.era = eraOfStyle(r.style.id);
    if (!r.era) errors.push(`No era group: ${r.style.id}`);
    r.eras = [...new Set([r.era, ...(extraMap.get(r.name) ?? [])])];
  }
  const byName = new Map(rows.map((r) => [r.name, r]));
  if (byName.size !== rows.length) errors.push('Duplicate building names; the coordinate files cannot map them uniquely');

  // Coordinate file
  const pts = new Map(); // name -> [{sub, ...}]
  const misses = [];
  for (const [i, line] of readFileSync(P('data/geo-raw.txt'), 'utf8').split(/\r?\n/).entries()) {
    if (!line.trim() || line.startsWith('#')) continue;
    const [key, sub = '', page = '', raw = '', note = ''] = line.split('|').map((s) => s.trim());
    const row = byName.get(key);
    if (!row) { errors.push(`geo-raw line ${i + 1}: building not found: "${key}"`); continue; }
    if (raw === 'NONE' || raw === '') { misses.push({ name: key, sub, page, reason: note || 'No coordinate found' }); continue; }
    let c;
    try { c = parseCoord(raw); } catch (e) { errors.push(`geo-raw line ${i + 1}: ${e.message}`); continue; }
    // A note starting with "Supplementary location: X" or "Location per source: X" -> range-check against X; a row with no handout location must have "Supplementary location"
    const ov = /^(Supplementary location|Location per source): ([^;(]+)/.exec(note);
    if (!row.loc && ov?.[1] !== 'Supplementary location') { errors.push(`geo-raw line ${i + 1}: "${key}" has no handout location, so its note must start with "Supplementary location: City"`); continue; }
    const ck = ov ? ov[2].trim() : cityKey(row.loc), box = CITY[ck];
    if (!box) { if (ov || !row.loc) errors.push(`CITY has no range for "${ck}", cannot check: ${key}`); else warns.push(`No range check: ${row.name} (${row.loc})`); }
    else { const d = km(box[0], box[1], c.lat, c.lng); if (d > box[2]) errors.push(`Coordinate is ${d.toFixed(0)} km from "${ck}" (limit ${box[2]}): ${row.name} ${raw}`); }
    const precision = /approximate/i.test(note) ? 'approx' : /taken from the containing|original site/i.test(note) ? 'contained' : 'page';
    let sourceUrl;
    if (page.startsWith('url:')) {
      sourceUrl = page.slice(4);
      if (!/^https:\/\/[^\s]+$/.test(sourceUrl)) { errors.push(`geo-raw line ${i + 1}: url must be an https URL`); continue; }
    } else {
      const [lang, title = ''] = [page.slice(0, page.indexOf(':')), page.slice(page.indexOf(':') + 1)];
      sourceUrl = `https://${lang}.wikipedia.org/wiki/${encodeURI(title)}`;
    }
    if (!pts.has(key)) pts.set(key, []);
    pts.get(key).push({ sub, lat: c.lat, lng: c.lng, precision, note, sourceUrl, status: 'Supplementary - to be verified' });
  }

  // Memory estimates (geo-estimate.csv: name,sub,lat,lng,conf,note): no source, unverified; they never override a point already in geo-raw, and are not allowed for rows with no handout location
  const CONF = { h: 'High confidence (within about 300 m)', m: 'Medium confidence (within about 1 km)', l: 'Low confidence (may be several km off, or a linear / grouped item)' };
  const estPath = P('data/geo-estimate.csv');
  if (existsSync(estPath)) {
    for (const [i, line] of readFileSync(estPath, 'utf8').split(/\r?\n/).entries()) {
      if (i === 0 || !line.trim() || line.startsWith('#')) continue;
      const [name, sub = '', lat, lng, conf = '', note = ''] = line.split(',').map((s) => s.trim());
      const at = `geo-estimate line ${i + 1}`;
      const row = byName.get(name);
      if (!row) { errors.push(`${at}: building not found: "${name}"`); continue; }
      if (!row.loc) { errors.push(`${at}: "${name}" has no handout location, so no estimate is allowed`); continue; }
      if (!Number.isFinite(+lat) || !Number.isFinite(+lng) || !lat || !lng || Math.abs(+lat) > 90 || Math.abs(+lng) > 180) { errors.push(`${at}: lat/lng is not a valid number`); continue; }
      if (!CONF[conf]) { errors.push(`${at}: conf must be h, m or l`); continue; }
      const ebox = CITY[cityKey(row.loc)];
      if (ebox) { const d = km(ebox[0], ebox[1], +lat, +lng); if (d > ebox[2]) errors.push(`${at}: coordinate is ${d.toFixed(0)} km from "${cityKey(row.loc)}" (limit ${ebox[2]}): ${name}`); }
      else warns.push(`No range check: ${name} (${row.loc})`);
      if ((pts.get(name) ?? []).some((p) => p.sub === sub)) { warns.push(`geo-estimate skipped (coordinate already present): ${name}${sub ? ' / ' + sub : ''}`); continue; }
      if (!pts.has(name)) pts.set(name, []);
      pts.get(name).push({ sub, lat: +lat, lng: +lng, precision: 'estimate', note: [CONF[conf], note].filter(Boolean).join('; '), sourceUrl: '', status: 'Memory estimate - unverified' });
    }
  }

  // Manual overrides (geo-manual.csv: name,sub,lat,lng,source_url,note)
  const manualPath = P('data/geo-manual.csv');
  if (existsSync(manualPath)) {
    for (const [i, line] of readFileSync(manualPath, 'utf8').split(/\r?\n/).entries()) {
      if (i === 0 || !line.trim() || line.startsWith('#')) continue;
      const [name, sub = '', lat, lng, url = '', note = ''] = line.split(',').map((s) => s.trim());
      if (!lat || !lng) continue;
      const row = byName.get(name);
      if (!row) { errors.push(`geo-manual line ${i + 1}: building not found: "${name}"`); continue; }
      if (!Number.isFinite(+lat) || !Number.isFinite(+lng) || Math.abs(+lat) > 90 || Math.abs(+lng) > 180) { errors.push(`geo-manual line ${i + 1}: lat/lng is not a valid number`); continue; }
      const mbox = CITY[cityKey(row.loc)];
      if (mbox) { const d = km(mbox[0], mbox[1], +lat, +lng); if (d > mbox[2]) errors.push(`geo-manual line ${i + 1}: coordinate is ${d.toFixed(0)} km from "${cityKey(row.loc)}" (limit ${mbox[2]}): ${name}`); }
      const list = (pts.get(name) ?? []).filter((p) => p.sub !== sub);
      list.push({ sub, lat: +lat, lng: +lng, precision: 'manual', note, sourceUrl: url, status: 'Entered manually' });
      pts.set(name, list);
    }
  }

  // Assemble
  const places = rows.map((r) => ({
    id: r.id, name: r.name, loc: r.loc, year: r.year, who: r.who, note: r.note, summary: r.summary ?? '', country: r.country, exams: r.exams,
    style: r.style.name, styleId: r.style.id, era: r.era, eras: r.eras,
    points: (pts.get(r.name) ?? []).map((p, n) => ({ id: `${r.id}~${n}`, ...p })),
  }));
  const unlocated = [];
  for (const p of places) {
    const m = misses.filter((x) => x.name === p.name && !p.points.some((pt) => pt.sub === x.sub));
    if (!p.loc && !p.points.length) unlocated.push({ id: p.id, name: p.name, loc: '', kind: 'no-location', reason: 'No location in the handout and no coordinate found' });
    else if (p.loc && !p.points.length) unlocated.push({ id: p.id, name: p.name, loc: p.loc, kind: 'not-found', reason: m[0]?.reason ?? 'Not yet looked up' });
    else if (p.loc) for (const x of m) unlocated.push({ id: p.id, name: p.name, loc: p.loc, kind: 'partial', sub: x.sub, reason: x.reason });
  }

  writeFileSync(P('GAPS.md'), gapsMarkdown(places, unlocated));

  const geoMissingOnly = misses.filter((x) => !byName.get(x.name).loc);
  if (geoMissingOnly.length) warns.push(`Rows with no location but with lookup records: ${geoMissingOnly.map((x) => x.name).join(', ')}`);

  mkdirSync(P('src/data'), { recursive: true });
  writeFileSync(P('src/data/places.json'), JSON.stringify({ eras: ERAS.map(({ id, label, color }) => ({ id, label, color })), styles, places }, null, 1));
  writeFileSync(P('src/data/unlocated.json'), JSON.stringify(unlocated, null, 1));

  const nPts = places.reduce((n, p) => n + p.points.length, 0);
  const nLoc = places.filter((p) => p.points.length).length;
  const report = [
    `Rows ${rows.length} | located ${nLoc} | markers ${nPts} | unlocated ${unlocated.length} (no-location ${unlocated.filter((u) => u.kind === 'no-location').length} / not-found ${unlocated.filter((u) => u.kind === 'not-found').length} / partial ${unlocated.filter((u) => u.kind === 'partial').length})`,
    ...warns.map((w) => `Warning: ${w}`),
    ...errors.map((e) => `Error: ${e}`),
  ];
  console.log(report.join('\n'));
  if (errors.length) process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();

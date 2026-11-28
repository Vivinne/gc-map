// D1 data pipeline: handout §6 tables + data/ files + coordinates -> the full dataset and the site file
import type { EraId, SiteData } from '../../src/data';
import { ERAS, ascii, dataLines, eraOfStyle, fields, isEra, mustRead, slug } from './common';
import { LEAK } from './check';
import { cityKey, loadPoints, nationsOf } from './geo';
import { parseHandout } from './parse';
import type { AuditPlace, BuildResult, Row, Unlocated } from './types';

export function buildData(): BuildResult {
  const errors: string[] = [];
  const warns: string[] = [];
  // Fixed ids for names that would otherwise get a hash-suffixed slug (data/id-aliases.txt: name | id)
  const ID_ALIAS = new Map(dataLines('data/id-aliases.txt').map((l) => fields(l) as [string, string]));
  // Buildings the user took off the site (data/removed.txt): dropped here, and lines about them in the other data files are ignored
  const REMOVED = new Set(dataLines('data/removed.txt').map((l) => l.trim()));
  const gone = (n: string) => REMOVED.has(n);
  const parsed = parseHandout(mustRead('content/handout-c3-s6.md'));
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

  const { pts, misses } = loadPoints(byName, gone, errors, warns);
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

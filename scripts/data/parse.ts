// D1 data pipeline: reading the handout tables and coordinate strings
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

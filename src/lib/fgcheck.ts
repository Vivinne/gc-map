/** Figure ground check: the CSV of the buildings that need a look (marked N, or no footprint found) */
export interface FgRow {
  id: string;
  name: string;
  loc: string;
  lat: number | '';
  lng: number | '';
  /** Y = footprint is the building, N = wrong, '' = not marked */
  mark: string;
  /** found / not found / not viewed */
  footprint: string;
  area_m2: number | '';
}

const COLS: (keyof FgRow)[] = ['id', 'name', 'loc', 'lat', 'lng', 'mark', 'footprint', 'area_m2'];

const cell = (v: string | number): string => {
  const t = String(v);
  return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

/** Rows that need attention: marked N, or the basemap had no footprint at all */
export const needsLook = (r: FgRow): boolean => r.mark === 'N' || r.footprint === 'not found';

export function toCsv(rows: readonly FgRow[]): string {
  const lines = [COLS.join(',')];
  for (const r of rows.filter(needsLook)) lines.push(COLS.map((c) => cell(r[c])).join(','));
  return '﻿' + lines.join('\r\n') + '\r\n'; // BOM so Excel reads UTF-8
}

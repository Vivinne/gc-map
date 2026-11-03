export type EraId = 'ancient' | 'medieval' | 'renaissance' | 'baroque' | 'c19' | 'modern' | 'beauxarts' | 'others';

/** page = page marker point; contained = taken from the containing building / square page; approx = approximate; manual = entered manually; estimate = memory estimate (no source, unverified) */
export type Precision = 'page' | 'contained' | 'approx' | 'manual' | 'estimate';

export interface Era {
  id: EraId;
  label: string;
  color: string;
}

export interface Point {
  id: string;
  /** Sub-item name for a compound row (e.g. Gaudí works); empty string for a single point */
  sub: string;
  lat: number;
  lng: number;
  precision: Precision;
  note: string;
  sourceUrl: string;
  status: string;
}

export interface Place {
  id: string;
  name: string;
  /** Handout location; empty string = not given in the handout */
  loc: string;
  /** Location as shown to readers (data/doc-display.txt); `loc` stays the key for city grouping and country */
  locLabel: string;
  year: string;
  /** Built span as displayed: English only (data/years-display.txt), else the span as written */
  built: string;
  who: string;
  note: string;
  /** One- or two-sentence summary shown in the detail panel (data/entries.txt) */
  summary: string;
  /** Nation the first coordinate lies in (Natural Earth names, e.g. "Spain"); used to frame a country on the map */
  nation: string;
  /** [west, south, east, north] of that nation's main landmass plus the building's own island; null without a coordinate */
  nationBox: [number, number, number, number] | null;
  /** Country tag (data/countries.txt); empty when the handout gives no location */
  country: string;
  /** Past-exam years in which this building was a topic (data/exams.txt) */
  exams: number[];
  style: string;
  /** One style for a building filed under a combined heading (data/style-split.txt); empty = the heading */
  styleShown: string;
  styleId: string;
  era: EraId;
  /** Every style tag the building counts under: its own era plus any extras (data/extra-styles.txt) */
  eras: EraId[];
  points: Point[];
}

export interface Dataset {
  eras: Era[];
  styles: { id: string; name: string }[];
  places: Place[];
}

export interface Unlocated {
  id: string;
  name: string;
  loc: string;
  kind: 'no-location' | 'not-found' | 'partial';
  sub?: string;
  reason: string;
}

export interface Filters {
  /** Checked tag ids (see tags.ts); a building must match every one (intersection) */
  tags: ReadonlySet<string>;
  q: string;
}

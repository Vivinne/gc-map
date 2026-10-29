export type EraId = 'ancient' | 'medieval' | 'renbar' | 'c19' | 'modern';

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
  year: string;
  who: string;
  note: string;
  style: string;
  styleId: string;
  era: EraId;
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
  eras: ReadonlySet<EraId>;
  q: string;
  onlyLocated: boolean;
}

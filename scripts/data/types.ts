// D1 data pipeline: the full dataset with source and audit fields (the tests read these; the site file leaves them out)
import type { EraId, Precision } from '../../src/data';
import type { HandoutRow, Style } from './parse';

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

export interface Row extends HandoutRow {
  id: string;
  summary: string;
  built: string;
  country: string;
  exams: number[];
  era: EraId;
  eras: EraId[];
}

export type RawPoint = Omit<AuditPoint, 'id'>;

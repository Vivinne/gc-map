export const ERAS: { id: string; label: string; color: string; styles: string[] }[];
export function parseHandout(md: string): {
  rows: { name: string; loc: string; year: string; who: string; note: string; summary: string; style: { id: string; name: string } }[];
  styles: { id: string; name: string }[];
};
export function slug(name: string): string;
export function parseCoord(raw: string): { lat: number; lng: number };

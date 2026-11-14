import { nationName, type Building } from './model';

/** Lists this long are split by country */
export const BY_COUNTRY_MIN = 10;

/** Buildings split by country: the country with most buildings first; inside, the list order is kept */
export function byCountry(list: Building[]): { country: string; items: Building[] }[] {
  const map = new Map<string, Building[]>();
  for (const b of list) {
    const c = nationName(b) || '-';
    if (!map.has(c)) map.set(c, []);
    map.get(c)!.push(b);
  }
  return [...map].map(([country, items]) => ({ country, items })).sort((a, b) => b.items.length - a.items.length || a.country.localeCompare(b.country));
}

/* F2 Category: the buildings of a picked tag (SPEC R5). */
import { BUILDINGS, ERAS, byYear, type Building, type EraId } from '../../data';

/** A Category tag picked in the Category page is not a search: exactly that category's buildings, oldest first */
export function categoryList(label: string): Building[] {
  const era = (Object.keys(ERAS) as EraId[]).find((e) => ERAS[e].label === label);
  return era ? BUILDINGS.filter((b) => b.eras.includes(era)).sort(byYear) : [];
}

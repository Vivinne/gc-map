/* Flows: the buildings a screen lists, from the module that owns that list. */
import { categoryList } from '../features/category';
import { searchSplit, type Found } from '../features/search';

/** The buildings a screen lists: a picked Category tag, or a search */
export function listOf(q: string, list: string): Found {
  return list === 'era' ? { main: categoryList(q), more: [] } : searchSplit(q);
}

/* F1 search: search box, search rules, typed text, recent searches and buildings (see MODULES.md, SPEC §5). */
export { default as SearchBox } from './SearchBox';
export { search, searchSplit, type Found } from './search';
export { useRecent, useSearchText } from './useSearchText';

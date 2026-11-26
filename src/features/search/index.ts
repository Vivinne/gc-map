/* F1 search: search box, search rules, typed text, recent searches and buildings (see MODULES.md, SPEC §5). */
export { default as SearchBox, SEARCH_HINT } from './SearchBox';
export { normQuery, search, searchSplit, type Found } from './search';
export { addRecentBuilding, addRecentText, recentBuildings, recentTexts, removeRecentBuilding, removeRecentText } from './recent';
export { loadDraft, saveDraft } from './draft';
export { useRecent, useSearchText } from './useSearchText';

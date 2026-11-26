/* C1 history: screens and the history behind ＜ (see MODULES.md, SPEC R1, R2). */
export { EMPTY_SCREEN, canGoBack, isEmptyScreen, sameScreen, type ListKind, type Screen, type View } from './screen';
export { loadStack, saveStack, startStack } from './stack';
export { useHistory, type Leave } from './useHistory';

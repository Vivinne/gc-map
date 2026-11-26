/* L1 layout: panel frame, phone sheets, panel entry and exit, desktop panel folding (see MODULES.md, SPEC R8). */
export { default as Panel, type SheetState } from './Panel';
export { default as Leave, LEAVE_MS } from './Leave';
export { loadFolded, saveFolded } from './folded';
export { useDesktopPanel, usePanelSlide } from './useDesktopPanel';
export { useMapRoom, type Room } from './useMapRoom';

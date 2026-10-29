// Static single-page build only (esbuild alias): points `import maplibregl from 'maplibre-gl'` at the global maplibregl already loaded on the page.
// Types still come from the real maplibre-gl package through `import type` in src; the package is not included at runtime.
const g = (globalThis as unknown as { maplibregl?: unknown }).maplibregl;
if (!g) throw new Error('window.maplibregl is missing: the MapLibre script did not load');
export default g;

import type { StyleSpecification } from 'maplibre-gl';
import { basemap } from '../../lib/basemap';
import { MAP_COLORS } from '../../styles/tokens';

/** M8 basemap: offline land and borders, plus OpenFreeMap street tiles from zoom 6 (see README, Basemap) */
export function styleSpec(): StyleSpecification {
  const c = MAP_COLORS;
  const { land, borders } = basemap();
  return {
    version: 8,
    sources: {
      land: { type: 'geojson', data: land },
      borders: { type: 'geojson', data: borders },
      // Streets for the city scale. Optional: if the tile server cannot be reached the offline layers still draw the map.
      ofm: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' },
    },
    layers: [
      { id: 'sea', type: 'background', paint: { 'background-color': c.sea } },
      { id: 'land', type: 'fill', source: 'land', paint: { 'fill-color': c.land } },
      { id: 'ofm-water', type: 'fill', source: 'ofm', 'source-layer': 'water', minzoom: 6, paint: { 'fill-color': c.sea } },
      {
        id: 'ofm-river', type: 'line', source: 'ofm', 'source-layer': 'waterway', minzoom: 9,
        paint: { 'line-color': c.sea, 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.8, 15, 4] },
      },
      {
        id: 'ofm-roads', type: 'line', source: 'ofm', 'source-layer': 'transportation', minzoom: 10,
        filter: ['match', ['get', 'class'], ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service'], true, false],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': c.road,
          'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 10, ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], 1.4, 0.4], 16, ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], 12, ['secondary', 'tertiary'], 9, 5]],
        },
      },
      { id: 'ofm-buildings', type: 'fill', source: 'ofm', 'source-layer': 'building', minzoom: 14, paint: { 'fill-color': c.building } },
      { id: 'borders', type: 'line', source: 'borders', maxzoom: 10, paint: { 'line-color': MAP_COLORS.border, 'line-width': 1 } },
    ],
  };
}

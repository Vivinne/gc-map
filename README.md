# GC Atlas

General Culture buildings (handout C3 §6.1–6.15, 204 rows) as a map, a review deck and a personal area (quiz, collections).
All 204 buildings are located; every coordinate has a source (see "Data flow").

## Views

The map fills the window under a 48 px top bar (filters, search, Map / Review / Me, seen count). Every floating part sits 16 px from the map edges; controls are 32 px high, list rows 40 px. On-screen help text is left out; buttons carry tooltips and keyboard shortcuts.

| View | Key | What it does |
|---|---|---|
| Map | `M` | Buttons at the lower right: zoom in, zoom out, **Country** (the open building's country, else the one at the centre) and **Full map** (Europe). City circles (ring segments = share of each style, number = buildings) at country scale. Click a circle: the city opens with its list (the largest city of a merged circle). From city scale, numbered pins: the number is the building's place in its city, 1 = oldest. Numbers are shown for one city at a time; other cities' buildings are plain dots. Entries at one spot fan out. Buildings of the open city that are off screen or under a panel sit on the edge of the visible area as numbered markers pointing at them. |
| Review | `R` | Cards for all 204 buildings (or the 76 of TEST-ARCHED): position and the data lines first, the name after **Show answer** (`Space`). **Again** (`1`) brings the card back four cards later, **Got it** (`2`) retires it. |
| Me | `U` | **Quiz**: a 4 x 4 grid picks what is shown and what is asked among building, style, architect and city (12 pairs, or **Mixed**); each cell shows the score for that pair. Scope: all, TEST-ARCHED, starred, a collection or a style. Four choices (`1`-`4`), `Enter` for the next; wrong choices are never also right for the prompt, and buildings with no architect are not asked about architects. **Missed** asks the missed questions again until answered right. **Collections**: Starred plus collections you name (add, rename, move up, delete with a second click); the map button shows a collection on the map as a filter. **Export / Import** moves seen, stars, collections and quiz scores to another browser as a JSON file (import adds to what is there). |

Any building is two clicks away: a city circle (or a period block, or a city in the filters), then a pin or a list row.

- **City list** (right): the city's name and count, every building with its map number. Close or `Esc`.
- **Building card** (340 px, right): a strip of controls above the card (back to the city list, previous / next, star, fold, close; the star opens a menu with Starred, every collection and a field for a new one; `S` still toggles Starred), kept apart so they never move the content. The card folds to its title. Content: number and NAME; three English data lines with no field labels (built span and place, person, style); the summary; supplementary notes last in small grey italic (sub-buildings, `[TEST-ARCHED 2007 / 2012 / 2016]` in full-width brackets). At the end, a folded section with the other buildings of the city (number, name, an arrow pointing at each; at most 240 px tall when open). Opening a building fits its whole city on the map; while zoomed in, an inset (top left) shows the whole city and the current view.
- **Period band**: a 28 px strip over the bottom of the map, one block per style, width by number of buildings, the number inside; click a block to show only that period, again to undo. The name shows as a tooltip.
- **Filters** (button or `F`): style, country, TEST-ARCHED (with year tags 2007–2019), starred, collections, and the cities by size (or the matching buildings once a filter is on). Inside one group tags are a union; across groups they intersect; tag numbers are what you would get if you added the tag.
- **Search** (`/` or `Ctrl/Cmd+K`): buildings, architects, cities and note text. `Up/Down`, `Enter` opens, `Tab` keeps the text as a filter.

Data lines in English: built spans with Chinese wording are replaced for display by `data/years-display.txt`; styles show the English part of the handout heading; architects keep full names, rulers their short names (`data/architects.txt`).

Phone (up to 900 px wide): search and style chips on top, the period band above the tab bar, filters and cities in a sheet, the city list and the building card as bottom sheets.

Reloading the page is a reset: full map, nothing selected, no filters; an old view address (`#...`) is cleared and ignored. Seen buildings, stars, collections, quiz scores and review progress are kept in the browser (localStorage; the page works without it).

## Run

Requires Node.js >= 20.9.

```bash
npm install
npm run dev                      # http://localhost:3000
npm run build && npm run serve   # static export in out/
BASE_PATH=/gc-map/atlas npm run build   # export for https://<user>.github.io/gc-map/atlas/
npm run site                     # single-file pages in site/ (index.html, artifact.html)
```

`site/index.html` opens straight from disk. `site/artifact.html` is the same page without address state, for hosts that only pass a plain `#name`.

## Basemap

The map draws its own basemap from `src/data/basemap.json` (Natural Earth, public domain), so it works offline and inside sandboxed hosts. From zoom 6 it also requests street-level vector tiles from OpenFreeMap (water, rivers, roads from zoom 10, building footprints from zoom 14), restyled in the same flat colours; where those tiles cannot load, the map keeps the offline layers. No map labels are drawn from tiles: building and city names come from the site's own overlay.

## Data flow

| File | Purpose |
|---|---|
| `content/handout-c3-s6.md` | Display content: the fifteen style tables of handout §6, without question IDs, knowledge-point IDs or to-be-confirmed marks. This is the author's study notes and is kept in the original language (Chinese with English terms); it is data, not code. The parser does not depend on the language |
| `data/geo-raw.txt` | Coordinate overlay, five fields per line (key, sub, lang:title, coordinate, note; fields separated by a vertical bar). A page field of `lang:Title` means a Wikipedia page; `url:https://…` means another web page. A coordinate of `NONE` records that no coordinate was found. For a row with no handout location, the note must start with `Supplementary location: City` |
| `data/geo-manual.csv` | Manual coordinates or overrides: `name,sub,lat,lng,source_url,note`. Overrides `geo-raw.txt` for the same `name` + `sub`; rows with empty lat/lng are skipped |
| `data/geo-estimate.csv` | Intentionally empty (header only). Memory estimates are forbidden; every coordinate must come from a source |
| `data/years-display.txt` | `handout name | built span as displayed`: English-only spans for the rows whose span is written with Chinese wording (digits, centuries as `15th`, start to completion only) |
| `data/entries.txt` | One line per handout row: `name`, built span, summary (vertical-bar separated). The span replaces the handout year in the display; the summary is shown in the detail panel. A missing row fails the build |
| `data/architects.txt` | `handout value | full name`: the architect line in the detail panel shows the full name; unlisted values are shown as written |
| `data/countries.txt` | `handout location | country tag` (Italy, France, Germany, United Kingdom, United States, Others). Rows with no handout location are keyed by building name, using the supplementary location in `geo-raw.txt`. Vatican is listed under Italy |
| `data/extra-styles.txt` | `building name | era ids` (comma separated): extra style tags besides the one given by the handout section, for buildings whose source states several styles |
| `data/exams.txt` | `building name | years` (2007–2019): years in which the building itself was a past-exam topic. Shown as a grey italic last line, e.g. `[2016 TEST-ARCHED] (full-width brackets)`; only years are published, never question or knowledge-point IDs. Buildings not listed have no line |
| `data/id-aliases.txt` | Fixed ids (`name | id`) for names that would otherwise get a hash-suffixed slug |
| `data/leak-patterns.txt` | One `/regex/flags` per line: markers that must never appear in displayed fields (shared by the build and the tests) |
| `GAPS.md` | List of gaps and estimates (generated by `npm run data`; do not edit by hand) |
| `scripts/build-basemap.mjs` | Builds `src/data/basemap.json` (Natural Earth 1:50m countries as simplified TopoJSON, from the `world-atlas` package): the offline basemap filled as land, with inland borders |
| `scripts/build-data.mjs` | Parse -> match coordinates -> validate -> write `src/data/places.json` and `unlocated.json`; exits with code 1 on errors |

To fill a gap: enter lat, lng and source_url in `data/geo-manual.csv`, then run `npm run data`. Manual coordinates take priority over estimates and Wikipedia coordinates. Every coordinate gets a coarse city-range check; anything outside the range is reported as an error.

Priority: `geo-manual.csv` > `geo-raw.txt` > `geo-estimate.csv`.


## Code

| Path | Purpose |
|---|---|
| `src/lib/model.ts` | Building model: start year, list year, city key, search text |
| `src/lib/filter.ts` | Filters, tag counts |
| `src/lib/band.ts` | Period band geometry (blocks, ticks, year at a position) |
| `src/lib/geo.ts` | Distances, screen-space city circles, same-spot groups, regions |
| `src/lib/search.ts` | Grouped search |
| `src/lib/review.ts` | Review deck |
| `src/lib/quiz.ts` | Cross quiz: pairs, questions, scores |
| `src/lib/collections.ts` | Collections, export / import file |
| `src/lib/hash.ts`, `storage.ts` | View state, browser storage |
| `src/components/*` | App, map (MapLibre GL JS with an SVG overlay), index, band, building panel, search, review, me |

All code, comments and UI text are English; the study notes in `content/` and the data files keep their original wording.

## Checks

```bash
npm run typecheck
npm test        # unit tests: years, filters, tag counts, address state, band scale, review deck, quiz, collections, search, circle overlap, data rules, no Chinese characters in code
npm run site && npm run e2e   # Chromium flows on site/index.html (desktop and phone), screenshots in .e2e/
```

`npm run e2e` needs Playwright's Chromium (`npx playwright install chromium`), or set `CHROMIUM_PATH` to an installed Chromium.

## Not verified

- Street tiles from OpenFreeMap: the authoring environment cannot reach the tile server, so all checks ran on the offline basemap only.
- Publishing to GitHub Pages under `/gc-map/atlas/` has not been done.
- Coordinates other than the five checked on Google Maps by the project owner are "to be verified".

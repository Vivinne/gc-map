# GC Atlas

General Culture buildings (handout C3 §6.1–6.15, 204 rows) as a map, a timeline and a review deck.
All 204 buildings are located; every coordinate has a source (see "Data flow").

## Views

| View | Key | What it does |
|---|---|---|
| Map | `M` | City circles (ring segments = share of each style, number = buildings) at country scale; single buildings with names from zoom 11.5. Click a circle to zoom in, a dot to open the building. Several entries at one spot are a black square with a count; click it to choose. Buttons on the lower left jump to results outside the view. |
| Timeline | `T` | One lane per country, buildings placed by start year. Follows every filter and the period band. Hover shows the notes, click opens the building on the map. |
| Review | `R` | Cards for all 204 buildings (or the 76 asked in previous years): position, built span, place, architect and style first; the name after **Show answer** (`Space`). **Again** (`1`) brings the card back four cards later, **Got it** (`2`) retires it. Progress stays in this browser. |

Always on screen (except Review):

- **Index (left)**: style, country, "Asked in previous years" (with year tags 2007–2019 when on) and Starred filters. Inside one group tags are a union; across groups they intersect. The number on a tag is what you would get if you added it. With no filter, the list shows cities by size with a style-share bar; with filters, the matching buildings by year; inside a city, its buildings (oldest first / A to Z / asked first).
- **Period band (bottom)**: one solid block per style, width by number of buildings, a white tick per building. Click a block to toggle that style, drag across to keep a span of years, drag the black handles to change it, double-click to reset. Each change shows a short note with **Undo**.
- **Search** (`/` or `Ctrl/Cmd+K`): buildings, architects, cities and note text (Chinese notes included). `Up/Down` move, `Enter` opens, `Tab` keeps the text as a list filter.
- **Building panel**: NAME, `built span, place`, architect, a full-width dash, the summary, the `[year TEST-ARCHED]` line (full-width brackets) for buildings asked in previous years, the three nearest buildings with distances and up to three of the same style in the same city. `Left/Right` step through the current list, `S` stars, `Esc` closes. Opening a building counts it as seen (top bar).

Other keys: `1`–`8` toggle the styles in band order, `F` fits the map to the results.

Phone (up to 900 px wide): search bar and style chips on top, the period band above the tab bar (Map / Timeline / Review), the full index in the **List** sheet, the building as a bottom sheet (tap or drag the handle to expand, drag down to close), swipe a revealed review card right for "got it", left for "again".

The view (mode, building, city, filters) is kept in the address, e.g. `#m=timeline&s=modern&e=1&r=1900~1950`, so it can be bookmarked or shared. Seen buildings, stars and review progress are kept in the browser (localStorage; the page works without it).

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
| `src/lib/hash.ts`, `storage.ts` | Address state, browser storage |
| `src/components/*` | App, map (MapLibre GL JS with an SVG overlay), index, band, building panel, search, timeline, review |

All code, comments and UI text are English; the study notes in `content/` and the data files keep their original wording.

## Checks

```bash
npm run typecheck
npm test        # unit tests: years, filters, tag counts, address state, band scale, review deck, search, circle overlap, data rules, no Chinese characters in code
npm run site && npm run e2e   # Chromium flows on site/index.html (desktop and phone), screenshots in .e2e/
```

`npm run e2e` needs Playwright's Chromium (`npx playwright install chromium`), or set `CHROMIUM_PATH` to an installed Chromium.

## Not verified

- Street tiles from OpenFreeMap: the authoring environment cannot reach the tile server, so all checks ran on the offline basemap only.
- Publishing to GitHub Pages under `/gc-map/atlas/` has not been done.
- Coordinates other than the five checked on Google Maps by the project owner are "to be verified".

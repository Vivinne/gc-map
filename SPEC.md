# SPEC.md — GC map redesign (v2)

Source: Project doc "網頁修改 的副本" (2026-11-13) and the user's answers of 2026-11-13. KEEP.md lists what stays from v1.
Status: approved 2026-11-13; desktop rail and content panel approved and published 2026-11-23; published 2026-11-13 at https://vivinne.github.io/gc-map/ (gh-pages 955bbae, from `redesign`); `/gc-map/atlas/` redirects there.

## 1. Screen
- Map only, no top bar, no tabs. Default view: Europe (v1 Full map).
- Desktop (Rail, 2026-11-23): a fixed rail on the left edge (56 px, over the map), top down: Search (magnifier), Category (four squares), the fold button (a list in a rounded frame, no line above it; 2026-11-25). The fold button is grey and cannot be pressed while Search or Category does its job (its page is open, or folded away: that button alone brings it back) or when there is nothing to fold or bring back; Search opened over a card, a number point list or Category shows ＜ in the box back to that screen (not over the plain map); otherwise it folds the panel (lit, as a lit page button, while the card or number point list is out) or brings the folded screen back (not lit); each a 40 px square with a thin frame and rounded corners, its press and lit colours inside the frame. Every non-map part (search box, preview, results, Category, number point list, card) is in one content panel beside it (§9). Phone: unchanged — top left: Search box; Category button (icon: four squares) to its right.
- Bottom right: Zoom + / − (desktop; phone pinches). Mouse wheel zooms.
- Scale bar (KEEP.md): desktop at the bottom right, 16 px left of the zoom buttons, on their bottom line (Rail, 2026-11-23); phone bottom left.
- Every floating part 16 px from window, map and other parts. Exception (B6, 2026-11-20): on desktop the zoom buttons and the scale bar share one bottom line 24 px from the bottom, clear of the map's source line under them; the panels stop 16 px above the scale bar.

## 2. Site rules
| Rule | Behaviour |
|---|---|
| ＜ | Back to the previous state in the history (a submitted search or a panel change). Hidden when there is nothing to go back to |
| × | Closes everything: search text, results, lists, building card. The map stays where it is |
| Clickable | Pointer cursor; hover and press change colour or add an outline |
| One panel | A list or card opened from a list folds the current one away; ＜ brings it back |
| Auto zoom | Enter fits the map to all results, clear of the window edges and the panels |
| Reload | Restores search text, lists, map position, zoom and the panel history |
| Search first | After a search is submitted and until ×, the map shows only its results |
| Load failure | As v1 (KEEP.md) |
| Keys | `/` opens Search (desktop: opens the content panel on the search page); Esc = × |
| Rail (desktop) | The page opens with the content panel closed and nothing lit (a reload or shared link naming a screen opens it on that screen). Menu: closed → opens on the screen last shown; with nothing open (a fresh visit, or after ×) it opens on the menu page: no title, × top right, and two framed buttons (magnifier + `Search`, four squares + `Category`; the frame holds icon and name, hover darkens the frame, press fills it light blue and moves 1 px), each acting as the rail button with its icon; nothing lit; open → closes, nothing lit. Search: opens the panel (if closed) on the search page (the submitted search's results, else the empty search page) and lights; Category: the same with the Category list. A lit button cannot be pressed. Card and number point list: nothing lit. A marker or number point clicked while the panel is closed opens it. × (and Esc) closes everything, the panel too: nothing open, nothing lit (the menu page shows when it opens again). Search from the rail or the menu page with no search gives the search page with the box taking the cursor, so the recent searches show at once (none recent: the box only); with a submitted search it shows that search's results. Closing keeps the screen and the map; the map shows what that screen shows (the submitted search's results), with no dimming while the panel is closed |

## 3. Map rules
- Markers show only when a search is submitted, or when the scale bar reads 100 km or less (`scale.metres <= 100000`). At the default Europe view with no search the map has no markers.
- Markers that overlap on screen merge into a number point (count); zooming in splits them.
- Click a marker → building card. Click a number point → number point list → click a row → building card.
- Opening a number point list moves the map only as far as needed to keep the point in sight.
- Map move or zoom → markers update to the view (and to the submitted search, if any).
- Opening a card moves the map only as far as needed to show the building; the zoom does not change.

## 4. Paths
| Path | Steps |
|---|---|
| Text | Search → type → preview list → Enter → results list + results on map → card |
| Recent building | Search → recent building → card |
| Recent text | Search → recent text → text search [that text] |
| Style | Category → style list → style → text search [style name] |
| Architect | Card → architect → text search [architect] |
| Browse | Zoom in → markers in view → marker → card |
| Dense | Number point → number point list → row → card |

## 5. Search
- Placeholder: `Search architecture, architect, style…`
- Magnifier always on the left; × on the right while there is text or anything open. No ＜ in the search box.
- Click Search: preview list shows Recent: up to 5 texts and up to 5 buildings, each newest first. Texts from Category and architect clicks count.
- Typing without Enter: preview list. Enter: submit. Empty text: nothing happens. No match: Enter does not submit, the list shows `No Results`.
- Clicking a preview row opens its card; ＜ returns to the preview with the text kept.
- Every search is a plain text search (Category and architect too). Fields matched: name, architect, style, city, country, keywords (zh and en), summary text.
- Order: exact name, then name starts with the text, then other fields; same rank by year, oldest first.
- A new search (typed, Category, architect) replaces the current one and is added to the history.

## 6. Lists
All result rows (preview, results, number point list) share one row:
- Left: a colour strip of the building's category.
- Line 1: building name, bold.
- Line 2: built span · city.
- Line 3: architect · style.
- Thin grey rule between rows. Click → card.

Number point list: ＜ top left, title `XX Architectures`, × top right. Results list and search preview have no title row (phone sheets keep a drag handle).
＜ shows on lists and the card whenever there is an earlier screen; a card opened from the plain map shows only ×.
Category list: ＜ top left, `Category` beside it, × top right; the 10 style tags laid out as in v1 (KEEP.md).

## 7. Building card
- Row 1: ＜ left (if history), × right. Rows 1–2 on the category colour (KEEP.md).
- Row 2: name, bold.
- Row 3: built span · city. The span follows the year rules (start–completion), not completion only.
- Row 4: architect · style. Architect is a link → text search [architect]. Style: finer style if any (e.g. Brutalism), else the category name. No architect: `-`.
- Row 5: summary (Chinese).
- Keywords: one italic line at the bottom, plain text (no tag boxes), label `關鍵字：` (an approved exception to the English-only interface rule; written as escapes in code); struck keywords stay struck.
- After keywords, small grey italic: exam years, as v1 (`TEST-ARCHED 2016 / 2018`).

## 8. Summary text (content task, step 6)
- Chinese prose. Names of people, buildings and styles in the original language, in full (e.g. Piazza della Scala, not "Scala 廣場"). Terms and programmes: Chinese with the original or English in brackets (clerestory, Trompe l'oeil, La Tendenza).
- Only the writing of names and terms changes; the meaning of each summary stays.

## 9. Desktop layout
- Content panel (Rail, 2026-11-23): floats over the map 16 px right of the rail and 16 px from the top, as wide as before (380 px), as tall as its content up to 16 px from the bottom. It slides out from behind the rail and back in 200 ms; opening or closing it moves nothing else (map, markers, rail, zoom buttons, scale bar).
- Every page's top row: ＜ top left (when there is an earlier screen), title, × top right. Search page: `Search`, then the search box under the top row, then the preview or the results. The box has no ＜ / × of its own: while typing the top-row × clears the text (empty: closes the search, as the box × did), and the box's ＜ (opened again over a submitted search) is the top-row ＜.

## 10. Phone layout
- Preview list: opens under the search box, full screen; folds away on submit.
- Category list: opens under the search box, at the size of the v1 style tags in the filters panel; folds away on submit.
- Other lists and the card: rise from the bottom to half the screen. Title area drags, content scrolls. Drag down from half: fold to the title. Drag down from full: back to half. Drag up when the content is longer: full screen up to the search box (search box stays visible), title kept.
- Landscape follows the same rules.

## 11. Addresses (shareable)
One page; the state is in the query string so a link opens the same screen.

| Key | Meaning | Example |
|---|---|---|
| `q` | submitted search text | `?q=Baroque` |
| `b` | open building card | `?b=pantheon-rome` |
| `g` | open number point list: its buildings (ids joined by `~`) | `?g=pantheon-rome~trevi-fountain-rome` |
| `p` | open list that is not a result: `search` (preview), `category` | `?p=category` |
| `m` | map view: lng, lat, zoom (`v` is taken by the fresh-copy reload) | `?m=12.49,41.89,13.2` |

The history behind ＜ is kept in `sessionStorage` (same tab, survives reload). A shared link opens its top state with no history (＜ hidden).
Publish path (approved): the new site at `https://vivinne.github.io/gc-map/`; `/gc-map/atlas/` redirects there.

## 12. Code rules
- React + Next.js (static export) + TypeScript. All code, comments, UI strings, scripts and docs in English; study content keeps its original wording.
- Colours, sizes, motion only from `src/styles/tokens.ts` / `tokens.css`.
- One component per file, PascalCase (`SearchBox.tsx`); helpers camelCase in `src/lib/`.
- Folders: `src/components/` (UI), `src/lib/` (state, search, data), `src/styles/` (tokens), `data/` + `content/` (source data), `scripts/` (build).
- State: one history stack (`src/lib/nav.ts`) drives panels, map and address.

## 13. Data (per building, as used by v2)
`id`, `name`, `built`, `city`, `nation`, `who` (architect), `era` (category id, one of 10), `eras` (all categories), `styleCard` (finer style), `summary`, `tags` (zh keywords, `~~x~~` = struck), `tagsEn`, `exams` (years), `points[]` (`lat`, `lng`, `sub`).

## 14. Remove
| Area | Items |
|---|---|
| Pages | Settings, Map tab, Quiz, Progress (code removed; saved browser data untouched) |
| Brand | `GC Atlas` mark (tab title stays `GC Atlas`) |
| Keeping | Starred, collections, export / import file |
| Map | Country, Full map buttons; close-up on a second click; country framing on click; city names; edge markers; city locator inset; period band; per-city numbers; city circles (replaced by number points) |
| Filters | Filters panel and button, multi-select, active filter chips at the bottom |
| Search | `Try` examples, grouped Architect / City hits |
| Card | Photo search link, Previous / Next and phone swipe, Also in / Nearest lists, tags under the card |
| Help | `?` windows, first-visit note, page tours (the rail gets no help window either, 2026-11-23) |
| Desktop (Rail) | Search box and Category button on the map; the scale bar on the bottom left |
| Card (2) | Sub-point names line (buildings with several points) |
| Other | Toasts, Sunset palette, F key, phone landscape side card |

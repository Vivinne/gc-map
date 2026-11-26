# SPEC.md — GC map rules (v3)

Status: v3 approved 2026-11-26. Merges SPEC v2, the decisions made since 2026-11-13 and `search-rules` into one rule set:
principles first, then rules that follow from them, then the few exceptions. A behaviour that follows from no principle
or rule below is either changed or added to Exceptions with its reason.
Site: https://vivinne.github.io/gc-map/ (`/gc-map/atlas/` redirects there). KEEP.md lists the protected look.

## 1. Principles

| # | Principle |
|---|---|
| P1 | **A new screen inherits no memory from the screen before it.** It carries only the data it needs; its scroll position and map view are noted afresh |
| P2 | **One kind of information, one field.** Search text, Category tag, building and number point are stored apart, never in a shared field; the address keeps them apart too |
| P3 | **One entry, one place.** Several entries at the same place are parts of one landmark |
| P4 | **The map moves only to bring things into sight, and only as far as needed.** In sight already: the map comes to the middle at the same zoom. Merged with markers at other places: it zooms in just until they split. Entries at the same place never split: they stay a number point, with no zoom for them |
| P5 | **What the map shows depends only on the current results.** Opening a card or pointing at a building only adds a mark; no marker ever disappears for it |
| P6 | **While the user is typing, the site takes no keys.** During IME composition no shortcut acts |
| P7 | **Desktop and phone behave the same; only the placement differs.** Exceptions: the rail is desktop only; dragging sheets is phone only |

## 2. Rules

| # | Rule |
|---|---|
| R1 | **Screens:** plain map, search (typing), search results, Category, tag list, number point list, building card. Each screen keeps three things: its scroll position, the map view when it was left, and (typing screen only) the text typed and not sent |
| R2 | **＜:** back to the previous screen, its lists, its text and the map as it was then. Hidden when the previous screen is the plain map (× goes there) |
| R3 | **× and Esc:** the × in a panel's top row, and Esc, close everything; the map stays where it is (it stops if moving). The × in the search box: with text, it clears the text; empty, it closes everything (desktop with a submitted search: × clears the search and leaves the empty box, as this rule gives). The search box shows ＜ when it is opened over any screen other than the plain map |
| R4 | **Search:** matching and order follow §5. Only a sent search counts as a search (typed + Enter, a recent text, an architect on a card) and only it is added to Recent. After a search is sent, and until ×, the map shows only its results |
| R5 | **Category tag:** lists exactly that category's buildings, oldest first; the title is the tag, ＜ goes back to Category. A tag never appears in the search box and is never added to Recent (P2) |
| R6 | **Markers:** shown at every scale. Names: all of them while a search is on, or when the scale bar reads 100 km or less; otherwise only buildings set in past TEST-ARCHED papers and the open building. Markers that overlap on screen merge into a number point (count). Mouse wheel: merging and splitting follow every step of the zoom; a finger pinch, + / − and camera moves regroup when the zoom ends |
| R7 | **Rail (desktop):** Search and Category open their pages; pressed again while lit, they fold the panel. The fold button works only while the page has no rail button of its own (card, number point list): lit while the panel is out (press: fold), white while folded (press: bring it back), grey and not pressable otherwise. The page opens with the panel closed and nothing lit; an address naming a screen opens the panel on it. A marker or number point clicked while the panel is closed opens it. × closes the panel |
| R8 | **Panels:** one at a time. A panel opened from a panel folds the current one away; ＜ brings it back. Opening or closing a panel moves nothing else on screen (see Exceptions) |
| R9 | **Feedback:** everything clickable shows its press (colour change, 1 px down) and a pointer cursor; buttons that act on the map answer with the map's own move, never with added notes or toasts |
| R10 | **Spacing:** every floating part 16 px from the window edges and from other parts (see Exceptions) |

## 3. Exceptions

| # | Exception | Reason |
|---|---|---|
| E1 | Desktop zoom buttons and scale bar sit 24 px from the bottom | Room for the map's source line under them (B6, 2026-11-20) |
| E2 | Phone: a folded sheet moves the scale bar and the source line up above it | User's choice, 2026-11-15 |
| E3 | The card's keyword label is Chinese (`關鍵字：`, written as escapes in code) | User's approval, 2026-11-13 |

## 4. Screen layout

- Map only, no top bar, no tabs. Default view: Europe.
- Desktop: the rail on the left edge (56 px, over the map), top down: Search (magnifier), Category (four squares), the fold button (a list in a rounded frame). Each a 40 px square with a thin frame and rounded corners, its press and lit colours inside the frame; no divider line.
- Desktop content panel: every non-map part (search box, preview, results, Category, tag list, number point list, card) sits in one panel 16 px right of the rail and 16 px from the top, 380 px wide, as tall as its content up to 16 px above the scale bar. It slides out from behind the rail and back in 200 ms.
- Desktop search page: the search box is the page's top row, with ＜ and × inside the box; no title. Other pages: ＜ top left (R2), title, × top right.
- Phone: search box top left, Category button (four squares) to its right. Preview and Category open under the search box; other lists and the card rise from the bottom to half the screen. Sheets: the title area drags, the content scrolls; drag down from half folds to the title, from full back to half; drag up when the content is longer goes full screen up to the search box (title kept). Landscape follows the same rules.
- Zoom + / − bottom right (desktop; the phone pinches). Mouse wheel zooms. Scale bar (KEEP.md): desktop 16 px left of the zoom buttons on their bottom line; phone bottom left, sharing its bottom line with the source line.

## 5. Search

- Placeholder: `Search architecture, architect, style…`
- Click the box: Recent shows up to 5 texts and up to 5 buildings, each newest first. Texts differing only in letter case are one entry (the spelling sent last stays).
- Typing: results appear at once in the preview (main matches only, up to 30), no highlighting. Enter sends. Empty text: nothing happens. No match: Enter sends nothing and the list shows `No Results`, then a grey line `Try other words, or clear the search with ×.`
- A preview row opens its card; ＜ returns to the preview with the text kept. Text typed and not sent stays when another screen opens and comes back when the box opens again; a reload keeps it.
- Text folding: letter case, full-/half-width, accents and extra spaces do not count.
- Found: a field contains the word. Several words: every word must be found, in any order; `and`, `of`, `de` are ordinary words. One letter or digit: only names and tags starting with it. One Chinese character: an ordinary search.
- Fields: name; tags (architect, style, category, city, country, keywords zh and en); summary text.
- Order: exactness (whole field > field start > start of a word in it > inside a word), then field (name > tags > summary), then year, oldest first, no grouping. Several words: each word is scored and the scores add up. Matches found only in the summary wait behind `Other Possible Outcomes`.
- Typos are not corrected.

## 6. Paths

| Path | Steps |
|---|---|
| Text | Search → type → preview → Enter → results (list + map) → card |
| Recent building | Search → recent building → card |
| Recent text | Search → recent text → text search |
| Style | Category → tag → that category's buildings, oldest first (R5) |
| Architect | Card → architect → text search [architect] |
| Browse | Zoom in → marker → card |
| Dense | Number point → number point list → row → card |

## 7. Map camera (P4)

- Sent search, tag, Other Possible Outcomes opened: the map frames all listed buildings, clear of the window edges and the panels.
- Card: the building comes to the middle of the free part of the map; it zooms in only when the building is merged with markers at other places, just until it stands alone.
- Number point: the map zooms in just until its buildings at different places split, never closer than the view that holds them all; entries at the same place stay a number point.
- ＜: a results, tag or number point list comes back framed as when it opened; a card comes back with its building where it was when the card opened; other screens bring back the map as it was left.
- Phone: a search sent with the keyboard up is framed once the keyboard has gone.
- Country heading in a long results list: click frames that country's buildings; the heading is not clickable while the map shows exactly that framing.

## 8. Lists

- Every building row (preview, results, tag list, number point list, recent buildings): category colour strip on the left; line 1 name, bold; line 2 built span · city; line 3 architect · style; thin grey rule between rows. Long text wraps, never ends in `…`. Recent buildings put built span · city beside the name.
- Number point list title: `XX Architectures`. Results lists with 10 or more buildings are grouped by country.
- Category page: the 10 style tags laid out as in v1 (KEEP.md).
- Pointing at a row (mouse) rings its marker on the map; a finger rings the last row it touched until it touches something else. The ring never shows by itself.
- While a list is out, the map names its rows on screen and dims the rest.

## 9. Building card

- Rows 1–2 on the category colour (KEEP.md): ＜ / × row, then the name, bold.
- Row 3: built span · city (start–completion, as the year rules give).
- Row 4: architect · style. Each architect is a link → text search. Style: the finer style if any, else the category name. No architect: `-`.
- Row 5: summary (Chinese).
- Keywords: one italic line, plain text, label `關鍵字：` (E3); struck keywords stay struck.
- Last, small grey italic: exam years (`TEST-ARCHED 2016 / 2018`).
- No Chinese and no field labels in the data rows.

## 10. Summary text

- Chinese prose. Names of people, buildings and styles in the original language, in full. Terms: Chinese with the original or English in brackets.
- Only the writing of names and terms changes; the meaning of each summary stays.

## 11. Addresses

The state is in the query string, so a link opens the same screen.

| Key | Meaning | Example |
|---|---|---|
| `q` | sent search text | `?q=Baroque` |
| `p` | open page that is not a result: `search` (typing), `category`, `era` (tag list) | `?p=category` |
| `b` | open card | `?b=pantheon-rome` |
| `g` | number point list: building ids joined by `~` | `?g=pantheon-rome~trevi-fountain-rome` |
| `m` | map view: lng, lat, zoom (`v` is taken by the fresh-copy reload) | `?m=12.49,41.89,13.2` |

The tag of a tag list gets its own key (P2; see §15). The ＜ history lives in `sessionStorage` (same tab, survives a reload, no step limit). A shared link opens its screen with no history. Typed, unsent text is never in an address.

## 12. Load failure

As v1 (KEEP.md): WebGL off → message, Details, building list. Street tiles failing → `Map detail didn't load.` with Retry.

## 13. Code rules

- React + Next.js (static export) + TypeScript; CSS for styles; no `.js` files in the repo.
- All code, comments, UI strings, scripts and repo docs in English (E3 aside); study content keeps its original wording.
- Colours, sizes and motion only from `src/styles/tokens.ts` / `tokens.css`.
- Module layout: MODULES.md.

## 14. Data (per building)

`id`, `name`, `built`, `city`, `nation`, `who` (architect), `era` (category id, one of 10), `eras` (all categories), `styleCard` (finer style), `summary`, `tags` (zh keywords, `~~x~~` = struck), `tagsEn`, `exams` (years), one point (`lat`, `lng`) (P3). Parts of one landmark are linked to it (§15).

## 15. Not yet built (the site differs from this spec)

| Item | Spec |
|---|---|
| Bug 1: a new card copies the scroll and map view of the screen before | P1, R1 |
| Bug 2: same-place entries zoom to 18 and vanish while a card is open | P3, P4, P5, §7 |
| Bug 3: a tag carried into a number point list becomes a search | P2, R5, §11 |
| Bug 4: Esc during IME composition closes everything | P6 |
| Bug 5: entries with several points draw only the first | P3, §14 |
| ＜ on results sent from the plain map | R2 |
| Phone search box ＜ | R3 |
| Landmark parts in the data | P3, §14 |

## 16. Removed

| Area | Items |
|---|---|
| Pages | Settings, Map tab, Quiz, Progress (saved browser data untouched) |
| Brand | `GC Atlas` mark (tab title stays `GC Atlas`) |
| Keeping | Starred, collections, export / import |
| Map | Country, Full map buttons; close-up on a second click; city names; edge markers; city locator inset; period band; per-city numbers; city circles |
| Filters | Filters panel and button, multi-select, filter chips |
| Search | `Try` examples, grouped Architect / City hits |
| Card | Photo link, Previous / Next and phone swipe, Also in / Nearest lists, tags under the card, sub-point names line |
| Help | `?` windows, first-visit note, page tours |
| Desktop | Search box and Category button on the map; the menu page; the scale bar bottom left |
| Other | Toasts, Sunset palette, F key, phone landscape side card |

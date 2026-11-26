# MODULES.md — GC map modules

Goal: testing one feature, or fixing one bug, happens in one module.
Rules of the site: `SPEC.md` (principles P1–P7, rules R1–R10, exceptions E1–E3). Protected look: `KEEP.md`.

## Layers

```
app → entry → shell → flows → features, layout → core → data → shared
```

- A module uses only the modules to its right (and `features` may use `layout`'s panel frame; `layout` never uses a feature).
- Features never use each other. A feature reports what was pressed; the shell passes it to a flow.
- Anything that moves several modules at once is a flow: one action, one file in `src/flows/`.
- Every module has one door, its `index.ts`; nothing reaches inside another module.
- Every piece of state has one owner (column "Owns"); others read it, and change it only through the owner.
- Each module keeps its own style file (phone rules included) and its own tests.
- `tests/boundaries.test.ts` and `tests/styles.test.ts` check these rules on every `npm test` (and so on every deploy).

## Modules

| Module | Folder | Does | Owns | Spec |
|---|---|---|---|---|
| tokens (S1) | `src/shared/tokens/` | Colours, sizes, motion, corners; page base and reduced motion | every design value | KEEP.md, R10 |
| ui (S2) | `src/shared/ui/` | Icons, the ＜ / × title row, the remove button, the plain button | — | R9 |
| storage (S3) | `src/shared/storage/` | Browser storage that never throws | — | |
| device (S4) | `src/shared/device/` | Phone or desktop, mouse or finger | — | P7 |
| data (D2) | `src/data/` | Buildings, categories, sort order, country groups, the text shown for a building | building data (read only) | §14 |
| pipeline (D1) | `scripts/data/` | Handout + data files + coordinates → `src/data/places.json`, `GAPS.md` (`npm run data`) | — | P3, §14 |
| history (C1) | `src/core/history/` | Screens, the history behind ＜, when ＜ shows (`useHistory`) | the screen history | R1, R2 |
| address (C2) | `src/core/address/` | Screen ↔ query string; rate-limited address writes | — | §11 |
| pointing (C3) | `src/core/pointing/` | What is pointed at; which list rows are on screen (`usePointing`) | pointed building, rows on screen | §8 |
| search (F1) | `src/features/search/` | Search box, matching and order, typed text, recent searches and buildings | box text, unsent text, recents | R4, §5 |
| category (F2) | `src/features/category/` | The tag page; a tag's buildings | — | R5 |
| list (F3) | `src/features/list/` | Building rows, country lines, Other Possible Outcomes, No Results | — | §8 |
| card (F4) | `src/features/card/` | The building card | — | §9 |
| map (F5) | `src/features/map/` | The map and its no-map page; `camera/` (framing, card moves, keyboard wait), `markers/` (dots, number points, names), `basemap/`, `extras/` (zoom buttons, scale bar, source line) | the map view | P4, P5, R6, §7 |
| rail (F6) | `src/features/rail/` | Desktop rail: Search, Category, fold button | — | R7 |
| layout (L1) | `src/layout/` | Panel frame, phone sheets, panel entry and exit, desktop panel open or folded, the part of the map the panels cover | desktop panel open, sheet height | R8, §4 |
| flows (W) | `src/flows/` | One file per action: open a card, open a number point, send a search, open the search, Category and tags, ＜, × and Esc, country lines, Other Possible Outcomes, map ready and stopped, keys, fold the panel | — | |
| shell (A1) | `src/shell/` | `pages.ts`: which page each screen shows; `App.tsx`: puts the modules on the page, builds the session (`Ctx`) the flows act on | — | R1 |
| entry (A2) | `src/entry/` | Client-only start, error guard, fresh-copy check, `/atlas` redirect; deploy check | — | |
| app | `src/app/` | Next.js routes, `globals.css` (lists the style files) | — | |

The phone sheet's height is published by `layout` as `--sheet-h` / `--sheet-fold`; the map's `extras` read them (E2).

## Where to change what

| To change | Open |
|---|---|
| How a search matches or orders | `features/search/search.ts` |
| What ＜ does | `flows/goBack.ts`; when it shows: `core/history/screen.ts` |
| What × or Esc does | `flows/closeAll.ts` |
| What opening a card does | `flows/openCard.ts`; how the map moves: `features/map/camera/camera.ts` |
| Which page a screen shows | `shell/pages.ts` |
| How a list row looks | `features/list/` (`ResultRow.tsx`, `list.css`) |
| How the card looks | `features/card/` |
| Markers, number points, names | `features/map/markers/` |
| Panel frame, phone sheets | `layout/` |
| A colour or a size | `shared/tokens/` |
| A building's data | `content/`, `data/` (then `npm run data`) |

A change that needs two modules usually means a flow, or a new door (export) on one module's `index.ts`.

## Change request format

```
Module: card (F4)
Change: (one sentence)
Leave alone: every other module
```

## Known cases that touch more than one module

| Case | Touches |
|---|---|
| A new kind of screen | history (screen kinds), address (query keys), shell (`pages.ts`), and the new feature |
| A module's door is not enough | that module and the modules using the new door |
| A new building data field | pipeline, data, and the module that shows it |

## After each change

1. `npm run typecheck`
2. `npm test` (unit tests of every module, data rules, module boundaries, style ownership)
3. Push to `main` → GitHub Actions checks, builds and publishes https://vivinne.github.io/gc-map/

# KEEP.md — what the redesign keeps from GC Atlas v1

Backup of v1: branch `v1-legacy` (code, = `atlas` at 6b4d8d0) and `v1-legacy-pages` (published build, = `gh-pages` at b3af003).
Everything below survives the redesign unchanged. Anything not listed here is free to change or go (see SPEC.md, Remove).

## Tokens (single source)
| What | Where |
|---|---|
| Style colours, 10 categories, palette "Earth to sky" | `src/shared/tokens/tokens.ts` → `ERA_COLORS` |
| Basemap colours (sea, land, road, building) | `src/shared/tokens/tokens.ts` → `MAP_COLORS` |
| Ink, greys `--gNN`, rule, mute, soft | `src/shared/tokens/tokens.css` |
| Motion: `--ease`, `--ease-in`, `--t-fast` 120 ms, `--t-mid` 220 ms, `--t-slow` 420 ms, `--leave` 160 ms | `src/shared/tokens/tokens.css` |
| Corners `--r-s` 6 px, `--r-m` 10 px | `src/shared/tokens/tokens.css` |
| Type: Archivo Variable for the interface; Chinese text (`.sum`) in the device's own Chinese font (Noto Sans TC if installed, else PingFang TC, Microsoft JhengHei…; no Chinese font is shipped, Q10, 2026-11-20), 14 px / 1.45 | `src/shared/tokens/tokens.css`, `src/features/card/card.css` (`.sum`) |
| Spacing: 16 px from every edge, controls 32 px high, list rows 40 px | `src/shared/tokens/tokens.ts` (`INSET`, `CONTROL_H`, `ROW_H`), drawn from the size scale in `src/shared/tokens/tokens.css` |

Category colours in order: Ancient `#D27F6B`, Medieval `#C2894F`, Renaissance `#A6943C`, Mannerism `#799C51`, Baroque `#4B9C75`, Neoclassicism `#1B9794`, Art Nouveau `#278CAB`, Modern `#507CB5`, Beaux-Arts `#6B8BA2`, Others `#80878F`. Ancient and Medieval were darkened on 2026-11-28 (user) so the white card title on them reaches 3:1 (WCAG); every category colour must keep white text at 3:1 or more.

## Components and effects
| What | Where | Rule |
|---|---|---|
| Scale bar | `src/features/map/extras/ScaleBar.tsx` (`scaleFor`, `ScaleBar`) | Same look: length label over an open bracket, longest round length within 110 px. The 100 km rule reads `scale.metres` |
| Press feedback | each module's style file (`:active` → `translateY(1px)`, background darkens over `--t-fast`) | Every clickable thing |
| Panel entry / exit | `src/layout/layout.css` keyframes `drawer-in`, `slide-in`, `sheet-in`, `drop-in`, `slide-out`, `out-l`, `out-d`; `src/layout/Leave.tsx` | Panels slide and fade in, slide away on close; nothing else moves |
| Style colour on the card title (rows 1–2 of the building card) | `.c-top` background = category colour | As now |
| Style tags layout in the Category list | `.styles` grid (2 columns, 4 px gap), `.chip` 32 px with swatch and count | Same size as the style tags in the v1 filters panel |
| List ↔ map hover highlight | `onHover` in lists, `hoverId` in `MapView` | Kept as visual feedback |
| Map failure screen | `MapView` `fallback` (WebGL off): message, Details, building list | As v1; the list uses the new row format |
| Number point look | `src/features/map/markers/NumberPoint.tsx` (v1 city circle: category ring, count) | |
| Basemap | `src/features/map/basemap/basemap.ts`, `src/data/basemap.json`, OpenFreeMap street tiles | As now |
| Default view | Europe, as v1 Full map | As now |

## Data kept
All of `data/`, `content/`, `scripts/data/` and the data rules (years, architects, styles, coordinates). Browser data under `gc-atlas:` keys is left untouched.

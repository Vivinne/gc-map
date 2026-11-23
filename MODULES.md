# MODULES.md — GC map 模組清單

用途：更新網站時，只讀「該模組的檔案 + 連動檔」，不讀整個 repo。
規則與畫面行為以 `SPEC.md` 為準；不可更動的設計見 `KEEP.md`；資料流程見 `README.md`。
依據：repo `Vivinne/gc-map` main @ e6efa10（2026-11-19 盤點；同日拆分 CSS 與 MapView）。

## 修改請求格式

```
模組：M5 建築卡片
要改：（一句話描述）
不要動：其他模組
回傳：只回傳改動的部分（diff）
```

## 模組總表

| ID | 模組 | 負責什麼 | 主要檔案 | 連動檔（改時一併檢查） | 常改程度 |
|---|---|---|---|---|---|
| M1 | 資料 | 建築清單、年代、摘要、建築師全名、國家、考古年份、多風格標籤 | `content/handout-c3-s6.md`、`data/*.txt`、`data/*.csv` | `scripts/build-data.ts`、`tests/data.test.ts`、產出 `src/data/places.json`、`GAPS.md` | 高 |
| M2 | 座標 | 每棟建築的位置與來源 | `data/geo-raw.txt`、`data/geo-manual.csv` | `scripts/build-data.ts`（城市範圍檢查 `CITY`）、`GAPS.md` | 中 |
| M3 | 搜尋 | 搜尋框、預覽清單、最近搜尋、排序 | `src/components/SearchBox.tsx`、`src/lib/search.ts`、`src/lib/recent.ts`、`src/lib/storage.ts` | `App.tsx`（送出搜尋）、`styles/modules/search.css` | 中 |
| M4 | Category | 10 個風格標籤、點選後搜尋 | `src/components/CategoryList.tsx` | `src/lib/model.ts`（分類）、`styles/modules/category.css` | 低 |
| M5 | 建築卡片 | 標題色塊、年代、建築師連結、摘要、考古年份 | `src/components/BuildingCard.tsx`、`src/lib/style.ts` | `Panel.tsx`、`HeadBar.tsx`、`styles/modules/card.css` | 中 |
| M6 | 清單 | 預覽／結果／數字點清單、依國家分組、hover 連動 | `src/components/ResultList.tsx`、`src/components/ResultRow.tsx`、`src/lib/country.ts` | `styles/modules/rows.css`、`App.tsx`（清單切換） | 中 |
| M7 | 面板外框 | 面板開關、標題列（＜ ×）、手機抽屜高度、離場動畫 | `src/components/Panel.tsx`、`src/components/HeadBar.tsx`、`src/components/Leave.tsx` | `styles/modules/panel.css`、`leave.css`、`phone.css` | 低 |
| M7a | 左側直條（桌面） | 三條線／放大鏡／Category，面板開關與亮起 | `src/components/Rail.tsx`、`src/components/RailMenu.tsx`（選單頁） | `App.tsx`（`panelOpen`、`railPage`）、`styles/modules/rail.css`、`panel.css`（`.dock`、滑出） | 低 |
| M8 | 地圖 | 地圖本體與事件、縮放鈕、圖磚失敗提示 | `src/components/MapView.tsx`、`src/lib/pointer.ts` | `styles/modules/map.css` | 中 |
| M8a | 地圖：鏡頭 | 框選結果、開卡片時移動、數字點展開、＜ 返回 | `src/components/map/camera.ts` | `src/lib/geo.ts`、`src/lib/country.ts` | 中 |
| M8b | 地圖：標記與數字點 | 圓點、重疊合併成數字點、建築名稱擺放、選取標記 | `src/components/map/overlay.tsx`、`src/components/NumberPoint.tsx` | `src/lib/geo.ts`（合併規則）、`styles/modules/map.css` | 中 |
| M8c | 地圖：底圖樣式 | 海、陸、河、道路、建築輪廓的圖層 | `src/components/map/style.ts` | `src/lib/basemap.ts`、`tokens.ts`（`MAP_COLORS`） | 低 |
| M9 | 比例尺 | 左下角比例尺；讀數也決定 100 km 以內才顯示所有建築名稱 | `src/components/ScaleBar.tsx`、`src/lib/scale.ts` | `MapView.tsx`（`NAME_SCALE`）、`styles/modules/map.css` | 低 |
| M10 | 導覽與狀態 | ＜ 返回、× 關閉、網址、重新整理還原、快捷鍵 | `src/lib/nav.ts`、`src/lib/address.ts`、`src/components/App.tsx`（串接所有模組） | 幾乎所有 UI 模組 | 低（高風險） |
| M11 | 視覺設定 | 風格色、底圖色、灰階、動態、圓角、間距、字型 | `src/styles/tokens.ts`、`src/styles/tokens.css` | `styles/modules/base.css`、`shape.css`、`KEEP.md`（受保護值） | 低 |
| M12 | 共用小件 | 圖示、資料型別、資料載入 | `src/components/Icons.tsx`、`src/lib/types.ts`、`src/lib/data.ts`、`src/lib/model.ts` | 改型別會影響多個模組 | 低 |
| M13 | 頁面入口與發布 | Next.js 入口、`/atlas` 轉址、GitHub Pages | `src/app/*`、`src/components/ClientEntry.tsx`、`src/components/Guard.tsx`、`src/lib/fresh.ts`、`src/components/Redirect.tsx`、`.github/workflows/deploy.yml` | `next.config.ts`、`package.json` | 低 |

## 跨模組功能（一個動作經過多個模組）

| 功能 | 經過的模組與檔案 | 改什麼找哪裡 |
|---|---|---|
| 點卡片上的建築師名字 → 搜尋該建築師 | M5 `BuildingCard.tsx`（名字按鈕 `.c-who`）→ M5 `lib/style.ts`（`architectParts`：把「A and B」拆成各自的連結）→ M10 `App.tsx`（`onArchitect={submit}`）→ M3 搜尋 | 名字樣式、拆法：M5；點了之後搜尋的行為：M3 |
| 點 Category 風格 → 搜尋該風格 | M4 `CategoryList.tsx` → M10 `App.tsx` → M3 搜尋 | 按鈕：M4；搜尋行為：M3 |
| 點地圖上的圓點 → 開卡片 | M8b `overlay.tsx` → M10 `App.tsx` → M5 卡片、M8a 鏡頭移動 | 點的範圍：M8b；地圖移動：M8a |
| 點數字點 → 清單 | M8b `overlay.tsx` → M10 `App.tsx` → M6 清單、M8a 鏡頭展開 | |

## 樣式對照（`src/styles/modules/`，由 `src/app/globals.css` 依序載入）

順序不可調換：後面的檔案會覆蓋前面的規則。

| 檔案 | 屬於 |
|---|---|
| `base.css` | M11 基礎、按下回饋、頁面 |
| `search.css` | M3 搜尋框、M4 Category 按鈕 |
| `panel.css` | M7 面板外框、標題列 |
| `rail.css` | M7a 左側直條（桌面） |
| `rows.css` | M6 清單列 |
| `category.css` | M4 風格標籤 |
| `card.css` | M5 建築卡片 |
| `map.css` | M8 地圖與縮放鈕、M8b 標記與數字點、M9 比例尺、載入失敗畫面 |
| `leave.css` | M7 面板離場動畫 |
| `phone.css` | 手機版（各模組） |
| `shape.css` | M11 圓角、減少動態 |

## 依賴方向

```
M1/M2 資料 ──(npm run data)──> places.json ──> M12 model
M12 ──> M3 M4 M5 M6 M8
M3 M4 M5 M6 M7 M8 ──> M10 App.tsx（串接）
M11 tokens ──> 全部
```

## 已知缺口（待決定）

| 項目 | 現況 | 建議 |
|---|---|---|
| `App.tsx` 437 行 | 串接所有模組 | 暫不動 |
| `scripts/build-data.ts` 639 行 | 解析、座標、檢查、輸出在同一檔 | 改資料時通常不用讀；有需要再拆 |
| `phone.css` | 手機版規則集中一檔，未分到各模組 | 改手機版時一併讀；拆開會改變覆蓋順序，暫不動 |

## 每次修改後

1. `npm run typecheck`
2. `npm test`（改 M1、M2 時必跑）
3. 推送到 `main` → 自動發布到 https://vivinne.github.io/gc-map/

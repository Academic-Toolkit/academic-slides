## Why

成大演講（2026-10-22）的投影片在 job_finding/ncku-talk-quarto 反覆修改了幾十輪，累積出一套可重用的做法：
- 內容與數學可讀性原則：模型寫明、彩色大括號標意義、表格只標重點數字。
- 從使用者回饋整理出的版面規則：字級變異小、一句一行、稀疏頁置中。
- 一組自動檢查腳本：頁尾遮擋、右緣溢出、標題換行、填滿度、字數、MathJax 錯誤、Quarto 與 beamer 標題對照。
- Quarto revealjs 主檔搭配 beamer 鏡像的雙格式流程。

這些目前分散在一個專案的 theme、scripts 與 ~/.claude/skills/academic-slide-design 裡，綁死在 NCKU 的色票與檔名，無法直接用在下一場演講或課程。

## What Changes

- 在 ~/Documents/academic-slides 建立獨立 repo，格式比照 PsychQuant 既有的單一 plugin repo（例如 truth-conditions）：根目錄 .claude-plugin/marketplace.json，plugin 放 plugins/academic-slides/。
- plugin 內含三個 skill：
  - academic-slide-design：設計原則，含內容、數學可讀性、版面與字級、表格、模擬頁、討論頁、講者備註。由現有 skill 與本次回饋泛化而來。
  - slide-deck-scaffold：可直接複製的 Quarto revealjs 範本與對應的 beamer 範本，共用色票變數與元件 class。
  - slide-qa：檢查腳本與修正對照表。
- 檢查腳本一律改寫為 Node（.mjs），參數化 HTML 路徑、頁尾選擇器與尺寸；原本的 density-check.py 改寫為 check-density.mjs。
- README 說明安裝（/plugin marketplace add PsychQuant/academic-slides）與使用流程。
- 建立 private repo PsychQuant/academic-slides 並推送。

## Non-Goals

- 不帶入任何演講內容：成大投影片、論文數字、圖檔、R 繪圖腳本都不放。
- 不加入 Python 相依；只用 Node、Playwright、Quarto、XeLaTeX。
- 這次不上架到公開的 psychquant-claude-plugins marketplace，也不公開 repo。
- 不修改 job_finding/ncku-talk-quarto 本身。

## Capabilities

### New Capabilities

- `plugin-packaging`：repo 與 plugin 的目錄結構、manifest、安裝方式與發布位置。
- `slide-design-guidance`：academic-slide-design skill 必須涵蓋的原則與規則。
- `deck-scaffold`：Quarto 與 beamer 範本的內容、共用元件與標題對照規則。
- `slide-qa-tools`：各檢查腳本的輸入、輸出、結束碼與檢查項目。

### Modified Capabilities

(none)

## Impact

- 新增：~/Documents/academic-slides 整個 repo（plugins/academic-slides/skills/ 下三個 skill、templates、scripts、README）。
- 參考但不修改：job_finding/ncku-talk-quarto/theme/ncku.scss、scripts/check-overflow.mjs、scripts/density-check.py、scripts/export-pdf.mjs、~/.claude/skills/academic-slide-design/SKILL.md。
- 外部：GitHub 組織 PsychQuant 新增 private repo academic-slides。

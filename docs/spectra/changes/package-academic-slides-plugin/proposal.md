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

## 後續變更：issue #8（2026-10-18）

- 範本改成四種：research-talk（原本的範本）、short-talk、results-report、lecture，共用唯一一份 `templates/quarto/_theme/deck.scss`；範本只放內容骨架（`_quarto.yml`、`talk.qmd`），不帶自己的 `deck.scss`。beamer 鏡像只對應 research-talk。
- 新增 `slide-deck-scaffold/scripts/scaffold.mjs`：依官方、個人（`~/.claude/.academic-slides/`）、專案（往上找最近的 `.claude/.academic-slides/`）三層設定逐欄合併，建立新投影片資料夾。
- 表格補上最後一列下方的粗線，與 beamer 的 `\bottomrule` 一致；設計規則寫明三條線。
- repo 根目錄加 `templates` 連結，指向 plugin 內的範本資料夾。
- 版本升為 0.2.0（範本資料夾結構改變，README 的快速上手改用 scaffold 腳本）。
- 不在這次範圍：已建立的投影片更新主題（#10）、check-density 計算中文字數（#9）。
- 受影響的 capability：`deck-scaffold`、`slide-design-guidance`、`plugin-packaging`。

## 後續變更：issue #44（2026-10-31）

- `slide-deck-scaffold` 產生的 deck 不再一律叫 `talk`：`scaffold.mjs` 新增必填的 `--name`，用範本的 `talk.qmd` 寫出 `<name>.qmd`，`_quarto.yml` 的 render 清單跟著改。名稱依序取自使用者明說的名稱、從標題、場合或課程推得出且只有一種寫法的名稱，否則問使用者（使用者 2026-10-31 定案）；名稱照使用者給的寫法，含中文、大小寫與底線，只擋不安全或不可攜的字元（使用者 2026-10-31 於 verify 第 1 輪後定案）。
- slide-qa 六支腳本（check-density、check-fill、check-layout、check-mathjax、export-pdf、handout）沒給檔名時讀 deck 自己的檔案：以 `project.render` 或唯一的 `.qmd` 定出主檔名，挑同名的 `.qmd`／`.html`／`.pdf`；主檔名定不出來時才用資料夾裡唯一的檔案；缺檔或分不出來時以狀態 2 結束並列出候選，不再預設 `talk`（使用者 2026-10-31 於 verify 第 1 輪後定案）。
- 範本來源檔名（`templates/quarto/<name>/talk.qmd`、`templates/beamer/talk.tex`）不變，既有個人與專案範本照常可用；既有 `talk.*` deck 照常可用，不提供改名工具。
- 版本升為 0.7.0。
- 不在這次範圍：檔案以外的選項缺值的處理（#45）、scaffold 自動複製 beamer 檔。
- 受影響的 capability：`deck-scaffold`、`slide-qa-tools`。

## 後續變更：issue #45、#49、#46（2026-11-01，一條 chain、一個 PR）

- #45：slide-qa 五支檢查腳本（check-density、check-fill、check-layout、check-mathjax、export-pdf）各自宣告選項，共用 `_lib.mjs` 的讀法；缺值、不是數字或超出範圍的數值、不認得的選項、不屬於任何選項的參數、重複的選項都以狀態 2 結束並點名選項，在找 deck 檔之前回報（使用者 2026-11-01 定案「全部比照 handout」）；handout 維持 #34 的狀態 1。
- #49：scaffold 的帶值選項後面接另一個選項時以狀態 2 結束，不寫任何檔（`--out --dry-run` 原本會寫出 deck）。
- #46：`_quarto.yml` 裡掃描器讀不懂的寫法不再猜：slide-qa 沒給檔名參數時以狀態 2 結束並指出檔名與行號，scaffold 在寫入前以狀態 1 拒絕這種範本；`metadata-files` 讀它列的檔，profile 檔設了 render 或 output-file 時也拒絕；只用 Node 內建模組（使用者 2026-11-01 定案）。#48（實際使用後回顧取名）依使用者決定 park，不在這條 chain。
- 版本升為 0.8.0（打錯的選項、讀不懂的設定改為拒絕，是行為改變）。
- 不在這次範圍（開為 follow-up）：其他決定輸出檔名的來源（#50）、既有訊息與 trim 對不受信任資料夾的處理（#51）、scaffold 與 slide-qa 選項規則的其餘差異（#52）。
- 受影響的 capability：`deck-scaffold`、`slide-qa-tools`。


## 1. Repo 骨架

- [x] 1.1 [Req: Repository layout and manifests] 建立 D1「Repo 與 plugin 結構比照 PsychQuant 單一 plugin repo」的目錄、.claude-plugin/marketplace.json、plugins/academic-slides/.claude-plugin/plugin.json、.gitignore（node_modules、.quarto、*_files、渲染產物）與三個 skill 的 SKILL.md 佔位（分工依 D2「拆成三個 skill，各自觸發」）；驗證：`claude plugin validate --strict .` 與 `claude plugin validate --strict plugins/academic-slides` 都以狀態 0 結束（佔位 SKILL.md 先有合法 frontmatter）。

## 2. 檢查腳本（slide-qa）

- [x] 2.1 [Req: Density check reproduces the source script] [after: 1.1] 依 D3「檢查腳本只用 Node，全部參數化」把 density-check.py 移植為 slide-qa/scripts/check-density.mjs（--qmd、--tex、--words、--bullets、--skip-classes、--help）；驗證：對 job_finding/ncku-talk-quarto/talk.qmd 與 ncku-talk/talk-beamer-stats.tex，兩支腳本的輸出以 diff 比對完全相同，結束碼也相同（D6「回歸測試用成大投影片」）。
- [x] 2.2 [Req: Layout check] [Req: Fill check] [Req: MathJax and PDF export] [after: 1.1] 把 check-overflow.mjs 泛化為 check-layout.mjs（--html、--width、--height、--footer、--out、--shots），並新增 check-fill.mjs、check-mathjax.mjs、export-pdf.mjs，皆有 --help；驗證：在成大 talk.html 上 check-layout 的結果與原 check-overflow.mjs 相同（0 頁），check-mathjax 回報 0 錯誤；另做一份含過寬式子與未定義巨集的測試投影片，check-layout 與 check-mathjax 都以狀態 1 結束並指出該頁。
- [x] 2.3 [Req: Layout check] [after: 2.2] 撰寫 slide-qa/SKILL.md 與 references/fix-table.md（每種檢查失敗的成因與修法，例如右緣溢出→拆行或改全寬、標題換行→縮短、稀疏頁→roomy 或 vc）；驗證：SKILL.md 列出的每個腳本名稱與參數都和腳本 --help 一致（人工對照）。

## 3. 範本（slide-deck-scaffold）

- [x] 3.1 [Req: Quarto template renders and passes the checks] [Req: Palette is a single set of variables] [after: 2.2] 依 D4「範本以色票變數與元件 class 為介面」建立 templates/quarto（_quarto.yml、talk.qmd、theme/deck.scss），內容用中性的教科書例子；驗證：複製到暫存資料夾後 `quarto render` 成功，check-layout、check-density、check-mathjax 都以狀態 0 結束；改五個色票變數後重新 render，標題、定理條、takeaway、大綱編號、表頭顏色都跟著變（截圖確認）。
- [x] 3.2 [Req: Beamer mirror compiles with matching titles] [after: 3.1] 建立 templates/beamer/talk.tex，主體標題與 talk.qmd 一對一；驗證：XeLaTeX 編譯兩次，log 0 error、0 overfull；`check-density.mjs --qmd talk.qmd --tex talk.tex` 印出「N/N titles match」並以狀態 0 結束。
- [x] 3.3 [Req: Quarto template renders and passes the checks] [after: 3.2] 撰寫 slide-deck-scaffold/SKILL.md：複製範本、換色票、改標題的步驟，以及 Quarto 為主檔、beamer 鏡像的同步流程（含在雲端同步資料夾外編譯 beamer）；驗證：照 SKILL.md 步驟在新暫存資料夾從零走一次，產出可 render 的投影片（人工演練）。

## 4. 設計原則（academic-slide-design）

- [x] 4.1 [Req: Design skill covers content, mathematics, layout, and notes] [Req: Layout rules from review feedback] [Req: Generic examples] [after: 1.1] 依 D5「從審閱回饋泛化的版面規則寫進 academic-slide-design」撰寫 SKILL.md 與 references/（content-principles、math-readability、layout-rules、tables-and-figures、evidence-slides、speaker-notes、checklist）；驗證：SKILL.md 連到的每個 reference 檔都存在；layout-rules 涵蓋規格列出的每條規則與理由；grep 不到來源演講的結果數字（0.72、0.960、0.828、107,417）。

## 5. 文件與發布

- [x] 5.1 [Req: No project-specific content] [Req: Private distribution under PsychQuant] [after: 2.3, 3.3, 4.1] 撰寫 README.md（用途、三個 skill、安裝指令、需要的工具與測試過的版本、快速上手、來源說明）；驗證：在 README.md 與 docs/spectra/ 之外 grep 不到 ncku、成大、econblue；`claude plugin validate --strict` 兩處皆通過。
- [x] 5.2 [Req: Private distribution under PsychQuant] [after: 5.1] 依 D7「發布為 PsychQuant private repo」提交並建立 private repo PsychQuant/academic-slides、推送 main；驗證：`gh repo view PsychQuant/academic-slides --json visibility,defaultBranchRef` 回報 PRIVATE 與 main，遠端可看到 plugins/academic-slides/.claude-plugin/plugin.json。

## 6. GitHub issues #1–#3（2026-10-14）

- [x] 6.1 [Req: Screenshots stay with the deck] check-layout.mjs 預設輸出改為投影片旁的 qa/，--shots 檔名改為 <deck>-NN.png、被標記的頁為 <deck>-NN-flagged.png，並同步 --help、SKILL.md 與 fix-table.md（issue #1；決定採 qa/ 而非 mkdtemp：位置固定好找，且與 SKILL.md 範例一致）；驗證：不給 --out 時截圖出現在 talk.html 旁的 qa/，系統暫存資料夾下沒有 slide-layout；同一資料夾檢查兩份投影片，兩者的逐頁截圖都保留。
- [x] 6.2 [Req: Deck file names are URL-encoded] check-layout、check-fill、check-mathjax、export-pdf 組網址時對檔名做 encodeURIComponent（issue #2；決定採「編碼後照常開啟」）；驗證：把範本 talk.html 複製為 `a#b%c?.html` 後，四支腳本都正常完成，不再逾時。
- [x] 6.3 [Req: Local server answers only requests addressed to itself] _lib.mjs 的 serve() 檢查 Host header，非 127.0.0.1:<port> 或 localhost:<port> 時回 403（issue #3）；驗證：以 curl 帶 `Host: example.com:<port>` 請求回 403，帶 `Host: 127.0.0.1:<port>` 回 200；範本上四支腳本照常通過。
- [x] 6.4 [Req: Screenshots stay with the deck] [Req: Deck file names are URL-encoded] [Req: Local server answers only requests addressed to itself] [after: 6.1, 6.2, 6.3] 推送分支 fix/slide-qa-issues-1-3 並開 PR，內文以 Fixes #1、Fixes #2、Fixes #3 連結 issue，並寫明 #1、#2 兩個待決選項的決定；驗證：`gh pr view` 顯示 PR 為 open，且連結了三個 issue。

## 7. GitHub issue #5：PDF 疊字（2026-10-18）

- [x] 7.1 [Req: Layout check] check-layout.mjs 在螢幕檢查後加一輪 PDF 列印檢查：經 _lib.mjs 的 openPrintView 開啟 export-pdf 印的同一個列印視圖，viewport 設為 @page 大小並模擬 print media，逐頁套用頁尾、右緣、標題三項 DOM 檢查，被標記的頁存為 <deck>-print-NN-flagged.png；驗證：用 issue #5 的中性重現例子（舊主題）跑，第 2 頁被標記、以狀態 1 結束；範本照常以狀態 0 結束。
- [x] 7.2 [Req: Quarto template renders and passes the checks] theme/deck.scss 的 `.vc` 拆成螢幕與列印兩條規則，列印規則（`html.print-pdf`）以 `!important` 固定 `var(--slide-height, 720px)` 與 64 px 頁尾保留；列印時拿掉頁尾白底，免得蓋住頁碼（issue #5；根因是 revealjs 列印樣式的 `padding: 0 !important`，加上頁面比投影片高出 margin）；驗證：重現例子用新範本 render 後 check-layout 以狀態 0 結束，PDF 第 2 頁最後一行在頁尾之上，頁碼看得見。
- [x] 7.3 [Req: MathJax and PDF export] export-pdf.mjs 改用 openPrintView，與 check-layout 量測同一個列印視圖；PDF 本身不變（決定保留 revealjs 的 margin，而非紙張等於畫布：本範本的留白來自 margin，margin=0 會讓標題貼齊紙張左緣）；驗證：範本 15 頁、重現例子 2 頁，頁數等於投影片數，頁面 1056×594 pt。
- [x] 7.4 [Req: Layout check] [Req: MathJax and PDF export] [after: 7.1, 7.2, 7.3] 同步 --help、slide-qa/SKILL.md、fix-table.md 與 README，推送分支 idd/5-export-pdf-content-that-passes-check-lay 並開 PR，內文以 Refs #5 連結（不用 Fixes，issue 於 merge 後由 /idd-close 關閉）；驗證：`gh pr view` 顯示 PR 為 open。


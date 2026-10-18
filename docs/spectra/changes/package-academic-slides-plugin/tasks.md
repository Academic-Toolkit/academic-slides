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
- [x] 7.5 [Req: Layout check] [after: 7.4] 依 PR #6 verify 第 1 輪修正（同一 PR）：列印視圖量不到投影片頁時不再印 ✓，改以狀態 3 結束並說明；頁碼依文件順序累計實際 PDF 頁（跨頁投影片、show-notes separate-page 的備註頁各自計頁）；check-layout 加 try/finally，列印檢查出錯時仍印出螢幕結果並以狀態 3 結束；SKILL.md、fix-table.md、export-pdf 註解改成只宣稱實際檢查的三項，補 exit 3、頁碼起算與 fixed 頁尾的限制；design.md 與 academic-slide-design checklist 同步。深色背景頁、標題控制字元、回歸測試 fixture 移到 #7；驗證：把 reveal.js 的 pdf-page 改名後 check-layout 以狀態 3 結束且不印 ✓；三份邊界 deck（跨頁溢出、show-notes separate-page、fragments）每一行 `page N  標題` 都在 PDF 第 N 頁找得到該標題；T1–T5 照常通過。

## 8. GitHub issue #8：四種範本、三層設定、表格底線（2026-10-18）

- [x] 8.1 [Req: Palette is a single set of variables] [Req: Tables draw three rules] 依 D8「範本只放內容骨架，主題只有一份」與 D11「表格三條線」，把 `templates/quarto/theme/deck.scss` 移到 `templates/quarto/_theme/deck.scss`，五個色票變數加 `!default`，`tbody tr:last-child td` 加 2px `$deck-ink` 底線；驗證：8.7 的 render 測試中，個人 `theme.scss` 設 `$deck-primary: #8b0000;` 後標題為 `rgb(139, 0, 0)`，results-report 第一張表最後一列儲存格的 `border-bottom-width` 為 2px、較早一列為 1px。
- [x] 8.2 [Req: Quarto template renders and passes the checks] [Req: Beamer mirror compiles with matching titles] [after: 8.1] 依 D8，把原本的 `_quarto.yml`、`talk.qmd` 移到 `templates/quarto/research-talk/`，front matter 加 `lang: en`，主題清單改為 `[default, _theme/deck.scss]`；`beamer/talk.tex` 的註解改指 `_theme/deck.scss`；驗證：scaffold 建立的 research-talk 投影片 render 後四項檢查以狀態 0 結束；`check-density.mjs --qmd research-talk/talk.qmd --tex beamer/talk.tex` 印出全部標題相符。
- [x] 8.3 [Req: Scaffold merges three settings layers] [Req: Same-name templates resolve project, personal, official] [Req: Scaffold writes only into an empty folder] [after: 8.2] 依 D9「三層設定逐欄合併，不是找到第一份就停」與 D10「scaffold 腳本的介面」，以 TDD 新增 `slide-deck-scaffold/scripts/scaffold.mjs`（只用 Node 內建模組）與 `tests/scaffold.test.mjs`：三層解析與逐欄合併、`null` 移除欄位、專案層只取最近一份且不讀家目錄本身、未知欄位警告、型別錯誤在寫入前以狀態 1 停止、同名範本優先序與遮蔽輸出、範本自帶 `deck.scss` 的警告、符號連結略過、名稱格式檢查、非空資料夾拒絕、`--dry-run` 不寫檔、`--list`、主題清單與 overlay 複製；驗證：先看到新測試在實作前失敗，`node --test tests/` 全部通過，且 spec 各情境都有對應的測試名稱。
- [x] 8.4 [Req: Quarto template renders and passes the checks] [after: 8.3] 新增 `templates/quarto/results-report/`（繁體中文、無數學、以表格為主：問題、資料與評分方式、主要結果表、一致性表、限制、下一步、備用頁），內容用中性的作業評分例子；驗證：scaffold 建立後 render，check-layout（螢幕與列印）、check-mathjax、check-density 以狀態 0 結束，check-fill 未列出沒有 `roomy`／`vc` 的稀疏頁。
- [x] 8.5 [Req: Quarto template renders and passes the checks] [after: 8.3] 新增 `templates/quarto/short-talk/`（英文，10–15 分鐘：問題、方法一頁、兩頁結果、結論、備用頁）；驗證同 8.4。
- [x] 8.6 [Req: Quarto template renders and passes the checks] [after: 8.3] 新增 `templates/quarto/lecture/`（繁體中文：大綱、學習目標、定義、逐步例子、隨堂題、重點回顧、備用頁），例子用標準差；驗證同 8.4。
- [x] 8.7 [Req: Quarto template renders and passes the checks] [Req: Palette is a single set of variables] [Req: Tables draw three rules] [after: 8.4, 8.5, 8.6] 依 D12「根目錄的 templates 入口與測試位置」，新增根目錄 `package.json`（private，devDependency `playwright`）與 `tests/render-templates.sh`：以暫存家目錄逐一 scaffold 四個範本、`quarto render`、跑 check-layout、check-mathjax、check-density、check-fill，並以 Playwright 讀出 8.1 的兩項 computed style；`node_modules/` 列入 `.gitignore`；驗證：腳本對四個範本全部通過；把 8.1 的底線規則暫時拿掉時，表格測試失敗。
- [x] 8.8 [Req: Repository layout and manifests] [after: 8.2] 依 D12，repo 根目錄加 `templates` 符號連結指向 `plugins/academic-slides/skills/slide-deck-scaffold/templates`；驗證：透過連結讀到的 `templates/quarto/_theme/deck.scss` 與 plugin 內那份相同；`claude plugin validate --strict` 對 repo 根目錄與 `plugins/academic-slides` 都通過。
- [x] 8.9 [Req: Layout rules from review feedback] academic-slide-design 的 `tables-and-figures.md`、`layout-rules.md` 與 `checklist.md` 寫明表格三條線（表頭上、表頭下、最後一列下）且不加框線，附一行理由；驗證：layout 規則清單中的每一條都找得到理由（含新增這條）。
- [x] 8.10 [Req: Quarto template renders and passes the checks] [after: 8.3, 8.4, 8.5, 8.6, 8.8] 改寫 slide-deck-scaffold `SKILL.md`（四種範本的用途、三層設定與欄位、scaffold 用法、主題覆寫、範本限制）、README（根目錄入口、快速上手改用 scaffold、repo 結構、測試指令）、slide-qa `SKILL.md` 中 `theme/deck.scss` 的說明改指 `_theme/deck.scss` 並連到 #10；`plugin.json` 與 `marketplace.json` 升為 0.2.0；驗證：repo 內不再有指向 `templates/quarto/talk.qmd` 或 `templates/quarto/theme/deck.scss` 的說明（docs/spectra 的歷史紀錄除外）；兩處 `claude plugin validate --strict` 通過。
- [x] 8.12 [Req: Settings layers cannot leak local files or run code without consent] [after: 8.3] 依 commit 安全審查（符號連結跟隨、不受信任的設定搜尋路徑）修正 scaffold：設定層讀到的檔案不跟隨符號連結、範本資料夾必須在該層 `templates/` 之內、專案設定資料夾須屬於目前使用者、設定值拒絕 `<`、`{`、`[`、`]`、反引號、專案層的範本與 `theme.scss` 須加 `--trust-project`、無法判斷擁有者時整個專案層都需要該旗標。第一版用內容掃描判斷範本是否執行程式，第二輪審查指出可繞過，改為依來源判斷；驗證：新測試在修正前失敗、修正後 45 個全部通過；逐一拿掉信任閘門、字元檢查、`local.json` 連結檢查、層內位置檢查，各至少有一個測試失敗。
- [x] 8.13 [Req: Quarto template renders and passes the checks] [after: 8.4, 8.5, 8.6] 逐頁截圖時發現 `.vc` 頁兩種沒有置中的情形（0.1.x 就有）：標題後先接隱藏的 MathJax 巨集區塊時，auto 上邊距落在隱藏區塊上；只有一張表格時，reveal 給表格的 auto 下邊距分走三分之一的空間。`_theme/deck.scss` 補兩條規則；`tests/style-probe.mjs` 加 `--vc-centred`（每張 `.vc` 頁內容上方空白至少是下方的一半），render-templates.sh 對四個範本都跑；驗證：修正前 research-talk 以外三個範本共 4 張頁失敗，修正後四個範本都通過。
- [ ] 8.11 [Req: Repository layout and manifests] [after: 8.7, 8.9, 8.10] 推送分支 `idd/8-slide-deck-scaffold-four-official-templa` 並開 PR，內文以 Refs #8 連結（不用 Fixes，issue 於 merge 後由 /idd-close 關閉）；驗證：`gh pr view` 顯示 PR 為 open。

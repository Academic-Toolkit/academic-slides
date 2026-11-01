## Context

來源素材都在 job_finding：
- ncku-talk-quarto/：Quarto revealjs 主檔。theme/ncku.scss 有 291 行，scripts/ 下有三支腳本。
- ncku-talk/talk-beamer-stats.tex：beamer 鏡像，巨集包括 \simtag、\takeaway、\sourceline、\algobox、\bibent。
- ~/.claude/skills/academic-slide-design/SKILL.md：內容原則與數學可讀性。

2026-10-03 到 10-13 期間，使用者的審閱回饋又累積了一批版面規則（見 D5），這些規則目前只散落在對話與 talk.qmd 的實作裡。

PsychQuant 組織已有單一 plugin repo 的慣例（truth-conditions、perspective-writer）：
- 根目錄放 .claude-plugin/marketplace.json，plugins/<name>/ 下放 .claude-plugin/plugin.json 與 skills/<skill>/SKILL.md。
- `claude plugin validate --strict` 可以驗證 manifest 與 skills。

## Goals / Non-Goals

**Goals:**
- 一個裝上就能用的 plugin：新場演講或新課程照範本起步，照 skill 設計，用腳本驗收。
- 範本與腳本不含任何特定演講、機構色票或檔名；機構色票只是變數。
- 腳本能在成大這份投影片上重現原本的檢查結果，作為回歸測試。

**Non-Goals:**
- 不做 Quarto extension 或 npm 套件；不加入 Python 相依。
- 不帶 R 繪圖腳本（各主題自寫，skill 只寫原則：示意圖要標明是示意、標籤不能壓線）。
- 不上架公開 marketplace；repo 維持 private。

## Decisions

### D1. Repo 與 plugin 結構比照 PsychQuant 單一 plugin repo

```
academic-slides/
├── .claude-plugin/marketplace.json      # name: academic-slides，plugins[0].source = ./plugins/academic-slides
├── README.md
├── .gitignore
└── plugins/academic-slides/
    ├── .claude-plugin/plugin.json
    └── skills/
        ├── academic-slide-design/   SKILL.md + references/*.md
        ├── slide-deck-scaffold/     SKILL.md + templates/quarto/ + templates/beamer/
        └── slide-qa/                SKILL.md + scripts/*.mjs + references/fix-table.md
```
安裝：`/plugin marketplace add PsychQuant/academic-slides`，再 `/plugin install academic-slides@academic-slides`。

### D2. 拆成三個 skill，各自觸發

- academic-slide-design：「怎麼設計」，寫或審投影片時觸發。
- slide-deck-scaffold：「從哪裡開始」，新開一份投影片時觸發。
- slide-qa：「怎麼驗收」，改完要檢查或使用者回報版面問題時觸發。

三者互相引用，但各自的 SKILL.md 都能單獨讀懂。

### D3. 檢查腳本只用 Node，全部參數化

- 共用參數：`--html <path>`（沒給時找目前資料夾裡唯一的 `.html`，見 D21）、`--width 1280 --height 720`、`--footer '.reveal .footer'`、`--out <dir>`。
- check-layout.mjs：合併原 check-overflow.mjs 的四項檢查：頁尾像素帶、DOM 底緣、右緣溢出、標題換行。另有 `--shots` 逐頁截圖。issue #5 起再對 export-pdf 印的列印視圖逐頁做後三項 DOM 檢查，列印視圖量不到投影片頁時以狀態 3 結束。
- check-fill.mjs：由 scratchpad 的 fill.cjs 正式化，列出填滿度低於 `--threshold`（預設 0.70）的頁，並依 D5 建議 roomy 等級或 .vc。
- check-density.mjs：移植 density-check.py，邏輯逐條對應。參數為 `--qmd <path>`、選用的 `--tex <path>`、`--words 35`、`--bullets 3`、`--skip-classes notes,hidden,source,sidenote`。
- check-mathjax.mjs：計算 mjx-merror 與 mjx-container。
- export-pdf.mjs：以 ?print-pdf 匯出，頁數等於投影片數。

Playwright 用動態 import；找不到時印出安裝指令並以狀態 1 結束（沿用原腳本行為）。

### D4. 範本以色票變數與元件 class 為介面

- theme/deck.scss 開頭定義 `$deck-primary`、`$deck-accent`、`$deck-green`、`$deck-purple`、`$deck-ink`；所有元件只引用這些變數。換機構只改這五行。
- 元件 class 從 ncku.scss 泛化保留：
  - 區塊：.theorem/.thm-title、.takeaway、.punchline、.algo、.notation、.source、.research/.rlabel、.outline/.onum。
  - 版面：.roomy-1/2/3、.vc、.setting-pair、.fig-row。
  - 頁尾：footer 不透明底與頁尾留白。
- 丟棄只屬於課程或該場演講的 class：.sim-tag、.demo-tag、.gate-*、.shot-*、.op-cue、.sim-embed、.compare-box、.big。
- MathJax 巨集放在第一張內容頁的 hidden 區塊（巨集內不可寫 #hex）。0.3.0 起 Quarto 範本的色彩巨集用 \class 對到樣式表的色票，不再用 \definecolor（D14）。
- beamer 範本用同一組 RGB 與同名巨集（\cB \cO \cG \cP、\takeaway、\sourceline、\algobox、\bibent），標題與 qmd 主體一對一，讓 check-density 的標題對照可用。

### D5. 從審閱回饋泛化的版面規則寫進 academic-slide-design

- **字級**：內文放大上限 1.18 倍，標題與來源行不放大；稀疏頁先考慮加圖，再用 .vc 置中。
- **斷行**：一句一行，不在窄欄裡斷行，寧可改全寬版面；標題一行。
- **清單**：主體一律用圓點，不用 1. 2. 3.（大綱的段落編號除外）。大綱只列段落標題，用大字。
- **灰字**：討論頁不放灰色附註；來源行只放文獻，不放腳本路徑。
- **表格**：只標重點數字與要比較的兩方（顏色加粗體），不整列上色。並排表格要等列高、留間距、不換行。
- **大括號**：標「這一項的意義」，用白話，不用文獻名或「estimated/solved for」這類行話；「怎麼得到」寫在符號表的欄位。一般每式不超過 3 個；分解式例外，每項可各標一個。
- **模擬頁**：不用 A/B/C 字母或色塊；標題寫研究類型；setting 頁重述比較的方法與出處；引子型模擬不放 setting 頁；指標定義放備用頁。
- **研究概覽**：每個研究一頁；個人經歷不上投影片，時間軸放備用頁。
- **內容與來源**：數字對到最終版本（例如提交版論文，而非口試投影片）；投影片上的說法要和來源原文一致；式子已經說清楚的事不再加說明句。
- **講者備註**：目的（含分鐘）／講／操作；分鐘合計等於目標時間減緩衝。

### D6. 回歸測試用成大投影片

check-density.mjs 與原 density-check.py 對同一組 talk.qmd 與 talk-beamer-stats.tex：
- 必須印出相同的每頁字數、條列數；
- 必須給出相同的 max 行與標題對照結果。

check-layout.mjs 在成大 talk.html 上的結果，必須和原 check-overflow.mjs 相同（目前 0 頁）。

### D7. 發布為 PsychQuant private repo

建 repo 前先確認 PsychQuant/academic-slides 不存在。用 `gh repo create PsychQuant/academic-slides --private --source . --push` 推送 main 分支，推送後以 `gh repo view --json visibility` 確認為 PRIVATE。

### D8. 範本只放內容骨架，主題只有一份（issue #8）

- `templates/quarto/_theme/deck.scss` 是唯一的樣式檔；四個範本資料夾（research-talk、short-talk、results-report、lecture）只有 `_quarto.yml` 與 `talk.qmd`。
- scaffold 建立投影片時，每次都從 plugin 複製當下的 `_theme/deck.scss`。範本若自帶 `deck.scss` 或 `_theme/`，印出警告並改用官方主題。理由：#5 的列印修正只改了一份 `deck.scss`；範本若各帶一份主題，同一個修正要改 N 次，而且一定會漏。
- 色票五個變數加上 `!default`，讓排在後面的個人或專案主題可以覆寫。這取決於 Quarto 如何排列主題清單裡各檔的 `scss:defaults`，以 render 測試確認，不靠推論。
- 語言：research-talk、short-talk 寫英文示範，results-report、lecture 寫繁體中文；各範本在 front matter 宣告 `lang`，設定檔可覆寫。

### D9. 三層設定逐欄合併，不是找到第一份就停

- 層次與優先序：專案 > 個人 > 官方（範本自己的 front matter 與 `_quarto.yml`）；命令列的 `--template`、`--title` 最優先。
- 與 `.claude/.idd/local.json` 的差別：IDD 的設定只回答一個問題（issue 開在哪個 repo），最近的一份就決定一切；投影片設定是「個人預設加上專案例外」，找到第一份就停會逼專案設定重抄所有個人欄位。
- 專案層只用最近的一份（同 `.idd` 的往上找），停在家目錄之前，個人資料夾不會被讀兩次。
- 欄位是封閉清單：`template`、`lang`、`author`、`affiliation`、`footer`；值為字串或 `null`，`null` 代表拿掉。未知欄位警告後忽略；型別錯誤或不是 JSON 物件時，在寫入任何檔案之前以狀態 1 停止。
- 主題覆寫：個人與專案的 `theme.scss` 分別複製成 `theme/personal.scss`、`theme/project.scss`，主題清單依序為 `default, _theme/deck.scss, theme/personal.scss, theme/project.scss`（只列存在的）。

### D10. scaffold 腳本的介面

- `node scaffold.mjs --out <資料夾> [--template <名稱>] [--title <標題>] [--dry-run]`；`--list` 列出所有範本與所在層，標示被遮蔽的同名範本；`--help` 印用法。
- 只用 Node 內建模組，沿用 slide-qa 腳本的慣例：狀態 0 成功、1 拒絕（資料夾非空、找不到範本、設定錯誤）、2 用法錯誤。
- 只寫進不存在或空的資料夾；`--dry-run` 印出同樣的解析結果但不寫任何檔案。
- front matter 逐行改寫：範本的 `title`、`author`、`institute`、`lang` 必須各佔一行 `key: value`；值以 JSON 字串寫入（YAML 可讀）。`_quarto.yml` 必須有 `theme:` 與 `footer:` 各一行。
- 範本名稱只接受 `^[a-z0-9][a-z0-9-]*$`，範本內的符號連結略過並警告。
- 安全（依 commit 安全審查補上）：專案層是往上找到的，可能來自別人的 repo，所以信任與否看檔案的來源，不看內容（內容掃描列不完 Quarto 執行程式的寫法：YAML flow 寫法、加引號的鍵、`~~~` fence、profile 檔都能繞過，第一版這樣做被審查指出可以繞過，已撤回）。專案層的範本與 `theme.scss` 必須加 `--trust-project` 才會使用；專案層的 `local.json` 只有純文字欄位，不需要旗標。設定值不得含 `<`、`{`、`[`、`]`、`&`、反斜線、反引號與控制字元（U+0000–U+001F、U+007F）：Quarto 把這些值當 markdown 讀，要擋住 HTML、連結與圖片（打開投影片時會對外連線）、shortcode、屬性與行內程式碼（第三輪審查補上方括號；#8 verify 第 1 輪補上 `&` 與反斜線，因為 Pandoc 會在檢查之後解碼字元參照與反斜線跳脫，`&#123;` 會變回 `{`）。`lang` 必須是語言標籤（Quarto 用它組 `_language-<lang>.yml` 檔名，#8 verify 第 2 輪）。範本檔落在 scaffold 自己要寫的路徑、或只差大小寫或 Unicode 形式的同一路徑上時，寫入前就跳過並警告，不會寫到一半失敗（#8 verify 第 1、2 輪）。從設定層讀的 `local.json`、`theme.scss`、範本的 `talk.qmd`、`_quarto.yml` 不跟隨符號連結，範本資料夾的實際位置必須在該層的 `templates/` 之內，專案設定資料夾必須屬於目前的使用者；系統無法回報擁有者時視為不受信任，整個專案層都需要 `--trust-project`。個人與官方範本不需要旗標。

### D11. 表格三條線

booktabs 的三條線：表頭上方 2px、表頭下方 1.5px、最後一列下方 2px，顏色都是 `$deck-ink`；列與列之間保留 1px 淺灰線（風格選擇）。beamer 鏡像本來就有 `\bottomrule`，這次讓 Quarto 與它一致，並把三條線寫進 academic-slide-design 的表格規則。

### D12. 根目錄的 templates 入口與測試位置

- repo 根目錄放 `templates` 符號連結，指向 `plugins/academic-slides/skills/slide-deck-scaffold/templates`。安裝 plugin 時只複製 `plugins/academic-slides/`，所以連結不影響使用者；README 仍寫出真正的路徑，給不支援符號連結的環境。
- 測試放在 repo 根目錄 `tests/`（不隨 plugin 發布）：`node --test tests/` 跑 scaffold 的單元與命令列測試；`tests/render-templates.sh` 用 Quarto 與 Playwright 實際 render 四個範本並跑檢查。Playwright 以根目錄 `package.json` 的 devDependency 安裝，`node_modules/` 不進 git。

### D13. 主題的預設值全部可以由設定層覆寫（issue #14）

- Quarto 把主題清單各檔的 `scss:defaults` 依「後面的檔先」串接，所以設定層的 `theme/personal.scss`、`theme/project.scss` 先於 `_theme/deck.scss` 編譯。後到的一般賦值會蓋掉先到的值，`!default` 則讓位給先到的值。#8 只給五個色票加 `!default`，其餘八個預設值（`$body-bg`、`$body-color`、`$link-color`、`$presentation-heading-color`、`$font-family-sans-serif`、`$presentation-font-size-root`、`$presentation-heading-font-weight`、`$presentation-h2-font-size`）因此一律蓋掉設定層的值，而且沒有任何警告。實測（Quarto 1.10.19）：個人層設 `"Times New Roman", serif` 與 `30px`，編譯後的 CSS 仍是 Avenir Next 與 28px。
- 決定：`deck.scss` 在 `scss:defaults` 設的每一個變數都加 `!default`。設定層本來就是用來覆寫的，沒有哪一個值需要鎖住；只開放字型會讓字級與顏色留著同樣的靜默失效。
- 設定層的 `scss:defaults` 仍不能引用 `$deck-*`：那段會在 `deck.scss` 定義色票之前編譯，這是 Quarto 的排列方式，主題裡改不了。兩點讓它不再造成問題：`deck.scss` 的衍生值（內文、連結、標題顏色）本來就由色票算出，設定層只改 `$deck-primary`，它們會跟著變；`scss:rules` 在所有檔的 defaults 之後編譯，設定層可以在那裡使用 `$deck-*`。SKILL 寫明這兩點。
- 設定層自己的 `scss:defaults` 也要寫 `!default`（verify 第 1 輪）。主題清單是 `default, _theme/deck.scss, theme/personal.scss, theme/project.scss`，Quarto 把 defaults 倒過來串，專案層最先編譯。設定層用一般賦值時最後的贏，個人層會蓋掉專案層，與 D9「專案 > 個人 > 官方」相反；實測（Quarto 1.10.19）個人 #8b0000、30px 蓋過專案 #006400、24px。設定層也寫 `!default` 時最先設的贏，專案層優先。`scss:rules` 依清單順序串，本來就是專案層在後、優先。不採用：調換清單順序，那會讓 rules 換成個人層優先，只是把問題移到另一邊。
- 頁尾的半透明底由 `$body-bg` 算出（verify 第 1 輪），設定層改底色時頁尾不會留一塊白。

### D14. 公式顏色由樣式表決定（issue #14）

- 原本三個有數學的範本（research-talk、short-talk、lecture）在隱藏區塊裡用 `\definecolor{deckB}{RGB}{31,78,121}` 等四行定義顏色，`\cB` 到 `\cP` 引用這些名稱，等於色票的第二份副本，設定層碰不到。
- 決定：`\cB`、`\cO`、`\cG`、`\cP` 改為 `\class{deck-b}{#1}` 等四個 class（MathJax 的 `html` 擴充，Quarto 載入的 MathJax 會自動載入），`deck.scss` 的 `scss:rules` 給 `.deck-b`、`.deck-o`、`.deck-g`、`.deck-p` 四個色票顏色。色票因此只有一個來源。實測：個人層設 `$deck-primary: #8b0000` 時，`\cB{x}` 渲染為 `rgb(139, 0, 0)`，沒有 `mjx-merror`。
- beamer 鏡像沒有樣式表，保留 `\definecolor`，數值與官方色票相同；設定層的色票到不了 beamer，另由 issue #21 追蹤。
- 不採用：scaffold 讀設定層的 SCSS、改寫 `\definecolor` 的 RGB。那會留下兩份色票，而 SCSS 的值不一定是十六進位字面值（可以是函式或顏色名稱）。

### D15. `.vc` 頁上的表格用固定的上下邊距（issue #14）

- reveal 給表格 `margin: auto` 讓它水平置中；在 `.vc` 頁的 flex 欄裡，這個 auto 的上下邊距也會分走置中用的空白。#8 的 `section.vc > table { margin-bottom: 0 }` 只拿掉下邊距，套在每一張直屬的表格上：「導言、表格、出處」的頁上，表格的 auto 上邊距仍分走空白（空白移到表格上方），出處貼著表格（實測 6 px，results-report 的兩張頁）。
- 只把那條規則收窄到「唯一的表格」也不對：實測出處會飄到表格下方 86–101 px，因為表格的 auto 上下邊距仍在分空白。
- 決定：`.vc` 頁上的表格改用固定的上下邊距（0.5em），左右仍是 auto（水平置中不變）；緊接在標題、隱藏巨集區塊或講者備註後面的表格保留 auto 上邊距，由它把內文推到中間。導言、表格、出處因此是一個整塊置中，出處在表格下方約 19 px；只有一張表格的頁照樣置中。
- 更正（verify 第 1 輪）：results-report 的兩張頁其實是「標題、表格、出處」，沒有導言；第一版說它們是「導言、表格、出處」是錯的，`.5em` 那條規則當時沒有被 render 測到。render 測試另加固定頁面：一張「導言、表格、出處」（`--source-gap 12-40`），一張「講者備註寫在表格前」的單一表格（`--vc-centred`；修正前上方 31 px、下方 445 px，沒有置中）。results-report 本身的 `--source-gap 12-40` 保留。

### D16. Implementation Contract 描述實際的 render 檢查（issue #14）

#8 之後範本資料夾沒有自己的主題（`_theme/` 在上一層，由 scaffold 複製），把範本資料夾複製一份就地 render 已不成立。`tests/render-templates.sh` 的做法是先用 scaffold 從每個範本建立投影片，再 render 那份投影片。契約改寫成這個流程，範本資料夾不改成可以原地 render。

### D17. 投影片顯示成一張 16:9 的紙（issue #23）

- revealjs 把 1280×720 的畫布縮放進視窗、`$body-bg` 鋪滿整個視窗，螢幕上看不出投影片的邊界；內容從畫布的 x = 0 開始，唯一的留白是畫布外 0.1 的 margin，顏色又和投影片一樣。手刻的 1920×1080 deck 左右各留約 150 px（7.8 %）、上方約 88 px。
- 決定：紙＝投影片 ×(1 + margin)，margin 用 revealjs 自己的設定（範本 0.18）。寬高同比例放大，所以紙仍是 16:9、四邊各約 7.6 %；revealjs 印 PDF 時每頁本來就是投影片 ×(1 + margin)，所以螢幕與 PDF 的留白相同，只有一個設定。內容區仍是 1280×720，頁高與字級的量測與既有 deck 一致。紙在螢幕上的佔比是 (1 − m)(1 + m) = 1 − m²，永遠放得進視窗。
- 不採用：把留白做成 section 的 padding。那會縮小內容區，每份既有 deck 的頁高預算都要重算，且 `.vc`、print 的高度規則都要跟著改。
- 頁尾、頁碼、選單鈕原本貼著視窗；`_theme/frame.html` 依 margin 算出紙的範圍，把它們放進紙底留白、對齊內容區左右緣。列印模式看網址的 `?print-pdf`（revealjs 自己也這樣判斷）：revealjs 先觸發 ready 才加 `print-pdf` class，只看 class 會晚一步把頁尾推出頁底，Chrome 列印時每頁重複 `position: fixed` 元素，頁尾就落到下一頁頂端（實測）。
- 頁尾不再在投影片上，`.vc` 底部為它保留的 64 px 改回與一般頁相同的 1.1em。

### D18. 自寫封面 `{.cover}`（issue #23）

Quarto 的標題頁由 front matter 產生，放不進版本行或下載鈕；要放這些東西的 deck 只能自寫第一張，原本被當成內容頁貼頂、下半頁空白。`{.cover}` 讓整塊垂直置中、靠左，`[..]{.eyebrow}` 寫在標題後也移到標題上方，標題字級是 `$deck-cover-title-size`。Quarto 的標題頁不變。

### D19. slide-qa 在紙面版型下的量法（issue #23）

`check-layout.mjs` 的頁尾帶像素檢查原本拿視窗 x = 8 當背景色參考；視窗外圈有自己的顏色之後，每一頁都被誤報（實測 16/16 頁）。參考點改取投影片左緣外 14 px，有紙時落在紙的留白、沒有紙時是投影片底色。頁尾移到紙底之後，「內容壓到頁尾」會變寬鬆，所以螢幕上的界線改為頁尾頂端與投影片下緣取較高者；`style-probe --vc-centred` 同樣處理。

### D20. deck 主檔依內容命名：scaffold 必填 `--name`（issue #44）

scaffold 原本把主檔固定寫成 `talk.qmd`，課堂講義、結果報告也叫 talk，跨場合的 deck 在下載資料夾與附件裡同名。`scaffold.mjs` 改為必填 `--name <stem>`，以範本的 `talk.qmd` 寫出 `<stem>.qmd`；寫出的 `_quarto.yml` 裡 `project.render` 列出 `talk.qmd` 的那一項換成 `<stem>.qmd`，沒有這一項的自訂範本照原樣寫出（Quarto 會 render 資料夾裡唯一的 `.qmd`）。改寫限在 `project:` 直接底下的 `render`，只換「整個值就是 `talk.qmd`」的項目（有沒有引號、`./` 前綴都算；區塊清單、行內清單、跨行的行內清單、單一值都處理）；只是含有 `talk.qmd` 的值（`"my talk.qmd"`）、註解、`project` 更深一層的 `render`、列在別處（例如 `resources`）的 `talk.qmd` 都不動。最上層或 `format: revealjs:` 底下的 `output-file: talk` 或 `talk.html` 換成 `<stem>` 或 `<stem>.html`；其他 format 的 `output-file` 不動。改寫後若還看得到 `talk.qmd`，印出警告。

- 沒給 `--name` 時以狀態 2 結束、什麼都不寫，訊息要 agent 依內容取名、推不出唯一名稱時問使用者。不採「預設用 `--out` 資料夾名」：資料夾叫 `slides` 或 `my-talk` 時會安靜地產生不反映內容的檔名，等於換一個預設，而腳本本身無法問人。
- 名稱照使用者給的寫法，不做正規化：任何文字的字母（含中文）、數字、`_`（開頭也可以：Quarto 只要 render 清單列了就會 render，已實測）、`-`、`+ ( ) @`、全形括號 `（ ）`、中黑點 `・ ·`，以及名稱中間的 `.`；名稱帶 `.qmd` 結尾時視同沒帶；YAML 或 shell 有特殊意義的字元（`# , [ ] { } & * ! | > ' %` 與反引號）不在其中，名稱寫進 `_quarto.yml` 不會改變結構；只擋不安全或不可攜的字元：空白、路徑分隔、開頭的 `-` 或 `.`、結尾的 `.`、控制字元、`: * ? " < > |`，Windows 的裝置名稱（`CON`、`NUL`、`COM1`、`COM¹` 等，帶副檔名也保留），以及超過 200 bytes 的名稱。這是一份允許清單，不是禁止清單：清單外的字元（例如 `&`、`=`、emoji）都會被拒，錯誤訊息點名被拒的字元。第 2 版曾先做 NFC 正規化，verify 第 2 輪指出那會改掉使用者給的名稱，已移除。Supersedes：本決策第 1 版沿用範本名稱的 `^[a-z0-9][a-z0-9-]*$`，那是 agent 在 unattended discuss 中自行決定的；verify 第 1 輪實測中文、底線檔名經 render、check-*、export-pdf、handout 全部可用，並指出它收窄了使用者「不強制格式」的決定，使用者 2026-10-31 改定為只擋不安全的字元。使用者給的名稱被拒時，SKILL 要求 agent 把修正後的名稱給使用者確認。
- 取名程序寫在 slide-deck-scaffold `SKILL.md`：使用者明說的名稱 → 從標題、場合或課程推得出、而且只有一種寫法的名稱 → 否則問使用者（使用者 2026-10-31 定案）。判斷名稱是否反映內容是 agent 的工作，腳本只驗證與拒絕。
- 用完成的 deck 複製成範本時，範本頂層的 `talk.html`、`talk.pdf`，本 plugin 工具產生的衍生檔（`talk-notes`、`talk-dual`、`talk-presenter-notes`、`talk-handout…`、`talk-script…` 的 `.pdf`／`.html`），以及資料夾 `talk_files/`、slide-qa 的 `qa/`、Quarto 的 `.quarto/` 都是產物，不複製（印出警告）；其他叫 `talk-…` 的檔（例如 `talk-background.pdf`）是範本內容，照常複製；否則它們會和新的 `<stem>.html` 並存，讓 slide-qa 找檔失準。
- 範本來源檔名不改：`templates/quarto/<name>/talk.qmd` 與 `templates/beamer/talk.tex` 是範本內部的名字，使用者看不到；個人與專案層的自訂範本依 spec 也必須有 `talk.qmd`，改名會讓它們失效。beamer 鏡像複製進 deck 時改叫 `beamer/<stem>.tex`。
- 在範圍內：`scaffold.mjs`、四個範本 `_quarto.yml` 的註解、`tests/scaffold.test.mjs`、`tests/render-templates.sh`、兩份 SKILL 與 README 的指令範例。不在範圍內：既有 deck 的改名工具（使用者定案不做）、scaffold 自動複製 beamer 檔。

### D21. slide-qa 沒給檔名時讀 deck 自己的檔案（issue #44）

六支腳本原本沒給檔名時讀 `talk.*`：check-density 的 `--qmd`；check-fill、check-layout、check-mathjax、export-pdf 的 `--html`；handout 的 `--pdf`。改由 `_lib.mjs` 的 `findDeckFile`（選檔邏輯在 `chooseDeckFile`）決定，只看目前資料夾、不往子資料夾找。取代 D3 的「`--html` 預設 ./talk.html」。

- 先定出 deck 的主檔：`_quarto.yml` 的 `project.render`（`project` 直接底下的鍵，只取完整的值）在這個資料夾裡指名的唯一 `.qmd`；不是剛好一個時，改用資料夾裡唯一的 `.qmd`。從 `_quarto.yml` 讀到的值只接受單純的檔名：含資料夾、`..`、絕對路徑或萬用字元的一律忽略，所以找檔不會離開目前資料夾。定得出來時，讀與主檔同名的那個檔（`format: revealjs:` 底下的 `output-file`，沒有的話是最上層的，與在檔案中的先後無關；有設、且是單純檔名時，`.html` 用它，不以 `.html` 結尾就補上，和 Quarto 一樣；`.pdf` 跟著 `.html` 的名字）：資料夾裡同時有 `talk.pdf`、`talk-notes.pdf`、`talk-dual.pdf` 時讀 `talk.pdf`。那個檔不存在時以狀態 2 結束、說明缺哪個檔並列出找到的其他檔，不改讀別的。
- 主檔定不出來時（例如只放 PDF 的資料夾），才用資料夾裡唯一的那個檔；handout 在這一步排除自己產生的 `*-handout.pdf`。沒有或不只一個時以狀態 2 結束，列出資料夾與所有候選。
- Supersedes：本決策第 1 版是「資料夾裡唯一的檔案，不只一個就報錯」（使用者 2026-10-31 的 Clarity 決定）。verify 第 1 輪重建既有 deck 的檔名結構，發現 deck 資料夾通常同時有衍生 PDF（`talk-notes.pdf`、`talk-dual.pdf` 等，#36、#38 還會再加），handout 不帶參數 5/5 失敗，與「既有 deck 照常可用」衝突；使用者 2026-10-31 改定為先挑主檔同名的檔案。兩種做法都不會退回 `talk` 這個固定預設。
- 只讀範本那種區塊寫法的 `_quarto.yml`；行內 mapping、加引號的鍵、anchor、值裡的逗號等寫法讀不到，這時要明確給檔名參數，完整解析追蹤於 #46（D23：讀不懂時拒絕猜）。
- 副檔名大小寫完全相符（伺服器只把小寫 `.html` 當 HTML 提供）；錯誤訊息裡的檔名把控制字元換成 `?`。
- 給了 `--html`、`--qmd` 卻沒有檔名（放在最後，或後面接著另一個選項）時以狀態 2 結束，不改為自動找檔；handout 的 `--pdf` 依它在 #34 訂下的規則以 1 結束。其他帶值選項缺值的處理不在這次範圍，追蹤於 #45（已由 D22 處理）。
- 明確給的參數照舊優先；check-density 的 `--tex` 本來就沒有預設值，維持要明確指定。檔名叫 `talk.*` 的既有 deck 同樣適用。
- 在範圍內：`_lib.mjs`、六支腳本與它們的說明文字、slide-qa `SKILL.md` 與 `references/fix-table.md`。

### D22. 檢查腳本宣告自己的選項，讀不懂就以狀態 2 結束（issue #45）

check-density、check-fill、check-layout、check-mathjax、export-pdf 原本把「下一個參數」當成選項的值，沒有任何地方知道哪些選項存在：帶值選項放在最後得到 `undefined`，後面接另一個選項就把它當成值，數值不是數字得到 `NaN`，打錯的選項名被忽略。`NaN` 門檻讓 `fill < NaN`、`words > NaN` 永遠為假，檢查在使用者以為設了門檻時靜默通過（check-fill 印出「fills at least NaN」並以 0 結束）。

- 每支腳本以 `_lib.mjs` 的 `options(help, spec)` 宣告選項，`spec` 標出每個選項的種類：`file`（檔名，缺值時沿用 #44 的「needs a file name」）、`text`、`list`（逗號分隔，可以是空字串，表示不略過任何 class 或 macro）、`flag`，或數值規則 `{ min, max, integer }`。`parseOptions` 依序讀參數，下列情況以狀態 2 結束並點名選項，而且在找 deck 檔、載入 Playwright 之前回報：帶值選項缺值（放最後，或下一個參數以 `--` 開頭）；空值（`list` 除外）；數值不是數字或超出範圍；不認得的選項（含 `--threshold=0.7` 的寫法）；不屬於任何選項的參數（例如漏寫 `--html` 直接給檔名）；同一個選項給兩次。
- 數值範圍：`--threshold` 0 到 1（0 等於不標任何頁，仍接受）；`--width`、`--height` 至少 1 的整數；`--words`、`--bullets` 至少 0 的整數（上限 0 是合法的設定）。
- 以單一 `-` 開頭的值（`--width -5`）當作值讀，再由範圍檢查拒絕；以 `--` 開頭的一律當作下一個選項。`--help`、`-h` 出現在任何位置都印出用法並以 0 結束，與先前相同。
- handout 不改：它在 #34 已經用同樣的方式檢查自己的選項，錯誤以 1 結束。`args()` 保留給 handout 與測試用的探針。
- 使用者 2026-11-01 定案「全部比照 handout」：缺值、不是數字的數值、不認得的選項都擋。不屬於任何選項的參數在 diagnose 時一併列入；重複的選項是實作時依同一個讀參數的迴圈加進來的，理由同樣是「不猜」：先前取第一個值，使用者可能以為生效的是後一個。
- 在範圍內：`_lib.mjs`、五支腳本與它們的說明文字、slide-qa `SKILL.md`、`tests/options.test.mjs`。scaffold 的同類問題開為 #49。
- verify 第 1 輪之後：Devil's Advocate 指出「拒絕重複選項」不是使用者定的，使用者 2026-11-01 改定為「拒絕，三處一致」：slide-qa 檢查腳本、scaffold（#52）、handout 都拒絕同一個選項給兩次，handout 依 #34 以 1 結束。另外：只有空白的值算缺值；`--threshold=0.5` 的訊息改為請使用者用空格隔開；空字串參數在訊息裡印成 `""`；各腳本的 `--help` 寫出全部的狀態 2 情形，含 Quarto 設定讀不懂。

### D23. 讀不懂的 Quarto 設定寫法：拒絕猜，不解析（issue #46）

slide-qa 的 `readQuartoYml` 與 scaffold 的 `renameRenderTarget` 是兩支逐行掃描器，只認範本那種區塊寫法。行內 mapping、加引號的鍵、冒號前有空白的鍵、anchor、alias、merge key、值裡的逗號與跳脫都是合法 YAML，卻會讓 slide-qa 退回資料夾裡唯一的候選（可能是比真正輸出舊的檔），也會讓 scaffold 寫出 render 仍指向 `talk.qmd` 的 deck，只印一行警告。

- 使用者 2026-11-01 定案：認不出就拒絕猜，維持只用 Node 內建模組（D10 不變）。不採 `quarto inspect`：實測讀得對，但每次多約 1.5 秒，而且 scaffold 要改寫文字，用不上它。不加 YAML 套件：要改 D10，scaffold 解析後再寫回會丟掉範本的註解與排版。
- `unreadQuartoLines(yml)` 以和掃描器相同的縮排狀態，列出寫法超出掃描器的行（行號與原文）：
  - 行首的 flow mapping 或 flow sequence（含 JSON 寫法 `{"project":{…}}`；加引號的鍵後面緊接冒號也算鍵）、顯式鍵（`? key`）、第二份 YAML 文件（開頭以外的 `---`、`...`）、任何地方的 merge key（`<<`）。
  - `project`、`format`、`revealjs`、`render`、`output-file`、`metadata-files` 加了引號、冒號前有空白、位在行內 mapping 裡或列表破折號之後。
  - 最上層的 `project`、`format` 與 `format` 底下的 `revealjs`，值是 flow mapping、anchor、alias、tag 或 block scalar（空的 `{}` 可以；其他鍵底下同名的 `format: {…}` 不算）。
  - `project.render` 裡：開頭的 flow mapping 或 block scalar，anchor（`&a`）、alias（`*a`）、tag（`!t`）（`Q & A.qmd` 這種前後有空白的 `&` 不算），跳脫，以及含逗號的值：引號內的逗號，與 flow list 以外沒加引號的逗號（`- my, talk.qmd` 在 YAML 是一個值，掃描器卻依逗號切成兩個；issue #46 點名的寫法）。
  - 掃描器採用的 `output-file`：anchor、alias、tag、flow 值、跳脫（`"a\"b"`、`'it''s'`）。`output-file` 是單一值，掃描器整個讀進來，引號內的逗號不影響。
  - block scalar（`|`、`>`）的內容是文字不是設定，偵測器與兩支掃描器都略過它。掃描器刻意不採用的區塊寫法（其他 format 的 `output-file`、更深一層的 `render`、`pre-render`、`post-render`）、引號值裡像鍵的文字、註解，都不算。
  - slide-qa 的 `_lib.mjs` 與 scaffold 各有一份相同的函式（沿用兩邊各有一份 `splitComment` 的做法，兩個 skill 不互相 import），測試檢查兩份對每種寫法的結果一致。
- `metadata-files`：Quarto 把它列的檔合併進設定。依 #46 的 Diagnosis，讀它列的檔，其中設了 `render` 或 `output-file`（或再用 `metadata-files`、merge key）才拒絕；列的不是同一資料夾裡的單純檔名、檔案不存在，或清單不是 flow list、區塊清單、單一值這三種寫法，也拒絕。第 1 版一律拒絕，verify 第 1 輪指出它比 Diagnosis 寬，並擋下 0.7.0 能用的 deck（例如用 `metadata-files` 放作者或書目資料）。
- slide-qa：設定檔照 Quarto 的做法取 `_quarto.yml`，沒有時取 `_quarto.yaml`（實測兩者都在時 Quarto 用 `_quarto.yml`）。設定檔有讀不懂的行，`metadata-files` 列的檔如上，或資料夾裡的 profile 檔 `_quarto-<name>.yml`（不分大小寫，macOS 上 Quarto 也會載入 `_QUARTO-p.yml`）以任何寫法設了 `render` 或 `output-file`，或用了 `metadata-files`、merge key（引號內的文字與 block scalar 不算；Quarto 只在那個 profile 啟用時合併它，腳本無從得知 render 時用了哪個；沒有設定檔時 Quarto 不用 profile，這時不檢查），沒給檔名參數的腳本以狀態 2 結束，列出檔名、行號與原文（最多三筆），請使用者給檔名參數，或把 `project.render` 與 `output-file` 以區塊寫法寫在設定檔本身；給了檔名參數就照用，不讀設定。設定檔是符號連結時照舊跟隨讀取（與 0.7.0 相同），但拒絕訊息只列檔名與行號、不印內容，免得把資料夾外檔案的內容印出來（verify 第 1 輪 security）。
- scaffold：範本的 `_quarto.yml` 有讀不懂的行；`metadata-files` 列的檔不在範本資料夾裡，或設了 `render`、`output-file`；或範本裡的 profile 檔設了（或可能間接設了）它們（這些檔照原樣複製，改寫不到）：在寫入任何東西之前以狀態 1 結束，列出檔名與行號，印出的文字把控制字元（含 DEL 與 C1）換成 `?`。D20 的殘留警告保留給區塊寫法裡改寫不到的 `talk.qmd`（例如列在 `resources` 底下）。
- 來源：profile 檔與 `metadata-files` 是 diagnose #46 時發現的同類來源（寫在 Diagnosis）。`_quarto.yaml` 是實作時實測 Quarto 的選檔順序後加入的，Diagnosis 沒有列，使用者也沒有另外決定；它只讓 deck 多一種讀得到的設定檔。
- 不涵蓋（開為 #50，見 D24）：`clean-revealjs` 這類擴充格式的 `output-file`、`.qmd` front matter 的 `output-file`、`_metadata.yml`、`project: output-dir`、`output-ext`。
- 在範圍內：`_lib.mjs`、`scaffold.mjs`、兩份 SKILL.md、`tests/quarto-settings.test.mjs`。
- verify 第 1 輪 Devil's Advocate 之後：
  - 偵測器原本是黑名單，與 Diagnosis 說的「認得的才算」不符，而且偵測器、掃描器、profile 檢查各有一套判斷。改為一個 `scanSettings` 掃過每一行並標上種類（讀不懂、render、掃描器採用的 output-file、metadata-files、其他輸出名稱來源），設定檔、profile 檔、`metadata-files` 列的檔都用它判斷，profile 檔裡 `format: pdf: output-file` 不再被擋。
  - 跨行的值（純量或沒關上的引號）在 YAML 是一個值，掃描器卻讀成兩個，一律拒絕：render 的區塊清單項目、單一值與 `output-file` 都是。
  - 檔案開頭的 UTF-8 BOM 先去掉再讀（原本第一行的區塊寫法會被誤擋，scaffold 也是）。
  - 新增 oracle 測試：`tests/fixtures/make-quarto-oracle.py` 用 PyYAML 算出每個案例的 render 與 output-file，寫成 `quarto-settings-oracle.json`；測試要求偵測器接受的設定，掃描器讀出的結果與 PyYAML 相同，讀錯的案例必須被拒。執行期仍只用 Node 內建模組（D10 不變），產生器只在案例改變時手動執行。
- verify 第 2 輪（Codex）之後：
  - 讀不懂的行分成兩類：牽涉 deck 由哪些檔組成的（`project`、`render`、`metadata-files`、merge key、文件結構）每種查找都拒絕；只牽涉輸出檔名的（`format`、`revealjs`、`output-file`、`output-ext`、`output-dir`）只在找 `.html`、`.pdf` 時拒絕。原本加引號的 `"output-ext":` 會連 check-density 都擋，裸鍵卻不會。
  - 一行內關得起來、沒提到掃描器會讀的鍵的 flow mapping（`format: {pdf: default}`、`project: {type: default}`）照讀，設定檔與 profile 檔都是；跨行的 flow mapping 仍然拒絕。
  - 文件結尾 `...` 本身合法；之後還有內容，或內容之後出現 `---`，才算第二份文件。
  - verify 第 2 輪的對抗式審查又找到幾種讀錯又放行的寫法，一律改成拒絕：跨行 render flow list 裡沒有逗號隔開的續行（YAML 把兩行接成一個值）、縮排沒超過 `render:` 的 flow 續行、`revealjs:` 底下更深一層的 `output-file`（Quarto 不採用）、`output-file: ~` 或空值。帶 anchor 或 tag 的 block scalar（`notes: &n |`）原本沒被認出來，內容被當成設定讀；現在和其他 block scalar 一樣當文字略過，不是拒絕。
  - verify 第 3 輪：flow list 裡逗號寫在下一行開頭（`, b.qmd`）是合法的兩個項目，照讀，不再誤擋；PyYAML oracle 加了這個案例。
  - 限制（照實寫明）：oracle 測試只保證 fixture 裡列出的案例被讀對或被拒；讀取器、scaffold 的改寫器與偵測器仍是各自維護的狀態機，這不是對所有 YAML 寫法的證明。新發現的寫法要加進 `make-quarto-oracle.py` 的案例。

### D24. 其他決定輸出檔名的來源：找 `.html`、`.pdf` 時拒絕猜（issue #50）

D23 只讀 `project.render` 與 `format: revealjs:`（或最上層）的 `output-file`。issue #50 列出 Quarto 另外五個決定輸出檔名的地方（verify 第 2 輪又找到兩個，見本節最後一點）：擴充格式（例如 `clean-revealjs:`）自己的 `output-file`、主 `.qmd` front matter 的 `output-file` 或 `output-ext`、資料夾裡的 `_metadata.yml`（或 `.yaml`）、`project: output-dir`、`_quarto.yml` 的 `output-ext`。原本這些都不讀也不拒，腳本去找 `<stem>.html`，可能是比真正輸出舊的檔。

- 決定：沿用使用者在 #46 的決定（2026-11-01：認不出就拒絕猜，只用 Node 內建模組），五個來源一律拒絕，不新增讀法：沒給檔名參數時以狀態 2 結束，列出檔名與行號。
- 它們只改變 `.html`（以及跟著它的 `.pdf`）的名字，所以只在需要輸出檔名的查找（check-fill、check-layout、check-mathjax、export-pdf 的 `.html`，handout 的 `.pdf`）才拒絕；check-density 找 `.qmd` 不受影響。
- front matter 與 `_metadata.yml` 只看會決定輸出檔名的設定：掃描器會讀的 `output-file`、擴充格式的 `output-file`、`output-ext`，不論寫法（加引號的鍵也算），以及可能間接帶進它們的 `metadata-files` 與 merge key（verify 第 2 輪）；`format: pdf: output-file` 這類其他格式的設定不算，免得誤擋常見寫法。
- scaffold 照原樣複製範本的 front matter；自訂範本若在那裡設了 `output-file`，deck 會以那個名字 render。官方範本沒有，記在 #50 的 Diagnosis，不另開 issue。
- verify 第 2 輪（對抗式審查）之後：
  - `project.type` 不是 `default` 時也拒絕：website、book、manuscript 不寫 `output-dir` 也會輸出到 `_site/`、`_book/`、`_manuscript/`。本機實測 9 個 Quarto book 與 website 資料夾，找 `.html` 全部被擋、找 `.qmd` 都照常。
  - front matter 前面有空白行、文件後面另一段 YAML 區塊也會改輸出檔名，所以都檢查（第 3 輪改照 Quarto 的規則找區塊，見下）。
  - `output-ext` 只看最上層與 revealjs 格式底下；`format: pdf: output-ext: tex` 不改 `.html` 的名字，不擋。
  - scaffold 的範本檢查不再拒絕只改輸出位置或副檔名的設定（擴充格式的 `output-file`、`output-ext`、`output-dir`、project type）：改名照常生效，main 與 #50 之前都接受這種範本，拒絕它是 #50 帶進來的回歸。
  - deck 放在上層 Quarto 專案的子資料夾時，上層的 `_quarto.yml` 與 `_metadata.yml` 也會影響輸出，這裡不讀也不拒，由 #54 追蹤。
- verify 第 3 輪（Codex）之後：
  - project type 不論寫法都看：一行內的 flow mapping（`project: {type: website}`）、加引號的鍵、冒號前有空白；`type: "default"` 加引號、`type: ~` 都算 default。
  - 雙引號鍵裡有跳脫字元（`"ren\u0064er"`）可以拼出任何鍵，一律拒絕。
  - 決定輸出檔名的是 Quarto 自己讀 metadata 的方式（`readYamlFromMarkdown`），不是 Pandoc 的規則（對抗式審查以 Quarto 1.10.19 實測）。所以照它的規則找區塊：先去掉 HTML 註解與反引號 fenced code，之後每個行首的 `---` 只要下一行不是空行，就讀到下一個 `---` 或 `...` 行；前一行不必是空行，第一行也不必是 ASCII 鍵；`~~~` 圍起來的內容 Quarto 照讀，這裡也讀；以空行開頭的區塊略過。Quarto 會逐段 parse，不是 YAML 的區塊會讓 render 失敗，所以照讀不會擋到能 render 的 deck。註解與 fence 改用逐行掃描找，保留每一行在原檔的行號；Quarto 的 regex 碰到大量沒結尾的註解或 fence 是平方時間，不適合用在別處來的資料夾（#51）。本機 67 個含 `.qmd` 的資料夾新舊版結果完全相同。
  - 其他格式（`pdf`、`docx`）底下的 `output-file`、`output-ext`，加引號也不算。
  - 讀不懂的輸出設定分兩種：只改輸出位置或副檔名的（`output-dir`、`output-ext`、project type），找 `.html`、`.pdf` 時拒絕，scaffold 接受，不論寫法，和裸寫的鍵一致；scaffold 要改寫的（`format`、`revealjs`、`output-file`），scaffold 照舊拒絕。

### D25. 從別處來的資料夾：印出的文字與 render 值的 trim（issue #51）

- slide-qa 的 `printable` 另外把雙向控制字元（U+061C、U+200E、U+200F、U+202A–U+202E、U+2066–U+2069）換成 `?`，並用在既有的 `HTML not found`、`qmd not found`、`tex not found` 訊息。
- scaffold 印出的所有文字經過 `screen()`：逐行套用同樣的替換，多行訊息保留換行。`show()`（`JSON.stringify`）也用來寫 YAML 值，所以不改它。
- `readQuartoYml` 去掉 render 值兩端的括號與空白，改用線性的迴圈；原本的 regex 遇到一長串空白會回溯，15 萬字元要 18 秒。
- verify 第 2 輪之後：check-density 從資料夾找到的檔名、各腳本報表裡的投影片標題與 MathJax 錯誤原文、handout 與 export-pdf 的「✓ wrote」也經過 `printable`。替換的只有控制字元與雙向控制字元，中英日文字照原樣印出。scaffold 在 warning 與錯誤訊息裡印的檔名先經過 `printable`，名字裡的換行也換掉，不能偽造一行 `warning:`。第 3 輪起 handout 也一樣：命令列的值、檔名、標題在放進訊息時先經過 `printable`；scaffold 的 `--list`、`Dry run`、`Wrote` 行裡的資料夾路徑也是。

### D26. scaffold 的選項規則比照 slide-qa 檢查腳本（issue #52）

- `--help` 或 `-h` 出現在任何位置都印出用法並以 0 結束（`--out -h` 不再建出名為 `-h` 的資料夾）；同一個選項（含旗標）給兩次、帶值選項放最後、後面接另一個選項（#49）、值只有空白，都以狀態 2 結束並點名選項，什麼都不寫。
- 重複選項的拒絕依使用者 2026-11-01 的決定（見 D22）。
- `--旗標=值`（`--shots=1`、`--dry-run=1`、`--landscape=1`）在檢查腳本、scaffold、handout 都回「不接受值」；帶值選項寫成 `--x=值`，三處都提示改用空格（verify 第 3 輪）。

### D27. 從完成的 deck 複製成的範本帶著原 deck 的名字：寫入前拒絕（issue #53）

用完成的 deck（例如 `w07`）複製成範本時，有三處會帶著原 deck 的名字。scaffold 原本只改名 `talk.qmd` 與 `output-file: talk`，其餘照抄，#44 的警告也只找 `talk`：

- `project.render` 的 `- "w07.qmd"`：Quarto 1.10.19 實測，`quarto render` 對不存在的 render 檔什麼都不輸出，也以 0 結束；
- `_quarto.yml` 的 `output-file: w07`：新的 `w08.qmd` 輸出成 `w07.html`；
- `talk.qmd` front matter 的 `output-file`：同上（#50 的 residue）。

- 決定：預設，沿用使用者在 #46 的決定，認不出就拒絕猜。改寫之後、寫入任何東西之前以狀態 1 拒絕，點名範本的檔案與行號；不猜哪一項是原 deck 的主檔再改名。
- render：每個不含 glob 字元的值，必須是 deck 的主檔，或範本裡實際有的檔或資料夾（比對用 `pathKey`，大小寫與 Unicode 形式的差異不算不同）。`..` 或絕對路徑指到新 deck 外面，也拒絕。
- `output-file`：決定 `.html` 名字的那幾處（最上層、`format: revealjs:`、名稱以 `-revealjs` 結尾的擴充格式）。`talk`、`talk.html` 改成 deck 的名字（擴充格式這次一併改名），其他值拒絕。其他格式（`pdf`、`docx`）不動。自訂範本若把它固定成某個名字，也會被拒；這和 D20「deck 主檔依內容命名」相衝，訊息說明可改成 `talk`。
- `talk.qmd` 照 Quarto 的規則找 YAML 區塊（與 slide-qa 同一份 `metadataBlocks`）：決定 `.html` 名字的 `output-file`（最上層、revealjs、擴充格式底下）不論寫法都拒絕，其他格式底下的不動，`metadata-files` 與 merge key 也拒絕；scaffold 只改寫 `_quarto.yml`，和 profile 檔同一個原則。`output-ext` 只改副檔名、不帶舊名，照收，和 `_quarto.yml` 的 `output-ext` 一致；這收窄了 #53 範圍擴充 comment 的「警告（或拒絕）」。
- verify 第 1 輪（Codex）之後：
  - `..` 與絕對路徑先檢查，glob 也算（`"../*.qmd"` 原本被當成 glob 放行）；訊息改說「指到新 deck 外」，不再說 Quarto 什麼都不輸出。
  - `talk.qmd` 開頭的 BOM 先去掉再找 YAML 區塊，和 slide-qa 一致；`rewriteFrontMatter` 也先去掉它，原本帶 BOM 的 `talk.qmd` 會被誤報成「開頭沒有 front matter」。
  - profile 檔與 `metadata-files` 列的檔原樣複製，所以裡面擴充格式的 `output-file` 也拒絕，和 revealjs 底下的一樣；verify 第 2 輪只把改輸出位置或副檔名的設定（`output-dir`、`output-ext`、project type）當成可接受，這裡把原本混在一起的擴充格式 `output-file` 分出來。
- verify 第 1 輪（對抗式審查）之後：
  - `output-file: talk   # 註解`：比對前先去掉同一行的註解；原本會誤擋，訊息還要使用者改成本來就寫好的 `output-file: talk`（回歸，main 原本接受）。
  - 行號一律是範本的：檢查改在「只做改名」的範本文字上跑；個人或專案設定刪掉或加上 footer 那一行時，寫出的檔案行數會變。
  - 範本裡 `talk.qmd` 旁邊的 `_metadata.yml`／`_metadata.yaml` 也原樣複製，比照 profile 檔判斷：Quarto 實測會以裡面的 `output-file` 輸出（預設，沿用本 issue「範本帶著原 deck 的名字就拒絕」的原則；審查者請使用者決定範圍，這裡先取這個預設，PR 審閱時可推翻）。
  - render 清單既沒有主檔、也沒有 `.` 或 glob 時拒絕：主檔永遠不會被 render（原 deck 的 `.qmd` 還留在範本裡時就會這樣）。
  - render 值照 Quarto 的讀法先正規化：`.`、路徑中的 `./`、`//` 照收；verify 第 2 輪起，回到 deck 資料夾本身的路徑（`chapters/../`）也算 `.`。
  - 空的 render 清單（`render: []`）也拒絕：Quarto 1.10.19 實測什麼都不輸出，並以 0 結束（verify 第 2 輪）。
  - 帶舊名的 glob（`w07*.qmd`）照收：scaffold 不比對 glob，這是刻意的限制。
- 實作：`readQuartoYml`（連同 `trimList`、`unquote`）與 `metadataBlocks` 移進 `_lib.mjs` 與 `scaffold.mjs` 逐字相同的偵測器區塊。`readQuartoYml` 與保留行號的 `renderEntries` 都由同一個 `readSettingsValues` 組成，兩邊只有一份讀法；測試比對兩份 `readQuartoYml` 的結果，也比對兩份偵測器區塊的原始碼（只差互相指引的那一行）。slide-qa 的行為不變。

## Implementation Contract

**Behavior：**
- `claude plugin validate --strict plugins/academic-slides` 與 `claude plugin validate --strict .`（marketplace）都通過。
- 用 `scaffold.mjs --name <名稱>` 從每個範本建立投影片、在該資料夾執行 `quarto render`（`tests/render-templates.sh`，D16、D20），產生 `<名稱>.html`；check-layout、check-density、check-mathjax 都以狀態 0 結束；以 XeLaTeX 編譯 beamer 範本，0 error、0 overfull，check-density 印出「N/N titles match」。
- slide-qa 腳本不帶檔名參數時讀 deck 自己的檔案；有衍生 PDF 的既有 talk deck 照常執行；分不出來或缺檔時以狀態 2 結束並列出候選（D21）。
- 在成大投影片上，check-density.mjs 的輸出與 density-check.py 逐行相同（D6）。
- repo 內 grep 不到 NCKU、ncku、成大、econblue 等專案字串（README 的「來源」說明除外）。

**Interface：**
- 每支腳本 `--help` 印出用法；檢查失敗時以狀態 1 結束，並逐頁列出問題與截圖路徑；全部通過時以狀態 0 結束，印出一行 ✓ 摘要。

**Failure modes：**
- Playwright 未安裝：印出安裝指令，狀態 1。
- HTML 不存在：印出路徑，狀態 2。
- beamer 檔未提供：check-density 只檢查 qmd，並註明略過標題對照。

**Acceptance criteria：** 同 tasks.md 各任務的驗證欄。

**Scope boundaries：**
- In scope：~/Documents/academic-slides 全部檔案；GitHub 上 PsychQuant/academic-slides。
- Out of scope：job_finding 內任何檔案（只讀）、~/.claude/skills/academic-slide-design（保留不動，安裝 plugin 後由使用者決定是否刪除）、公開 marketplace。

## Risks / Trade-offs

- [skill 規則來自單一場演講，可能過度擬合] → 規則寫成原則與理由，數值門檻（35 字、3 條列、1.18 倍、0.70 填滿度）都可由參數調整。
- [Quarto 版本更新改變 DOM 結構，腳本的選擇器失效] → 選擇器集中在腳本開頭的常數，README 註明測試過的 Quarto 版本。
- [private repo 日後要公開時需重審內容] → README 不放任何演講內容或個資，只放方法。

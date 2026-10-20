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

- 共用參數：`--html <path>`（預設 ./talk.html）、`--width 1280 --height 720`、`--footer '.reveal .footer'`、`--out <dir>`。
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
- MathJax 巨集放在第一張內容頁的 hidden 區塊，色名用 \definecolor{deckB}{RGB}{…}（巨集內不可寫 #hex）。
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

### D14. 公式顏色由樣式表決定（issue #14）

- 原本三個有數學的範本（research-talk、short-talk、lecture）在隱藏區塊裡用 `\definecolor{deckB}{RGB}{31,78,121}` 等四行定義顏色，`\cB` 到 `\cP` 引用這些名稱，等於色票的第二份副本，設定層碰不到。
- 決定：`\cB`、`\cO`、`\cG`、`\cP` 改為 `\class{deck-b}{#1}` 等四個 class（MathJax 的 `html` 擴充，Quarto 載入的 MathJax 會自動載入），`deck.scss` 的 `scss:rules` 給 `.deck-b`、`.deck-o`、`.deck-g`、`.deck-p` 四個色票顏色。色票因此只有一個來源。實測：個人層設 `$deck-primary: #8b0000` 時，`\cB{x}` 渲染為 `rgb(139, 0, 0)`，沒有 `mjx-merror`。
- beamer 鏡像沒有樣式表，保留 `\definecolor`，數值與官方色票相同；設定層的色票到不了 beamer，另由 issue #21 追蹤。
- 不採用：scaffold 讀設定層的 SCSS、改寫 `\definecolor` 的 RGB。那會留下兩份色票，而 SCSS 的值不一定是十六進位字面值（可以是函式或顏色名稱）。

### D15. `.vc` 頁上的表格用固定的上下邊距（issue #14）

- reveal 給表格 `margin: auto` 讓它水平置中；在 `.vc` 頁的 flex 欄裡，這個 auto 的上下邊距也會分走置中用的空白。#8 的 `section.vc > table { margin-bottom: 0 }` 只拿掉下邊距，套在每一張直屬的表格上：「導言、表格、出處」的頁上，表格的 auto 上邊距仍分走空白（空白移到表格上方），出處貼著表格（實測 6 px，results-report 的兩張頁）。
- 只把那條規則收窄到「唯一的表格」也不對：實測出處會飄到表格下方 86–101 px，因為表格的 auto 上下邊距仍在分空白。
- 決定：`.vc` 頁上的表格改用固定的上下邊距（0.5em），左右仍是 auto（水平置中不變）；緊接在標題或隱藏巨集區塊後面的表格保留 auto 上邊距，由它把內文推到中間。導言、表格、出處因此是一個整塊置中，出處在表格下方 19.4 px；只有一張表格的頁照樣置中。驗證：results-report 的 render 檢查加 `--source-gap 12-40`，四個範本的 `--vc-centred` 照常通過。

### D16. Implementation Contract 描述實際的 render 檢查（issue #14）

#8 之後範本資料夾沒有自己的主題（`_theme/` 在上一層，由 scaffold 複製），把範本資料夾複製一份就地 render 已不成立。`tests/render-templates.sh` 的做法是先用 scaffold 從每個範本建立投影片，再 render 那份投影片。契約改寫成這個流程，範本資料夾不改成可以原地 render。

## Implementation Contract

**Behavior：**
- `claude plugin validate --strict plugins/academic-slides` 與 `claude plugin validate --strict .`（marketplace）都通過。
- 用 `scaffold.mjs` 從每個範本建立投影片、在該資料夾執行 `quarto render`（`tests/render-templates.sh`，D16），產生 talk.html；check-layout、check-density、check-mathjax 都以狀態 0 結束；以 XeLaTeX 編譯 beamer 範本，0 error、0 overfull，check-density 印出「N/N titles match」。
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

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
- check-layout.mjs：合併原 check-overflow.mjs 的四項檢查：頁尾像素帶、DOM 底緣、右緣溢出、標題換行。另有 `--shots` 逐頁截圖。
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

## Implementation Contract

**Behavior：**
- `claude plugin validate --strict plugins/academic-slides` 與 `claude plugin validate --strict .`（marketplace）都通過。
- 在範本資料夾複本中執行 `quarto render`，產生 talk.html；check-layout、check-density、check-mathjax 都以狀態 0 結束；以 XeLaTeX 編譯 beamer 範本，0 error、0 overfull，check-density 印出「N/N titles match」。
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

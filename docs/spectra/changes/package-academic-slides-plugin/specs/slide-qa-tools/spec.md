## Purpose

Provide scripted checks that catch the layout and density problems a human reviewer would otherwise find slide by slide.

## ADDED Requirements

### Requirement: Layout check

`check-layout.mjs` SHALL step through every slide of a revealjs HTML file and flag a slide when non-background pixels reach the band just above the footer, when any visible element ends more than 2 px below the footer's top edge, when a math block, image, or table extends more than 2 px past its column or the slide, or when the slide title wraps to more than one line. It SHALL accept `--html`, `--width`, `--height`, `--footer`, `--out`, and `--shots`.

`check-layout.mjs` SHALL also open the print view that `export-pdf.mjs` prints, with the viewport set to the printed page size and print media emulated, and apply the footer, right-edge, and title checks to every PDF page. It SHALL save each flagged page as `<deck>-print-NN-flagged.png`, where NN is the page number in the PDF, counted in document order so that a slide taller than the paper and a separate notes page each add their own pages, and exit with status 1 when either pass flags. When the print view yields no slide pages, or the check cannot finish, it SHALL print the reason, never the ✓ line, and exit with status 3; screen results already collected SHALL still be printed. Both scripts SHALL open the print view through the same helper in `_lib.mjs`.

#### Scenario: Overlap only in the PDF

- **WHEN** a `.vc` slide is clean on screen but its last line ends below the footer's top edge in the print view (issue #5)
- **THEN** the script lists that slide by PDF page number with the number of pixels below the footer top, saves `<deck>-print-NN-flagged.png`, and exits with status 1

#### Scenario: Print view not measured

- **WHEN** the print view of a deck yields no `.pdf-page` with a slide (for example after a revealjs change to the print-mode DOM)
- **THEN** the script reports that the PDF print view could not be checked, does not print the ✓ line, and exits with status 3

#### Scenario: Wide equation flagged

- **WHEN** a slide contains a display equation wider than the slide
- **THEN** the script lists that slide with the number of pixels past the right edge and exits with status 1

#### Scenario: Clean deck passes

- **WHEN** every slide is within bounds
- **THEN** the script prints one line starting with ✓ and exits with status 0

### Requirement: Fill check

`check-fill.mjs` SHALL report, for each slide whose content reaches less than `--threshold` (default 0.70) of the space between the title and the footer, the slide index, the fill fraction, and a suggested class: `roomy-1` for 0.58–0.70, `roomy-2` for 0.45–0.58, `roomy-3` below 0.45, and `vc` when the slide already has a roomy class.

#### Scenario: Sparse slide suggestion

- **WHEN** a slide without a roomy class has a fill fraction of 0.42
- **THEN** the report suggests `roomy-3` for that slide

### Requirement: Density check reproduces the source script

`check-density.mjs` SHALL count body words and bullets per main-body slide of a `.qmd` file and, when `--tex` is given, of a beamer file, excluding notes, hidden blocks, source lines, side notes, mathematics, tables, images, and markup; it SHALL flag slides above `--words` (default 35) or `--bullets` (default 3), compare main-body titles in order, and exit with status 1 on any violation.

#### Scenario: Same output as the Python original

- **WHEN** check-density.mjs and the original density-check.py run on the same qmd and tex files
- **THEN** their per-slide counts, maximum line, and title comparison line are identical

### Requirement: MathJax and PDF export

`check-mathjax.mjs` SHALL report the number of `mjx-merror` and `mjx-container` elements after MathJax finishes and exit with status 1 when any error element exists. `export-pdf.mjs` SHALL write a PDF through revealjs print mode whose page count equals the number of slides.

#### Scenario: Math error detected

- **WHEN** a slide contains an undefined macro
- **THEN** check-mathjax reports at least one error and exits with status 1

### Requirement: Screenshots stay with the deck

`check-layout.mjs` SHALL write screenshots to `--out` when given and otherwise to a `qa/` folder next to the deck HTML, never to a fixed shared temporary path. With `--shots`, every per-slide file name SHALL start with the deck name (`<deck>-NN.png`), and flagged slides SHALL be saved as `<deck>-NN-flagged.png`, so two decks checked into the same folder never overwrite each other.

#### Scenario: Default output next to the deck

- **WHEN** `check-layout.mjs --html talk.html --shots` runs without `--out`
- **THEN** the screenshots are written to `qa/talk-00.png`, `qa/talk-01.png`, … beside `talk.html`, and nothing is written under the system temporary folder

### Requirement: Deck file names are URL-encoded

Every script that opens a deck SHALL URL-encode the deck file name when building the page URL, so that a deck whose file name contains `#`, `?`, or `%` opens normally.

#### Scenario: Unusual file name

- **WHEN** a rendered deck is saved as `a#b%c?.html` and `check-mathjax.mjs --html 'a#b%c?.html'` runs
- **THEN** the deck loads and the script reports its math nodes instead of timing out

### Requirement: Local server answers only requests addressed to itself

The static server in `_lib.mjs` SHALL respond 403 to any request whose `Host` header is not `127.0.0.1:<port>` or `localhost:<port>` for its own port, as a defence against DNS rebinding.

#### Scenario: Foreign Host header rejected

- **WHEN** a request for an existing file in the deck folder carries `Host: example.com:<port>`
- **THEN** the server responds 403, while the same request with `Host: 127.0.0.1:<port>` responds 200

### Requirement: Served files resolve inside the deck

`serve(root)` SHALL 以 `realpath(root)` 作為供應範圍。每個請求的路徑經 URL 解碼及正規化後 SHALL 先通過路徑邊界檢查，再以 `realpath` 確認實體檔案仍位於該根目錄內，且 SHALL 讀取通過檢查的實體路徑。指向根目錄外的檔案連結與目錄連結 SHALL 被拒絕；指向根內的連結及使用者選定根目錄的別名 SHALL 保持可用。此控制 SHALL 保留 loopback 綁定、既有 Host 限制及 URL 編碼檔名的行為。

#### Scenario: A file link points outside the deck

- **WHEN** 匯入的投影片目錄含有指向目錄外私密檔案的符號連結，投影片請求該路徑
- **THEN** server 拒絕供應該檔案，不回傳其內容

#### Scenario: A directory link points outside the deck

- **WHEN** 請求經過一個或多個符號連結，實體檔案位於投影片根目錄外，包括名稱以根目錄名稱開頭的相鄰目錄
- **THEN** server 拒絕供應該檔案，不因路徑字串位於根內而放行

#### Scenario: Internal links and a root alias remain usable

- **WHEN** 使用者透過目錄別名開啟投影片，且資產連結的實體位置位於投影片根目錄內
- **THEN** 投影片與資產仍正常載入，包含名稱含有 `#`、`?` 或 `%` 的檔案

### Requirement: Screenshot output directories require an authorized location

`check-layout.mjs` 未指定 `--out` 時 SHALL 保留投影片旁 `qa/` 的預設位置，並確認其實體位置位於投影片根目錄內；內指的 `qa/` 別名 SHALL 可用。明確指定 `--out` SHALL 視為授權該輸出目錄及其實體位置，包含外部目錄、巢狀新目錄與目錄別名。`export-pdf.mjs --out` 的檔案路徑 SHALL 授權其父目錄的實體位置。這些授權 SHALL NOT 延伸到目的檔案本身連結指向的位置。

#### Scenario: The default qa directory points outside the deck

- **WHEN** 未指定 `--out`，且匯入資料夾的 `qa/` 透過符號連結指向投影片目錄外
- **THEN** `check-layout.mjs` 回報無法檢查並以狀態 3 結束，不在外部目錄寫入截圖

#### Scenario: The default qa directory aliases an internal directory

- **WHEN** 未指定 `--out`，且 `qa/` 的實體位置位於投影片目錄內
- **THEN** 截圖仍以既有檔名寫入該位置

#### Scenario: The user explicitly selects an external nested directory

- **WHEN** 使用者明確指定 `--out`，其目錄位於投影片外、含有尚未建立的子目錄，或透過目錄別名到達指定位置
- **THEN** 工具可建立所需目錄並輸出產物，同時保留目的檔案的連結防護

### Requirement: Screenshot and PDF writes replace links without following them

三種截圖輸出（`<deck>-NN.png`、`<deck>-NN-flagged.png`、`<deck>-print-NN-flagged.png`）及 PDF SHALL 共用寫入控制：取得 Playwright 回傳的 buffer，在目的檔案所在目錄以排他建立方式產生新的暫存檔，再以 rename 取代目的檔案。工具 SHALL NOT 將最終目的路徑直接交由 Playwright 寫入，也 SHALL NOT 追隨目的檔案的既有連結。一般檔案的重跑覆寫 SHALL 保持可用。

#### Scenario: A screenshot destination is a planted link

- **WHEN** 任一種截圖的預期檔名是指向外部檔案的符號連結，包括指向不存在檔案的連結
- **THEN** 寫入以新的截圖檔案取代該連結，外部目標維持原值或維持不存在

#### Scenario: A print view supplies invalid page metadata

- **WHEN** 列印頁面的量測結果提供非正整數或超出安全整數範圍的頁碼
- **THEN** 工具在組成該頁截圖檔名前拒絕此值，以狀態 3 回報無法完成檢查

#### Scenario: A PDF destination is a planted link

- **WHEN** 預設或明確指定的 PDF 目的檔案是符號連結
- **THEN** 匯出以新的 PDF 檔案取代該連結，不修改或建立連結所指向的外部檔案

#### Scenario: Existing ordinary outputs are refreshed

- **WHEN** 使用者在相同輸出位置重跑截圖檢查或 PDF 匯出
- **THEN** 既有一般產物可由本次產物取代，檔名、預設位置與檢查結果的退出碼契約保持不變

### Requirement: The file boundary documents its threat model

技能說明 SHALL 明確指出上述控制針對匯入資料夾中已存在的惡意連結，不承諾抵擋有權限在檢查與 I/O 之間替換本機目錄的程序。說明 SHALL 提醒 HTML 仍可執行 JavaScript、server 仍供應整個投影片目錄，並建議將外來投影片放在獨立且不含秘密資料的目錄。開發驗證說明 SHALL 列出 `npm ci`、`npx playwright install chromium`、`npm test`，並指出安全回歸測試使用真正的 Chromium。

#### Scenario: A maintainer runs the security regression suite

- **WHEN** 維護者依技能說明安裝鎖定依賴與 Chromium 後執行 `npm test`
- **THEN** 測試涵蓋檔案邊界與實際瀏覽器輸出，且文件不將此防護描述為對本機目錄併發替換的 sandbox


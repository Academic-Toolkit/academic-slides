---
name: slide-qa
description: Check a rendered Quarto revealjs deck (and optionally its beamer mirror) for layout and readability problems before a talk — content cut or hidden by the footer, equations or tables spilling past the right edge, titles wrapping to two lines, sparse half-empty slides, too many words or bullets, MathJax errors including undefined macros, and title mismatches between the Quarto and beamer versions — then export the offline PDF, and lay any deck PDF (revealjs export or beamer) out as an A4 handout: landscape 2×2 or portrait 3 rows × 2 columns, with computed margins, thin frames, the title and page numbers. Use after editing slides, before delivery, when someone reports that a slide overflows, looks empty, or shows red math, or when they want printed handouts (講義、手稿、n-up).
---

# Slide QA

Scripted checks for a revealjs deck rendered by Quarto. They catch what a reviewer would otherwise find slide by slide. Run them after every round of edits; a screenshot review is still the last step, because scripts check geometry, not meaning.

## Requirements

- Node 18 or later and Playwright with Chromium: `npm i -D playwright && npx playwright install chromium`. The scripts import Playwright dynamically and print this command if it is missing.
- A rendered deck (`quarto render`). Every script serves the deck folder over local http, because revealjs does not run from `file://`.
- For handouts only: XeLaTeX (TeX Live, or MacTeX on macOS) and poppler (`pdfinfo`, and `pdftoppm` to look at the pages). `handout.mjs` reads a PDF, so it needs neither Playwright nor a rendered HTML deck.

All scripts live in `scripts/` next to this file. Every script prints its usage with `--help`. Exit status is 0 when the check passes, 1 when it finds a problem, and 2 when the HTML is missing (for `handout.mjs`, the PDF). `check-layout.mjs` also exits with 3 when it could not finish, for example when the print view shows no slide pages; treat 3 as "not checked", never as a pass.

## The checks

| Script | What it finds | Key options |
|---|---|---|
| `check-layout.mjs` | 1. pixels in the band just above the footer (content cut); 2. visible elements ending below the footer's top edge (content hidden behind an opaque footer); 3. math, images, or tables extending past their column or the slide; 4. slide titles wrapping to two or more lines. Checks 2–4 run on screen and again on every page of the PDF print view | `--html`, `--width 1280`, `--height 720`, `--footer '.reveal .footer'`, `--out`, `--shots` |
| `check-fill.mjs` | content slides whose body reaches less than the threshold of the space between title and footer, with a suggested class | `--html`, `--threshold 0.70` |
| `check-density.mjs` | more than N body words or bullets on a main-body slide; with `--tex`, the same for the beamer mirror plus an in-order title comparison | `--qmd`, `--tex`, `--words 35`, `--bullets 3`, `--skip-classes`, `--skip-macros` |
| `check-mathjax.mjs` | MathJax parse errors and undefined macros (MathJax 3 shows these as red text, not as error nodes) | `--html` |
| `export-pdf.mjs` | writes the PDF through revealjs print mode, one page per slide; each page is the slide plus the deck's revealjs margin (1056×594 pt for a 1280×720 slide) | `--html`, `--out` |
| `handout.mjs` | lays a deck PDF (this export or a beamer PDF) out on A4 for printing: landscape 2 rows × 2 columns by default, portrait 3 rows × 2 columns with `--portrait`; see [Handouts](#handouts) | `--pdf`, `--out`, `--portrait`, `--rows` `--cols`, `--margin 12`, `--gap 8`, `--no-frame`, `--frame-width 0.4`, `--title`, `--no-header`, `--no-page-numbers`, `--cjk-font` |

Why both a pixel check and a DOM check: an opaque footer hides overflowing content from the pixel band, so only the DOM check sees it; a pixel check alone misses it.

Why a second pass in the print view: the PDF is laid out differently from the screen. Revealjs's print stylesheet sets every slide's padding to 0, the slide is not scaled, and the footer is placed on the paper rather than in the browser window. A slide that is clean on screen can therefore run into the footer in the PDF. `check-layout.mjs` opens the same print view that `export-pdf.mjs` prints, so a deck it passes prints with no content running into the footer, past the right edge, or onto a second title line. It does not check other overlaps (for example one figure over another), and it does not check the slide number.

A deck shown as a page (issue #23) puts the footer in the page margin below the slide. On screen, checks 1 and 2 therefore use the footer's top or the slide's bottom edge, whichever is higher, so content that runs past the slide is still caught; the reference colour for check 1 is taken just left of the slide, inside the page margin, not at the window's edge, which has its own colour.

What `check-density.mjs` counts: English body words and bullet lines on each main-body slide. It does not count speaker notes, hidden blocks, source lines, side notes, mathematics, tables, images, or markup. The main body ends at a level-1 section whose title starts with "Backup" (Quarto) or at `\appendix` (beamer).

## Handouts

`handout.mjs` puts several slides on each A4 page for printing. The page is laid out by computation and typeset with XeLaTeX, not left to a printer dialog, so the margins are exact, every slide has a frame, and a Chinese title can go in the header.

For a grid of *r* rows × *c* columns on a page *W* × *H* mm, with margin *m* (default 12 mm) and gap *g* (default 8 mm):

slide width = min( (W − 2m − (c−1)g) / c , ((H − 2m − bands − (r−1)g) / r) × aspect ), slide height = width / aspect

The aspect ratio is read from the PDF's first page. The grid is centred in the space left after the header and footer bands, so with only one band on, the grid sits about 4 mm off the page centre, away from that band. The bands are 8 mm for the header and 8 mm for the page numbers; they shrink the slides only when the height binds, which neither preset does.

| Preset | Page | Slide | Space above and below the grid |
|---|---|---|---|
| landscape (default) | 297 × 210 mm, 2 rows × 2 columns | 132.5 × 74.5 mm | 26.5 mm |
| `--portrait` | 210 × 297 mm, 3 rows × 2 columns | 89.0 × 50.1 mm | 65.4 mm |

`--rows R --cols C` replaces the preset grid, with the same formula; give both. They are named rather than written as `3x2` because "3x2" reads either as rows × columns or as columns × rows (issue #34).

- **Frame**: 0.4 pt black around each slide, drawn after the slide so the slide's own background cannot cover half of the line, and drawn around the actual image, so a 4:3 deck in a 16:9 cell is still framed tightly. `--frame-width` changes it, and `--no-frame` removes it.
- **Header**: the PDF's title, else the file name. It is left-aligned with the grid and wraps within the grid's width. `--title "…"` replaces it, and `--no-header` drops it. Quarto puts the subtitle into the PDF title, so the default can be long.
- **Page numbers**: `n / N`, centred below the grid; `--no-page-numbers` drops them.
- **Chinese, Japanese and Korean titles**: XeLaTeX tries PingFang TC, Heiti TC, Noto Sans CJK TC, Source Han Sans TC and Noto Sans TC, in that order. If none is installed, the script exits 1 and asks for `--cjk-font "<installed font>"` or `--no-header`.

Look at the handout the way you look at the slides: render every page with `pdftoppm -r 150 -png talk-handout.pdf qa/talk-handout` and open each image at full size. A frame is about 0.14 mm wide (0.4 pt), so in an image under about 150 dpi some edges can look faint; zoom in, or render that page at a higher resolution, before deciding a frame is missing.

## Step 0: task list

Turn the steps below into a task list before starting. If the session provides `TaskCreate` and `TaskUpdate`, create one task per step, set it to in progress when you start it, and mark it completed as soon as it is done. If those tools are not available, write the same list in your reply and tick it off there. A step that failed or was skipped is never marked completed; it stays open and is reported. A check that exits 1, 2, or 3 is not completed.

```
TaskCreate(subject="Render the deck", description="quarto render; the deck's .html exists")
TaskCreate(subject="check-layout --shots", description="exit 0 (3 means not checked); screenshots of every slide in qa/")
TaskCreate(subject="check-mathjax", description="exit 0: no parse errors, no undefined macros")
TaskCreate(subject="check-density", description="--qmd, plus --tex when the deck has a beamer mirror; exit 0, titles match")
TaskCreate(subject="check-fill", description="every flagged slide reviewed: roomy, vc, a figure, or kept as is with a reason (advice, never fails)")
TaskCreate(subject="export-pdf", description="PDF written; its page count equals the slide count")
TaskCreate(subject="Look at every screenshot", description="open each qa/<deck>-NN.png at full size, plus -flagged and -print-NN-flagged; a contact sheet does not count")
TaskCreate(subject="Fix and re-run", description="each failure fixed per references/fix-table.md; the failed checks re-run until they pass")
```

Add a handout task only when printed handouts are asked for, and put it after "Fix and re-run": `TaskCreate(subject="handout", description="after the last fix: PDF rebuilt (export-pdf, or the beamer deck recompiled), handout.mjs on that PDF exits 0, every handout page rendered and looked at at full size")`. A run that does not want handouts has no handout task, so it does not leave one open.

## Workflow

```bash
quarto render                                   # 1. produce talk.html
node scripts/check-layout.mjs --shots           # 2. layout; screenshots of every slide in qa/ next to the deck
node scripts/check-mathjax.mjs                  # 3. red math
node scripts/check-density.mjs --qmd talk.qmd --tex beamer/talk.tex   # 4. words, bullets, titles
node scripts/check-fill.mjs                     # 5. half-empty slides (advice, never fails)
node scripts/export-pdf.mjs                     # 6. offline PDF; page count = slide count
node scripts/handout.mjs --pdf talk.pdf         # 7. A4 handout (optional): 2 × 2 landscape; --portrait for 3 rows × 2 columns
```

Step 7 prints whatever PDF it is given, so make the handout last: after every fix, rebuild the PDF (step 6 for a revealjs deck, recompile the beamer deck for a beamer PDF) and then run step 7. A handout made before a fix shows the old deck.

Then look at the screenshots from step 2: `qa/<deck>-NN.png` for every slide, `qa/<deck>-NN-flagged.png` for flagged slides, and `qa/<deck>-print-NN-flagged.png` for flagged PDF pages. Screen slides are numbered from 0 (`#NN`), PDF pages from 1 (`page NN`, the page number in the PDF, counting the extra pages of a slide taller than the paper and of separate notes pages). Pixel figures differ between the two because the screen view is scaled to fit its margin. For a handout from step 7, render its pages (`pdftoppm -r 150 -png talk-handout.pdf qa/talk-handout`) and look at each one too. Add `qa/` to the project's `.gitignore`. Check label collisions in figures, awkward line breaks inside narrow columns, and whether highlighted numbers are the ones the speaker talks about.

For each failure, see [references/fix-table.md](references/fix-table.md). It lists the usual cause and the fix that keeps the deck consistent with the rules in the `academic-slide-design` skill.

## Limits

- The checks assume a 16:9 revealjs deck with a footer. On a deck without a footer, `check-layout.mjs` uses the bottom 56 px as the footer line.
- The print pass assumes a `position: fixed` footer, as Quarto renders `footer:`; a custom `--footer` laid out another way is not supported there.
- `handout.mjs` frames each PDF page as it is. A revealjs export carries the deck's own page margin, so the frame surrounds that margin as well as the slide; a beamer PDF has no such margin. Whether the text is still readable at 89 mm wide (portrait 3 × 2) is judged by looking at the printed page; the script does not measure text size.
- `check-fill.mjs` measures geometry only. A low fill on a closing slide such as "Thank you" is expected.
- Title comparison normalizes case, punctuation, dashes, `\emph`, and inline math. A deliberate wording difference between the two decks will still be reported.
- If a newer Quarto release changes the revealjs DOM, update the selectors at the top of each script.
- A deck keeps its own copy of the shared theme: `_theme/deck.scss`, or `theme/deck.scss` in a deck made before version 0.2.0. A later fix to the plugin's theme, such as the print rules for `.vc` slides and the footer (issue #5) the table bottom rule (issue #8), or the formula colour classes and overridable defaults (issue #14), does not reach an existing deck; copy the rules from the plugin's `slide-deck-scaffold/templates/quarto/_theme/deck.scss` into it (issue #10 tracks a command that does this).

## 檔案與輸出安全邊界

本機 HTTP server 以投影片目錄的 `realpath` 為根，請求路徑在解碼與正規化後仍須位於根內，其 `realpath` 也須位於根內，才讀取該實體檔案。因此，指向目錄外的檔案連結與目錄連結不會被提供；指向根內的連結，以及使用者用來開啟整個投影片目錄的別名連結，仍可使用。原有的 loopback 綁定、Host 檢查與檔名 URL 編碼維持不變。

未指定 `--out` 時，截圖仍寫入投影片旁的 `qa/`，且 `qa/` 的實體位置必須位於投影片目錄內；指向內部目錄的 `qa/` 連結可用，指向外部的連結會讓檢查以狀態 3 結束。明確指定 `check-layout.mjs --out` 表示授權該輸出目錄及其實體位置，可使用外部目錄、巢狀新目錄或目錄別名。`export-pdf.mjs --out` 接受檔案路徑，授權其父目錄的實體位置；這些選項都不會授權追隨目的檔案本身的連結。

三種截圖（`<deck>-NN.png`、`<deck>-NN-flagged.png`、`<deck>-print-NN-flagged.png`）與 PDF 共用安全寫入方式：先取得 Playwright 回傳的 buffer，在目的檔案所在目錄建立不覆用既有路徑的新暫存檔，再以 rename 取代目的檔案。若目的檔案原本是連結，會以新檔案取代連結，連結指向的外部檔案不變；一般重跑仍可覆蓋先前產物。`handout.mjs` 的講義 PDF 也走同一個寫法；`--out` 與 `--pdf` 指到同一個檔案（含連結或另一個檔名）時直接拒絕，不會蓋掉原本的投影片。

這些措施防護匯入資料夾中已存在的惡意連結，並非針對有權限在檢查與讀寫之間同時替換本機目錄的程序提供 sandbox。投影片 HTML 仍會執行 JavaScript，server 仍提供整個投影片目錄中的檔案。檢查外來投影片時，應放在獨立且不含秘密資料的目錄。

## 開發驗證

在本 repository 根目錄執行以下命令；`npm test` 的安全回歸測試會啟動真正的 Chromium，須先安裝鎖定的依賴與瀏覽器：

```bash
npm ci
npx playwright install chromium
npm test
```

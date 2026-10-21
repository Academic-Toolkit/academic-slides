# What to do when a check fails

Each row gives the usual cause and a fix that keeps the deck consistent with the `academic-slide-design` rules. Fix the cause rather than shrinking fonts slide by slide. Body font sizes should vary little across the deck.

## check-layout.mjs

| Message | Usual cause | Fix |
|---|---|---|
| `N px in the footer band` / `content N px below the footer top` | Too much stacked content: an equation plus a table plus a takeaway box plus a source line. | First remove what the slide does not need, for example an explanatory sentence that repeats the equation, or a grey note. Then move the notation table into a side column, or merge two short lines. Use smaller type only for tables. |
| `N px past the right edge` | A display equation with several braces, or a long label under a brace, wider than its column. | Split the equation into two displays (for example the model, then its decomposition). Shorten brace labels to one to three words. Move a `\text{...}` prefix into the line above. Never let an equation overlap a figure in the next column. |
| `N px past the right edge` on a table | Side-by-side tables whose cells do not wrap, or a column that inherits side margins from the column layout. | Rebalance the two column widths, for example 47% and 51%. Shorten cell text. Reset table margins in the column with a more specific selector. |
| `title on 2 lines` | The title is longer than about 65 characters at 1280 px. | Shorten the claim. Drop prefixes such as "Simulation A result:"; the study type and the finding are enough. |
| a PDF page flagged in the print view while the same slide is clean on screen | The deck's theme sets a slide's height or padding in a way the print view does not keep: revealjs prints every slide with `padding: 0 !important`, and each page is taller than the slide by the margin. `.vc` slides in a theme copied from the template before issue #5 do this. | Copy the template's `html.print-pdf … section.vc` rule into the deck's `deck.scss`. For your own rules, pin the height to `var(--slide-height)` and repeat the padding with `!important` under `html.print-pdf`. If the slide is simply full, treat it like the first row. In the PDF an overflowing slide can also lose content: text pushed past the page edge is cut off, not just drawn over the footer. |
| `the PDF print view could not be checked` (exit 3) | The print view showed no slide pages, usually because a newer Quarto or revealjs changed the print-mode DOM (`.pdf-page`), or the page did not finish loading. | Re-run once. If it persists, open `talk.html?print-pdf` in a browser to see whether print mode still works, then update the print-view selectors in `check-layout.mjs`. Do not treat exit 3 as a pass. |

## check-fill.mjs

| Suggestion | Meaning | Fix |
|---|---|---|
| `roomy-1/2/3` | The body reaches only 45–70% of the space. | Add the class to the slide title, for example `## Title {.roomy-2}`. It scales body text by 1.06, 1.12, or 1.18 times; titles and source lines are never scaled. |
| `vc` | Already scaled, still sparse. | Add `.vc` to centre the body vertically between title and footer. Do not scale beyond 1.18 times; large jumps in body size look inconsistent. |
| `already centred` | Scaled and centred, still sparse. | Ask whether a figure would help. An illustration of the key idea often works, for example information curves for an item-selection rule. Otherwise leave it. |

## check-density.mjs

| Message | Usual cause | Fix |
|---|---|---|
| `<-- over limit` (words) | Prose explaining what the equation already shows, or a limitation sentence. | Cut the sentence and say it in the speaker notes. Keep at most one plain sentence per idea, one sentence per line. |
| `<-- over limit` (bullets) | A list of more than three points. | Merge points, or split the slide. Use bullets, not numbered lists; only the outline uses section numbers. |
| `title mismatch at main slide N` | A slide was added, removed, moved, or retitled in one deck only. | Update the beamer mirror to match the Quarto master, which is the content source. Backup slides are not compared. |

## check-mathjax.mjs

| Message | Usual cause | Fix |
|---|---|---|
| `undefined macro \foo` | The macro is used but not defined in the hidden macro block, for example `\Cov` or `\argmax`. | Add it to the hidden block on the first content slide: `\newcommand{\Cov}{\operatorname{Cov}}`. |
| parse error | Unbalanced braces, or `#` inside a `\newcommand` body. | `#` is the parameter character. Colour a term with a CSS class, `\class{deck-b}{#1}`, coloured in the theme; in beamer, `\definecolor{name}{RGB}{r,g,b}` and use the name. |

## export-pdf.mjs

| Message | Usual cause | Fix |
|---|---|---|
| page count differs from the slide count | Vertical sub-slides, or fragments printed separately. | Avoid vertical slides in talks. Revealjs prints each fragment state on its own page unless `pdfSeparateFragments` is set to `false`. |
| slide number barely visible in the PDF (seen by eye, not reported) | The footer's white backing spans the page in print and covers the slide number, which sits inside its page below the footer. | Copy `html.print-pdf .reveal .footer { background: none; }` from the template's `deck.scss`. |

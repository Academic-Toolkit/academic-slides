---
name: slide-qa
description: Check a rendered Quarto revealjs deck (and optionally its beamer mirror) for layout and readability problems before a talk — content cut or hidden by the footer, equations or tables spilling past the right edge, titles wrapping to two lines, sparse half-empty slides, too many words or bullets, MathJax errors including undefined macros, and title mismatches between the Quarto and beamer versions — then export the offline PDF. Use after editing slides, before delivery, or when someone reports that a slide overflows, looks empty, or shows red math.
---

# Slide QA

Scripted checks for a revealjs deck rendered by Quarto. They catch what a reviewer would otherwise find slide by slide. Run them after every round of edits; a screenshot review is still the last step, because scripts check geometry, not meaning.

## Requirements

- Node 18 or later and Playwright with Chromium: `npm i -D playwright && npx playwright install chromium`. The scripts import Playwright dynamically and print this command if it is missing.
- A rendered deck (`quarto render`). Every script serves the deck folder over local http, because revealjs does not run from `file://`.

All scripts live in `scripts/` next to this file. Every script prints its usage with `--help`. Exit status is 0 when the check passes, 1 when it finds a problem, and 2 when the HTML is missing.

## The checks

| Script | What it finds | Key options |
|---|---|---|
| `check-layout.mjs` | 1. pixels in the band just above the footer (content cut); 2. visible elements ending below the footer's top edge (content hidden behind an opaque footer); 3. math, images, or tables extending past their column or the slide; 4. slide titles wrapping to two or more lines | `--html`, `--width 1280`, `--height 720`, `--footer '.reveal .footer'`, `--out`, `--shots` |
| `check-fill.mjs` | content slides whose body reaches less than the threshold of the space between title and footer, with a suggested class | `--html`, `--threshold 0.70` |
| `check-density.mjs` | more than N body words or bullets on a main-body slide; with `--tex`, the same for the beamer mirror plus an in-order title comparison | `--qmd`, `--tex`, `--words 35`, `--bullets 3`, `--skip-classes`, `--skip-macros` |
| `check-mathjax.mjs` | MathJax parse errors and undefined macros (MathJax 3 shows these as red text, not as error nodes) | `--html` |
| `export-pdf.mjs` | writes the PDF through revealjs print mode, one page per slide | `--html`, `--out` |

Why both a pixel check and a DOM check: an opaque footer hides overflowing content from the pixel band, so only the DOM check sees it; a pixel check alone misses it.

What `check-density.mjs` counts: English body words and bullet lines on each main-body slide. It does not count speaker notes, hidden blocks, source lines, side notes, mathematics, tables, images, or markup. The main body ends at a level-1 section whose title starts with "Backup" (Quarto) or at `\appendix` (beamer).

## Workflow

```bash
quarto render                                   # 1. produce talk.html
node scripts/check-layout.mjs --shots --out qa  # 2. layout; screenshots of every slide in qa/
node scripts/check-mathjax.mjs                  # 3. red math
node scripts/check-density.mjs --qmd talk.qmd --tex beamer/talk.tex   # 4. words, bullets, titles
node scripts/check-fill.mjs                     # 5. half-empty slides (advice, never fails)
node scripts/export-pdf.mjs                     # 6. offline PDF; page count = slide count
```

Then look at the screenshots from step 2. Check label collisions in figures, awkward line breaks inside narrow columns, and whether highlighted numbers are the ones the speaker talks about.

For each failure, see [references/fix-table.md](references/fix-table.md). It lists the usual cause and the fix that keeps the deck consistent with the rules in the `academic-slide-design` skill.

## Limits

- The checks assume a 16:9 revealjs deck with a footer. On a deck without a footer, `check-layout.mjs` uses the bottom 56 px as the footer line.
- `check-fill.mjs` measures geometry only. A low fill on a closing slide such as "Thank you" is expected.
- Title comparison normalizes case, punctuation, dashes, `\emph`, and inline math. A deliberate wording difference between the two decks will still be reported.
- If a newer Quarto release changes the revealjs DOM, update the selectors at the top of each script.

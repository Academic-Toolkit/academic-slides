---
name: slide-deck-scaffold
description: Start a new research-talk or lecture deck from a ready-made Quarto revealjs template (16:9, MathJax colour macros, theorem/takeaway/notation/outline/setting-pair components, sparse-slide scaling and centring) with an optional beamer mirror that shares the palette, macros, and slide titles. Use when creating a new slide deck, converting a talk to Quarto, adding a beamer version of a Quarto deck, or recolouring a deck for another institution.
---

# Slide deck scaffold

Two templates in `templates/`:

| Path | What it is |
|---|---|
| `templates/quarto/` | `_quarto.yml`, `talk.qmd`, `theme/deck.scss`. The content master. |
| `templates/beamer/talk.tex` | beamer mirror: same palette, macros, and main-body titles. |

The demo slides show each slide pattern with neutral textbook content: an outline, a model with labelled terms, a theorem, a bridge, a simulation setting, a result table, takeaways, a backup proof sketch, and references. Replace their content. Keep each pattern's structure only where the talk needs it. For the reasoning behind the patterns, see the `academic-slide-design` skill.

## Start a deck

```bash
cp -R <this skill>/templates/quarto  my-talk          # the Quarto master
cp <this skill>/templates/beamer/talk.tex my-talk/beamer/   # optional mirror
cd my-talk && quarto render                           # → talk.html
```

Then edit, in this order:

1. **Front matter**:
   - `talk.qmd`: `title`, `subtitle`, `author`, `institute`, `date`.
   - `_quarto.yml`: `footer` (venue · date).
   - The beamer file: `\title`, `\author`, `\date`, and the `frame footer`.
2. **Palette**: recolouring touches three places, which must hold the same RGB values.
   - `theme/deck.scss`: the five `$deck-*` variables. This recolours titles, theorem bars, outline numbers, table headers, takeaway boxes, and the `.hl-*` highlights.
   - `talk.qmd`: the four `\definecolor{deck?}{RGB}{…}` lines in the hidden block on the Outline slide. This recolours the math.
   - The beamer file: the four `\definecolor` lines.
3. **Macros**: add any macro the talk uses to the hidden MathJax block and to the beamer preamble under the same name. Never write `#hex` inside a `\newcommand` body; `#` is the parameter character, and every formula that uses the macro breaks.
4. **Slides**: one `##` per slide, `#` for section dividers, and a final `# Backup` section. Everything after `# Backup` (Quarto) or `\appendix` (beamer) is excluded from the density limits and the title comparison.

## Components (Quarto class → beamer counterpart)

| Quarto | beamer | Use |
|---|---|---|
| `::: {.theorem}` + `[Title]{.thm-title}` | `block` | definition, assumption, theorem |
| `::: {.takeaway}` | `\takeaway{}` | one-sentence finding under a result |
| `::: {.punchline}` | `\punchline{}` | section-level conclusion |
| `::: {.algo}` with `<br/>` and `&emsp;` | `\algobox{}` | algorithm |
| `::: {.notation}` + table | `tabular` | symbols with "How it is obtained" |
| `::: {.source}` | `\sourceline{}` | citations only, never file paths |
| `::: {.outline}` + `[1]{.onum}` | `tabular` | outline, section titles only |
| `:::: {.columns .setting-pair}` | two `column`s | design table next to methods-compared table |
| `[x]{.hl-key}` `[x]{.hl-good}` `[x]{.hl-bad}` | `\hlkey` `\hlgood` `\hlbad` | highlight only the numbers you discuss |
| `\cB{}` `\cO{}` `\cG{}` `\cP{}` | same | one colour per object, in formula and notation table |
| `{.roomy-1}` `{.roomy-2}` `{.roomy-3}` on a slide title | `\large` on the frame | sparse slide: body scaled 1.06, 1.12, or 1.18 times |
| `{.vc}` on a slide title | `\vfill` around the body | centre a sparse body between title and footer |

Choose `roomy` and `vc` from the numbers `check-fill.mjs` reports (skill `slide-qa`), not by eye.

## Speaker notes

Every main-body slide carries a notes block in three parts:

```markdown
::: {.notes}
**Purpose**: what this slide must achieve. (about 1 min)

**Script**: "the sentences you will say, in your own voice."

**Cue**: what to point at or click; how to answer the likely question.
:::
```

The minutes across all slides should add up to the time slot minus a buffer (for example 45 minutes minus 2). Press `s` in the browser to open the speaker view. You can use other headings (for example 目的／講／操作), as long as the deck uses one set throughout.

## Keeping the beamer mirror in sync

- Quarto is the content master. Edit `talk.qmd` first, then mirror the change in the beamer file.
- Main-body titles must match one to one in order. `check-density.mjs --qmd talk.qmd --tex beamer/talk.tex` reports the first mismatch.
- Compile with XeLaTeX twice (the second run fixes page numbers). Require 0 errors and 0 overfull boxes. Fix overfull frames with `\small`, `\footnotesize`, or `\resizebox{\linewidth}{!}{…}` on tables, never by deleting content that the Quarto deck has.
- If the project lives in a cloud-synced folder (Dropbox, iCloud), copy it to a local temporary folder, compile there, and copy the PDF back. Sync clients can corrupt auxiliary files mid-compile.
- The beamer template uses the metropolis theme. If it is not installed, `\usetheme{metropolis}` fails; install it (`tlmgr install beamertheme-metropolis`) or switch to another theme and keep the macros.

## After every round of edits

Run the checks in the `slide-qa` skill: layout, MathJax, density with the title comparison, and fill. Then look at the screenshots.

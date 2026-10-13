## Purpose

Give an agent a ready-to-copy starting point for a Quarto revealjs deck and a mirrored beamer deck that share colors, components, and slide titles.

## ADDED Requirements

### Requirement: Quarto template renders and passes the checks

`slide-deck-scaffold/templates/quarto/` SHALL contain `_quarto.yml`, `talk.qmd`, and `theme/deck.scss`. `talk.qmd` SHALL demonstrate an outline, a research-result slide, a theorem slide, a bridge slide, a simulation setting slide with side-by-side tables, a result table with highlighted key numbers, a discussion slide, a backup section, and speaker notes in the purpose/script/cue format.

#### Scenario: Template renders cleanly

- **WHEN** the template folder is copied to a temporary directory and `quarto render` runs there
- **THEN** `talk.html` is produced, and check-layout, check-density, and check-mathjax all exit with status 0 on it

### Requirement: Palette is a single set of variables

`theme/deck.scss` SHALL define the palette as `$deck-primary`, `$deck-accent`, `$deck-green`, `$deck-purple`, and `$deck-ink` at the top, and every component rule SHALL reference these variables rather than literal colors.

#### Scenario: Recolor by editing five lines

- **WHEN** the five palette variables are changed and the template is rendered again
- **THEN** titles, theorem bars, takeaway boxes, outline numbers, and table headers all take the new colors

### Requirement: Beamer mirror compiles with matching titles

`slide-deck-scaffold/templates/beamer/talk.tex` SHALL compile with XeLaTeX, define the same RGB palette and the macros `\cB`, `\cO`, `\cG`, `\cP`, `\takeaway`, `\sourceline`, `\algobox`, and `\bibent`, and its main-body frame titles SHALL match the main-body slide titles of `talk.qmd` one to one.

#### Scenario: Beamer compiles and titles match

- **WHEN** `talk.tex` is compiled twice with XeLaTeX and check-density runs with both files
- **THEN** the log has no errors and no overfull boxes, and check-density reports that all main-body titles match

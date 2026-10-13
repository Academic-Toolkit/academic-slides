## Purpose

Provide scripted checks that catch the layout and density problems a human reviewer would otherwise find slide by slide.

## ADDED Requirements

### Requirement: Layout check

`check-layout.mjs` SHALL step through every slide of a revealjs HTML file and flag a slide when non-background pixels reach the band just above the footer, when any visible element ends more than 2 px below the footer's top edge, when a math block, image, or table extends more than 2 px past its column or the slide, or when the slide title wraps to more than one line. It SHALL accept `--html`, `--width`, `--height`, `--footer`, `--out`, and `--shots`.

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

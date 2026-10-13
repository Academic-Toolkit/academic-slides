# Before calling a deck done

## Content

- [ ] Every result slide has the model, the notation (how each quantity is obtained), the identification, a data note, a figure or table, a one-line takeaway, and a citation.
- [ ] Every theorem is stated as in its source; proofs and lemmas are in the backup.
- [ ] Every number traces to the final version of its source; record the source file and table for each in the project README.
- [ ] Simulations follow the theory they support; setting slides restate the compared methods with citations; metric definitions are in the backup.

## Mathematics

- [ ] Braces name meanings in plain words; at most three per equation, except decompositions.
- [ ] Colors follow the deck palette; each object keeps its color everywhere.
- [ ] `check-mathjax.mjs` reports 0 errors, including undefined macros.

## Layout

- [ ] `check-layout.mjs` passes: nothing under the footer, nothing past the right edge, every title on one line.
- [ ] `check-density.mjs` passes: at most 35 words and 3 bullets per main-body slide; with a beamer mirror, all main-body titles match.
- [ ] `check-fill.mjs` reviewed: sparse slides use `roomy` (at most 1.18 times) and `vc`, or gained a figure.
- [ ] Screenshots reviewed: no label on a curve, no sentence broken inside a narrow column, highlighted numbers are the ones spoken.

## Delivery

- [ ] Speaker notes on every main-body slide; minutes add up to the slot minus a buffer.
- [ ] PDF exported (`export-pdf.mjs`) as the offline fallback; its page count equals the slide count.
- [ ] One timed rehearsal.

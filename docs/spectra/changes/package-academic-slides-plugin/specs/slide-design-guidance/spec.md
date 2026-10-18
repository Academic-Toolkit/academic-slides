## Purpose

Tell an agent how to design research slides that a seminar audience can read: content structure, readable mathematics, consistent layout, and speaker notes.

## ADDED Requirements

### Requirement: Design skill covers content, mathematics, layout, and notes

The `academic-slide-design` skill SHALL cover content principles for research talks, math readability with colored braces, layout and typography rules, table highlighting, simulation and evidence slides, discussion slides, speaker notes, and a pre-delivery checklist. Detailed material SHALL live in `references/` files linked from `SKILL.md`.

#### Scenario: Sections present

- **WHEN** `SKILL.md` and its references are read
- **THEN** each topic listed above has its own section or reference file, and every linked reference file exists

### Requirement: Layout rules from review feedback

The skill SHALL state these rules with a one-line reason each:
- body text is scaled at most 1.18 times and titles are never scaled, and sparse slides are centered vertically;
- one sentence per line, no wrapping in narrow columns, and titles fit on one line;
- bullets rather than numbered lists, except the outline's section numbers, and the outline lists section titles only;
- no grey footnotes on discussion slides;
- tables highlight only key numbers and the compared pair;
- tables draw three rules — above the header, below the header, and below the last row — and never box rows or columns;
- braces name the meaning of a term in plain words, and the notation table says how each quantity is obtained;
- simulation slides carry no letter tags and their setting slides restate the compared methods with citations;
- one slide per study in a research overview, with personal history kept off the slides;
- numbers come from the final version of each source.

#### Scenario: Rules traceable

- **WHEN** the layout reference is read
- **THEN** every rule listed above appears with its reason

### Requirement: Generic examples

Examples in the skill SHALL use neutral placeholders or textbook models (for example a 2PL item response model or a two-way fixed-effects wage model) and SHALL NOT reproduce results from the source talk.

#### Scenario: No source-talk numbers

- **WHEN** the skill files are searched for the source talk's reported results (0.72, 0.960, 0.828, 107,417)
- **THEN** no match is found

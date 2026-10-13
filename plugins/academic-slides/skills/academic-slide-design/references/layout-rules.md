# Layout and typography rules

Each rule comes with its reason. These rules came from repeated review of one statistics job talk; the numeric thresholds are defaults and can be changed in the `slide-qa` scripts.

| Rule | Reason |
|---|---|
| Body text may be scaled up by at most 1.18 times (`roomy-1/2/3` = 1.06, 1.12, 1.18); titles and source lines are never scaled. | Large jumps in text size from slide to slide make a deck look inconsistent. |
| A slide that is still sparse after scaling is centred vertically (`vc`). If a figure would help understanding, add one instead of scaling. | Half-empty slides look unfinished; centring fixes the look without changing the type scale. |
| Choose the scaling level from the measured fill (`check-fill.mjs`), not by eye. | Measuring keeps the choice consistent across slides. |
| One sentence per line. If a sentence wraps inside a narrow column, change the layout (full-width text, figure below) rather than accepting the break. | A sentence broken mid-phrase is read as two fragments. |
| Every slide title fits on one line (about 65 characters at 1280 px). Drop prefixes such as "Simulation A result:". | Two-line titles push the content down and break the visual rhythm of the deck. |
| Bulleted lists throughout; no numbered lists except the outline's section numbers. | Mixing numbered and bulleted lists suggests an order that does not exist. |
| The outline lists section titles only, in large type; no "question" column. | The outline is a map, not a summary. |
| At most 35 body words and 3 bullets per main-body slide, not counting mathematics, tables, notes, and source lines. | The audience reads or listens, not both. |
| No grey footnotes on discussion slides. Source lines hold citations only, never script paths or file names. | Grey text is hard to read and invites the audience to stop listening. |
| Limitations are said aloud and kept in the notes; if the slide title promises limitations, either show them properly or retitle the slide. | A cramped "Limits:" line looks like an afterthought. |
| Remove a sentence that restates the equation. | Duplicated content competes with the speaker. |
| Nothing overlaps the footer, the right edge, or a neighbouring column (`check-layout.mjs`). | An opaque footer hides content silently; an equation spilling into a figure hides both. |
| Side-by-side tables have equal row heights, a visible gap, and cells that do not wrap; a math cell that makes one row taller is replaced by words. | Misaligned rows look broken and slow the reader. |
| Figures: an illustrative figure says so in its caption; labels never sit on a line or curve; check this in the rendered slide. | Readers otherwise treat illustrations as results, and overlapping labels are unreadable. |
| Section dividers are plain; no decorative tags or badges on content slides. | Badges compete with the title for attention. |
| A teaser simulation (one that motivates the problem) shows only its result; its setting goes to the backup. | The teaser's job is to show the failure quickly. |
| Personal history stays off the main slides of a job talk; a timeline can sit in the backup. | Interviews and the CV cover it; the talk is for the research. |
| Tables highlight only the numbers you will say aloud and the compared pair (bold plus a highlight class); rows are never colored by category. Details in tables-and-figures.md. | One or two highlights guide the eye; whole-row coloring turns into decoration. |
| Braces name the meaning of a term in plain words; the notation table says how each quantity is obtained. Details in math-readability.md. | The audience needs what a term means while listening; its provenance can be read later. |
| Simulation slides carry no letter tags (A, B, C) or badges; the setting slide restates the compared methods with citations. Details in evidence-slides.md. | Letters force the audience to remember a code; restating the methods lets a slide stand on its own. |
| A research overview has one slide per study. | Two studies on one slide halve the time each gets and blur the map. |
| Every number comes from the final version of its source (for example the submitted thesis, not earlier defense slides). | Reviewers check numbers against the published version. |

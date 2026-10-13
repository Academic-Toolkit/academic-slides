---
name: academic-slide-design
description: Design or review research slides that a seminar audience can follow — job talks, department seminars, conference talks, and lecture decks in Quarto revealjs or LaTeX beamer. Covers content structure (question, model, identification, evidence, bottom line), readable mathematics (colored braces that name what each term means, one color per object), layout and typography rules that keep a deck consistent (font-size limits, one sentence per line, centring sparse slides), table highlighting, simulation and evidence slides, discussion slides, speaker notes, and a pre-delivery checklist. Use when writing, restructuring, or critiquing slides.
---

# Academic slide design

A talk is heard once, at the speaker's pace. The audience cannot skip back, so every slide should be readable at a glance. Each formula should say what its parts mean, and the deck should look like one consistent object.

This skill holds the principles. The `slide-deck-scaffold` skill has templates that implement them, and the `slide-qa` skill has scripts that check them.

## The ten rules that matter most

1. **State the question, then the answer.** Every result slide gives the model, how it is identified, the evidence, and a one-sentence takeaway with its number.
2. **Show the model behind every result figure.** Put the estimating equation on the same slide, with a notation table that says how each quantity is obtained.
3. **Name terms with colored braces.** Label in plain words what a term means ("sorting", "firm premia"), not jargon ("solved for") or an author's name. Give one color to each object, in the formula and in its table.
4. **Keep body text consistent.** Scale a sparse slide's body by at most 1.18 times and never scale titles. Centre what is still sparse, or add a figure that earns its place.
5. **One sentence per line; titles on one line.** If text wraps inside a narrow column, change the layout to full width rather than accepting the break.
6. **Bullets, not numbered lists.** The only numbers are the outline's section numbers. The outline lists section titles only.
7. **Highlight only the numbers you will say aloud** in a table: the key value, the method you recommend, the failure. Never color whole rows by category.
8. **No letter tags on simulations.** Title them by what they study. The setting slide restates the methods compared, with citations. Metric definitions go to the backup.
9. **No grey footnotes on discussion slides, and no file paths in source lines.** Source lines hold citations; limitations are spoken, and the notes hold them.
10. **Every number traces to the final version of its source**, for example the submitted dissertation rather than earlier defense slides. Every claim matches how the source states it.

## References

| File | Read when |
|---|---|
| [references/content-principles.md](references/content-principles.md) | planning the arc of a talk, or a result slide |
| [references/math-readability.md](references/math-readability.md) | writing equations, braces, notation tables |
| [references/layout-rules.md](references/layout-rules.md) | any layout or typography decision; the full rule list with reasons |
| [references/tables-and-figures.md](references/tables-and-figures.md) | result tables, side-by-side tables, illustrative figures |
| [references/evidence-slides.md](references/evidence-slides.md) | simulation, empirical, and research-overview slides |
| [references/speaker-notes.md](references/speaker-notes.md) | writing the spoken script and timing |
| [references/checklist.md](references/checklist.md) | before calling a deck done |

## How to review a deck

Go slide by slide against the ten rules. Then run the `slide-qa` scripts and look at their screenshots. Report each problem with the slide title, the rule, and a concrete fix, for example "split the decomposition onto its own line" or "move the citation to the notation table". Do not report only that the slide "looks crowded".

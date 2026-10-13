# Content principles

Distilled from Jesse M. Shapiro's "How to Give an Applied Micro Talk" and from repeated review of a statistics job talk.

## The audience cannot skip

- Put nothing on a slide that you do not plan to talk about. The space an item takes should match the emphasis you intend.
- State the question first, then preview the answer. Give enough method that the result does not feel like magic, but not so much that it crowds out the result.
- Scale the talk to the time. A 45-minute talk is not a 90-minute talk delivered twice as fast; choose what to emphasize.

## The arc of a methods talk

question → the classical (often large-sample) answer → why it fails here → the new result → evidence → limits and open problems.

- Introduce a framework formally before using it. Define the object (for example regret, or a confidence sequence) in a definition block. Then add a bridge slide that maps the framework onto the application, row by row.
- Put each simulation directly after the theory it supports, not in a separate "simulations" section at the end. The audience then judges the result while the theorem is fresh.
- For an audience outside your field, add one primer slide that defines the model in words and with a picture, for example item characteristic curves before an item-response model.

## A result slide

Each empirical or simulation result slide has:

1. a title that states the finding, not the topic;
2. the model or estimating equation, with braces naming its terms;
3. the identification condition in mathematics, for example $E[\varepsilon_{it}\mid x_{it},\alpha_i,\psi_j]=0$, with one plain line;
4. the evidence: a figure at least half the slide height, or a small table;
5. a data note: source, years, sample size;
6. a one-sentence takeaway, quantitative if possible;
7. a small citation line.

## A theorem slide

- Assumption block, then theorem block. State the theorem exactly as in the source; do not "correct" constants on the slide.
- Use braces to show which lemma controls which factor of a bound.
- Add one "Proof idea" line pointing to the backup.
- Do not list every lemma in the main body. Lemmas, proof sketches, and robustness checks go to the backup.

## A research overview (job talks)

- Use one slide per study, and one map slide that places the studies on a single axis, for example identification → large-sample guarantees → finite-sample guarantees. Keep each study to 45–60 seconds.
- Present the study's data, what was done, the question it answers, and the result. Do not state your role on the slide.
- Leave preprints out of the overview, and keep personal history off the slides. A timeline can sit in the backup for questions; the chair's introduction and the CV cover the rest.
- End the overview with a question that the main part of the talk answers.

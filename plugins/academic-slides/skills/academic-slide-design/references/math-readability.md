# Readable mathematics

Typography lessons from Simon Mongey's quantitative macroeconomics lectures, plus the rule that a formula should be readable at a glance.

## Colored braces

- **Name the meaning.** Write a one-to-three-word label under (or over) a term, in the term's color:
  `\underbrace{\cG{2\Cov(\alpha,\psi)}}_{\cG{\text{sorting}}}`.
- **Plain words, not jargon.**
  - Good: "worker differences", "firm premia", "deviation", "range", "price → demand".
  - Avoid: "estimated", "solved for", "compensated", or an author's name. These say where a number came from, not what it means. That information goes in the notation table.
- **How many.** Usually at most three per equation. A decomposition is the exception: label every term when each term is the point, for example a variance decomposition with worker, firm, sorting, and residual.
- **Width.** Long labels widen an equation. If it spills past its column, shorten the labels or split the equation into two displays. Never let an equation overlap a figure in the next column.
- **Commas.** Do not put a comma after a braced term. The label pushes it far from the formula; separate equations with `\qquad` instead.

## One color per object

- Fix the palette once per deck, by role. For example: blue for the estimate or own effect; orange for the selection, counterpart, or failure; green for probability, "every t at once", or the proposed method; purple for constants.
- Use no more than four colors.
- An object keeps its color on every line and every slide where it appears, and in its notation-table row.

## Notation tables

- Place the table directly under the equation. Each row has the symbol (in its color) and "How it is obtained", for example "estimated from a natural experiment" or "solved from the symmetry condition".
- Do not repeat in the table what a brace already says.

## Statement fidelity

- Write definitions and theorems as the source states them. If the source frames an algorithm a certain way (for example "estimator A is a special case of procedure B"), present that framing. Do not split it into extra layers the source does not have.
- Do not add a sentence that restates what the equation already shows; say it aloud.

## Implementation

- MathJax (Quarto):
  - Define the colour macros in the hidden macro block on the first content slide as CSS classes, `\newcommand{\cB}[1]{\class{deck-b}{#1}}`, and colour the classes in the theme (`.reveal .deck-b { color: $deck-primary; }`), so formulas follow the deck's palette.
  - Never write `#hex` inside `\newcommand`.
  - Define every operator you use, for example `\Var`, `\Cov`, `\argmax`. An undefined macro renders as red text.
- beamer: use the same macro names, `\DeclareMathOperator` for operators, and `\definecolor{name}{RGB}{r,g,b}` with the palette's RGB values (beamer has no stylesheet).
- Aligned derivations: align at `=`. Reveal a derivation one line at a time only when it is read in order; never reveal tables or figures piecemeal.

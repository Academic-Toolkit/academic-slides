# Tables and figures

## Result tables

- **Order rows by the comparison** you want to make, for example from the classical method to the one with the strongest guarantee.
- **Highlight only what you will say aloud.** Usually two or three cells: the failure (accent color, bold), the recommended method or key value (green or primary, bold), and perhaps one comparison number. Use classes (`.hl-bad`, `.hl-good`, `.hl-key`) rather than literal colors, so recoloring the deck recolors the highlights.
- **Three rules, no boxes.** A rule above the header, one below it, and one below the last row, as booktabs' `\toprule`, `\midrule`, and `\bottomrule`; no vertical lines and no boxed cells. Rows between may keep a light separator. The three rules show where the table starts, where the header ends, and where the data end; every other line is one the reader has to ignore. The scaffold theme draws all three (the bottom rule from version 0.2.0, issue #8).
- **Never color rows by category**, for example all baseline methods in grey and all proposed methods in green. It dilutes the highlight and reads as decoration.
- **Under the table, one line saying why the highlight matters**, for example "only this interval keeps its coverage at every step". Then a citation line.
- **Show all methods compared, in one table**, when a reviewer could ask about any of them. Put the methods' definitions and citations on the setting slide, not in the result table.

## Side-by-side tables

- Typical use: a design table next to a "methods compared" table on a simulation setting slide.
- Give both the same number of rows. Leave a visible gap between them (about 2% of the width). Keep cell text short enough not to wrap.
- If one cell contains display-height math (a square root, a fraction), replace it with words. The formula is usually on an earlier slide.

## Decomposition tables

- When an equation decomposes a quantity (for example variance into worker, firm, sorting, and residual), color each table row label like its term in the equation. The table then reads as the equation's numbers.

## Figures

- A result figure takes at least half the slide height. If the source figure has small multi-panel text, crop one panel and note the crop.
- An illustrative figure (made-up parameters that show a mechanism) says "Illustration" in its caption.
- Draw figures in a scripting language you can rerun. Export a PDF for beamer and convert it to SVG for revealjs (`pdftocairo -svg`), so both decks use the same drawing.
- Check labels in the rendered slide: a label must not sit on a line, curve, or another label. Move legends to empty corners, or label curves directly.
- Newspaper or media coverage: a screenshot of the headline next to the model is effective, but keep it in a narrow column so the model stays readable.

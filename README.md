# academic-slides

A Claude Code plugin for research-talk and lecture slides that a seminar audience can read. It has three skills:

| Skill | What it gives the agent |
|---|---|
| `academic-slide-design` | Principles: what a result slide must show, readable mathematics with colored braces, layout and typography rules (each with its reason), table highlighting, simulation and evidence slides, speaker notes, and a pre-delivery checklist. |
| `slide-deck-scaffold` | A ready-to-copy Quarto revealjs template (16:9, palette variables, theorem/takeaway/notation/outline/setting-pair components, sparse-slide scaling and centring) and a beamer mirror with the same palette, macros, and slide titles. |
| `slide-qa` | Node + Playwright checks: content cut or hidden by the footer (on screen and in the PDF print view), equations or tables past the right edge, titles on two lines, sparse slides, words and bullets per slide, MathJax errors (including undefined macros), Quarto–beamer title correspondence, and PDF export. |

## Install

This repository is private. Installing requires GitHub access to `PsychQuant/academic-slides` (for example through `gh auth login`).

```
/plugin marketplace add PsychQuant/academic-slides
/plugin install academic-slides@academic-slides
```

## Requirements

| Tool | Needed for | Tested version |
|---|---|---|
| Quarto | rendering the revealjs deck | 1.9.38 |
| Node | the `slide-qa` scripts | 24.4 (18 or later should work) |
| Playwright + Chromium | the `slide-qa` scripts: `npm i -D playwright && npx playwright install chromium` | 1.54 |
| XeLaTeX + metropolis | the optional beamer mirror | TeX Live 2026 |

## Quick start

```bash
SKILLS=~/.claude/plugins/marketplaces/academic-slides/plugins/academic-slides/skills   # or this repo's plugins/academic-slides/skills
cp -R $SKILLS/slide-deck-scaffold/templates/quarto my-talk
cd my-talk && quarto render

node $SKILLS/slide-qa/scripts/check-layout.mjs --shots        # screenshots in qa/
node $SKILLS/slide-qa/scripts/check-mathjax.mjs
node $SKILLS/slide-qa/scripts/check-density.mjs --qmd talk.qmd
node $SKILLS/slide-qa/scripts/check-fill.mjs
node $SKILLS/slide-qa/scripts/export-pdf.mjs
```

In practice you rarely run these by hand. Ask the agent to start a deck, review a slide, or check the deck before a talk, and the matching skill loads.

## Layout of this repository

```
.claude-plugin/marketplace.json
plugins/academic-slides/
├── .claude-plugin/plugin.json
└── skills/
    ├── academic-slide-design/   SKILL.md, references/
    ├── slide-deck-scaffold/     SKILL.md, templates/quarto/, templates/beamer/
    └── slide-qa/                SKILL.md, scripts/, references/fix-table.md
docs/spectra/                    planning artifacts (Spectra)
```

## Where this came from

The rules and scripts were distilled from preparing a 2026 statistics job talk through many review rounds. Design ideas also draw on Jesse M. Shapiro's "How to Give an Applied Micro Talk" and Simon Mongey's quantitative macroeconomics lecture slides. The density checker was ported from a Python script; on the original talk it produces line-for-line identical output. No talk content, data, or figures are included.

# academic-slides

A Claude Code plugin for research-talk and lecture slides that a seminar audience can read. It has three skills:

| Skill | What it gives the agent |
|---|---|
| `academic-slide-design` | Principles: what a result slide must show, readable mathematics with colored braces, layout and typography rules (each with its reason), table highlighting, simulation and evidence slides, speaker notes, and a pre-delivery checklist. |
| `slide-deck-scaffold` | Four Quarto revealjs templates on one shared theme — research talk, short talk, results report (Traditional Chinese), lecture (Traditional Chinese) — with palette variables, theorem/takeaway/notation/outline/setting-pair components, booktabs table rules, and sparse-slide scaling and centring; a scaffold script that merges personal and project settings; and a beamer mirror of the research talk. |
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
| Quarto | rendering the revealjs deck | 1.10.19 |
| Node | the scaffold and `slide-qa` scripts | 26.3 (18 or later should work) |
| Playwright + Chromium | the `slide-qa` scripts: `npm i -D playwright && npx playwright install chromium` | 1.59.1 |
| XeLaTeX + metropolis | the optional beamer mirror | TeX Live 2026 |

## Quick start

```bash
SKILLS=~/.claude/plugins/marketplaces/academic-slides/plugins/academic-slides/skills   # or this repo's plugins/academic-slides/skills
node $SKILLS/slide-deck-scaffold/scripts/scaffold.mjs --out my-talk --template research-talk
cd my-talk && quarto render

node $SKILLS/slide-qa/scripts/check-layout.mjs --shots        # screenshots in qa/
node $SKILLS/slide-qa/scripts/check-mathjax.mjs
node $SKILLS/slide-qa/scripts/check-density.mjs --qmd talk.qmd
node $SKILLS/slide-qa/scripts/check-fill.mjs
node $SKILLS/slide-qa/scripts/export-pdf.mjs
```

In practice you rarely run these by hand. Ask the agent to start a deck, review a slide, or check the deck before a talk, and the matching skill loads.

## Templates and settings

The templates live in `plugins/academic-slides/skills/slide-deck-scaffold/templates/`, which the repository root links as `templates/` so you can browse them (the link only helps when reading the repository; the installed plugin reads its own folder):

| Template | Language | For |
|---|---|---|
| `research-talk` | English | methods talk with models, a theorem, a simulation, a backup proof (default) |
| `short-talk` | English | 10–15 minute conference talk |
| `results-report` | Traditional Chinese | results in tables, no mathematics |
| `lecture` | Traditional Chinese | a class: objectives, definition, worked example, in-class question, recap |

`templates/quarto/_theme/deck.scss` is the only stylesheet; a template folder holds just `_quarto.yml` and `talk.qmd`.

`scaffold.mjs` merges three layers field by field — project over personal over official:

- **personal**: `~/.claude/.academic-slides/` with `local.json` (`template`, `lang`, `author`, `affiliation`, `footer`), `theme.scss` (palette overrides), and `templates/<name>/` (your own templates);
- **project**: the nearest `.claude/.academic-slides/` above the deck folder, for one project's exceptions (`"author": null` removes the author line). Its template and `theme.scss` are used only with `--trust-project`, because that folder may come from a repository you did not write.

Details, including what a personal template must contain, are in `slide-deck-scaffold/SKILL.md`.

## Layout of this repository

```
.claude-plugin/marketplace.json
plugins/academic-slides/
├── .claude-plugin/plugin.json
└── skills/
    ├── academic-slide-design/   SKILL.md, references/
    ├── slide-deck-scaffold/     SKILL.md, scripts/scaffold.mjs,
    │                            templates/quarto/{_theme,research-talk,short-talk,results-report,lecture}/,
    │                            templates/beamer/
    └── slide-qa/                SKILL.md, scripts/, references/fix-table.md
templates -> plugins/academic-slides/skills/slide-deck-scaffold/templates
tests/                           scaffold tests and template render tests (not shipped)
package.json                     development dependency (Playwright) for the tests
docs/spectra/                    planning artifacts (Spectra)
```

## Development

```bash
npm install                 # Playwright for the render tests
npm test                    # scaffold tests (node:test)
npm run test:render         # scaffold, render, and check every template (needs Quarto)
```

## Where this came from

The rules and scripts were distilled from preparing a 2026 statistics job talk through many review rounds. Design ideas also draw on Jesse M. Shapiro's "How to Give an Applied Micro Talk" and Simon Mongey's quantitative macroeconomics lecture slides. The density checker was ported from a Python script; on the original talk it produces line-for-line identical output. No talk content, data, or figures are included.

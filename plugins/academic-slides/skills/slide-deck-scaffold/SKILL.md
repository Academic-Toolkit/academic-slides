---
name: slide-deck-scaffold
description: Start a new deck from one of four Quarto revealjs templates on one shared theme — a research talk, a 10–15 minute short talk, a Traditional Chinese results report, or a Traditional Chinese lecture (16:9, palette variables, MathJax colour macros, theorem/takeaway/notation/outline/setting-pair components, booktabs table rules, sparse-slide scaling and centring) — with personal and project settings (author, affiliation, language, footer, default template, palette, own templates) merged field by field, and a beamer mirror of the research talk. Use when creating a new slide deck, converting a talk to Quarto, choosing a template, setting a default author or palette, adding a personal template, adding a beamer version, or recolouring a deck for another institution.
---

# Slide deck scaffold

## Templates

| Template | Language | For |
|---|---|---|
| `research-talk` | English | methods talk: models, a theorem, a simulation setting and result, a backup proof (the default) |
| `short-talk` | English | 10–15 minutes: the question with the answer up front, one approach slide, two results, a conclusion |
| `results-report` | Traditional Chinese | results built on tables, no mathematics: data and rating method, main result, agreement, limits, next steps |
| `lecture` | Traditional Chinese | outline, learning objectives, a definition, a worked example, an in-class question, a recap |

`templates/quarto/_theme/deck.scss` is the only stylesheet. Each template folder holds just `_quarto.yml` and `talk.qmd`; the scaffold copies the current theme into every new deck, so a fix to the theme reaches every template. `templates/beamer/talk.tex` mirrors `research-talk`. The repository root has a `templates` link to this skill's `templates/` folder for browsing.

The demo content is neutral (textbook models, made-up placeholders such as `x.xx`). Replace it, and keep a pattern's structure only where the talk needs it. For the reasoning behind the patterns, see the `academic-slide-design` skill.

## Start a deck

```bash
node <this skill>/scripts/scaffold.mjs --out my-talk                       # your default template (research-talk if none)
node <this skill>/scripts/scaffold.mjs --out my-talk --template lecture --title "第 3 講：信度"
node <this skill>/scripts/scaffold.mjs --out my-talk --dry-run             # print what would be written; write nothing
node <this skill>/scripts/scaffold.mjs --list                              # every template and the layer it comes from
cd my-talk && quarto render                                                # → talk.html
```

The beamer mirror of `research-talk` is not copied by the script; add it by hand when you want one:

```bash
mkdir my-talk/beamer && cp <this skill>/templates/beamer/talk.tex my-talk/beamer/
```

The script prints which settings files it read, each field's value and the layer it came from, and the theme list. It writes only into a folder that does not exist or is empty, and needs only Node. Exit status: 0 done, 1 refused (settings, template, or folder problem), 2 usage error.

## Settings: official, personal, project

| Layer | Where | Holds |
|---|---|---|
| official | the chosen template | its own front matter and `_quarto.yml` |
| personal | `~/.claude/.academic-slides/` | `local.json`, `theme.scss`, `templates/<name>/` |
| project | the nearest `.claude/.academic-slides/` above the deck folder, not counting the one in your home folder | the same three |

Fields merge one by one: project over personal over official, with `--template` and `--title` over all three. Only the nearest project folder is read. `local.json` accepts exactly these fields, each a string or `null` (`null` removes the field from the deck); any other field is reported and ignored:

| Field | Becomes |
|---|---|
| `template` | the template to start from |
| `lang` | `lang:` in `talk.qmd` (`en`, `zh-TW`, …) |
| `author` | `author:` |
| `affiliation` | `institute:` |
| `footer` | `footer:` in `_quarto.yml` |

```jsonc
// ~/.claude/.academic-slides/local.json — your defaults
{ "author": "A. Person", "affiliation": "Some Institute", "lang": "zh-TW", "template": "research-talk" }

// <project>/.claude/.academic-slides/local.json — this project's exceptions
{ "template": "results-report", "author": null, "affiliation": null }
```

Settings values are plain text: `<`, `{`, `[`, `]`, `&`, backslashes, backticks, and control characters (U+0000–U+001F, U+007F) are refused, and `lang` must be a language tag such as `en` or `zh-TW` (Quarto looks it up as a file name), because Quarto reads these values as markdown (links and images would fetch remote addresses; braces would run shortcodes such as `{{< env … >}}`; character references such as `&#123;` and backslash escapes are decoded after the check, so they would rebuild a refused character).

### Theme overrides

A layer's `theme.scss` is copied into the deck as `theme/personal.scss` or `theme/project.scss` and listed after `_theme/deck.scss`. Every variable `deck.scss` sets in `scss:defaults` is `!default` — the five palette colours, the background, body, link and heading colours, the font family, the root and heading sizes, and the heading weight — so an override only names what it changes. Write each value with `!default` too:

```scss
/*-- scss:defaults --*/
$deck-primary: #8b0000 !default;
$font-family-sans-serif: "Noto Serif TC", serif !default;
$presentation-font-size-root: 30px !default;

/*-- scss:rules --*/
.reveal h2 { letter-spacing: .01em; }
.reveal .eyebrow { color: $deck-accent; }
```

Why `!default` in a layer: Quarto compiles the `scss:defaults` of the theme list in reverse, so `theme/project.scss` comes first, then `theme/personal.scss`, then `_theme/deck.scss`. With `!default` the first value set wins, which gives project over personal over official. With a plain assignment the last one wins, so a personal value would silently beat the project's (measured with Quarto 1.10.19, issue #14). `scss:rules` run the other way round, in list order, so a project rule already comes after a personal one and wins.

Inside `scss:defaults` an override cannot refer to a `$deck-*` variable (write `#8b0000`, not `$deck-primary`): Quarto compiles a later file's defaults before `deck.scss` defines them. It rarely needs to: the body, link and heading colours are derived from the palette in `deck.scss`, so changing `$deck-primary` moves them too. In `scss:rules`, which comes after every file's defaults, `$deck-*` can be used freely, as in the `.eyebrow` rule above. A deck's own components (classes the official theme does not have) belong in that `scss:rules` section, so the layer holds only what differs from the official theme.

Mathematics takes the palette too: `\cB`, `\cO`, `\cG`, and `\cP` wrap a term in the classes `deck-b`, `deck-o`, `deck-g`, and `deck-p`, which `deck.scss` colours with `$deck-primary`, `$deck-accent`, `$deck-green`, and `$deck-purple` (issue #14). The beamer mirror has no stylesheet: a layer's palette does not reach it (issue #21), so recolour its four `\definecolor{deck?}{RGB}{…}` lines by hand.

Never copy the whole `deck.scss` into a template or a layer. A template's own `deck.scss` or `_theme/` is ignored with a warning.

### Personal and project templates

`templates/<name>/` in a layer adds a template, or replaces an official one of the same name: project over personal over official, and the script says what it shadowed. Names are lower-case letters, digits, and hyphens. A template needs `talk.qmd` and a `_quarto.yml` with one-line `theme:` and `footer:` entries; keep `title`, `author`, `institute`, and `lang` on one line each in the front matter, because the script rewrites those lines. Symbolic links inside a template are skipped, and so is a template file on a path the scaffold writes itself (`theme/personal.scss`, `theme/project.scss`, anything under `_theme`) or on a case variant of one (`Theme/Personal.scss` is the same file on a macOS disk), with a warning — for example a template made by copying a finished deck.

### Trust

The project layer is found by walking up from the deck folder, so it can come from a repository you did not write, and rendering a template runs whatever it contains. A project layer's template and `theme.scss` are therefore used only with `--trust-project`. **An agent never passes this flag on its own judgment**: show the user the files the script names, and pass the flag only after the user approves. Reading a template is not a reason to trust it — the text you would be judging was written by whoever wrote the repository. Its `local.json` needs no flag. A project settings folder that belongs to another user is refused, and where the system cannot report ownership, the whole project layer needs `--trust-project`. A `local.json` or `theme.scss` that is itself a symbolic link is refused, as is a template's `talk.qmd` or `_quarto.yml`, and a template folder must resolve inside its layer's `templates/` folder. Links in the folders above those files are followed, so a `.claude/.academic-slides` that is a link is read where it points (only the plain-text settings come through without the flag). Personal and official templates need no flag.

## After scaffolding

1. **Front matter**: `title`, `subtitle`, `author`, `institute`, `date` in `talk.qmd`; `footer` in `_quarto.yml`. The settings above fill the ones you set; edit the rest by hand. In the beamer file: `\title`, `\author`, `\date`, and the `frame footer`.
2. **Palette**: for every deck, put the five `$deck-*` values in your personal `theme.scss`; for one deck, edit the deck's `theme/personal.scss` (or `theme/project.scss`) when it has one, because a layer override wins over `deck.scss`; otherwise change the five values at the top of the deck's own `_theme/deck.scss` (that copy belongs to the deck). Formulas follow the palette through the colour macros; only the beamer file needs its four `\definecolor{deck?}{RGB}{…}` lines changed to the same RGB values.
3. **Macros**: add any macro the talk uses to the hidden MathJax block and to the beamer preamble under the same name. Never write `#hex` inside a `\newcommand` body; `#` is the parameter character, and every formula that uses the macro breaks.
4. **Slides**: one `##` per slide, `#` for section dividers, and a final `# Backup` section. Everything after `# Backup` (Quarto) or `\appendix` (beamer) is excluded from the density limits and the title comparison. Keep that divider in English in Chinese decks too: `check-density` recognises only `Backup` (issue #9).

## Components (Quarto class → beamer counterpart)

| Quarto | beamer | Use |
|---|---|---|
| `::: {.theorem}` + `[Title]{.thm-title}` | `block` | definition, assumption, theorem |
| `::: {.takeaway}` | `\takeaway{}` | one-sentence finding under a result |
| `::: {.punchline}` | `\punchline{}` | section-level conclusion |
| `::: {.algo}` with `<br/>` and `&emsp;` | `\algobox{}` | algorithm |
| `::: {.notation}` + table | `tabular` | symbols with "How it is obtained" |
| `::: {.source}` | `\sourceline{}` | citations only, never file paths |
| `::: {.outline}` + `[1]{.onum}` | `tabular` | outline, section titles only |
| `:::: {.columns .setting-pair}` | two `column`s | design table next to methods-compared table |
| `[x]{.hl-key}` `[x]{.hl-good}` `[x]{.hl-bad}` | `\hlkey` `\hlgood` `\hlbad` | highlight only the numbers you discuss |
| `\cB{}` `\cO{}` `\cG{}` `\cP{}` | same | one colour per object, in formula and notation table |
| `{.roomy-1}` `{.roomy-2}` `{.roomy-3}` on a slide title | `\large` on the frame | sparse slide: body scaled 1.06, 1.12, or 1.18 times |
| `{.vc}` on a slide title | `\vfill` around the body | centre a sparse body between title and footer |

Choose `roomy` and `vc` from the numbers `check-fill.mjs` reports (skill `slide-qa`), not by eye.

## Speaker notes

Every main-body slide carries a notes block with a Purpose and a Script; the Cue is optional:

```markdown
::: {.notes}
**Purpose**: what this slide must achieve. (about 1 min)

**Script**: "the sentences you will say, in your own voice."

**Cue**: what to point at or click; how to answer the likely question.
:::
```

The minutes across all slides should add up to the time slot minus a buffer (for example 45 minutes minus 2). Press `s` in the browser to open the speaker view. You can use other headings, as long as the deck uses one set throughout; the Chinese templates use 目的／講／操作.

## Keeping the beamer mirror in sync

- Quarto is the content master. Edit `talk.qmd` (from `research-talk`) first, then mirror the change in the beamer file.
- Main-body titles must match one to one in order. `check-density.mjs --qmd talk.qmd --tex beamer/talk.tex` reports the first mismatch.
- Compile with XeLaTeX twice (the second run fixes page numbers). Require 0 errors and 0 overfull boxes. Fix overfull frames with `\small`, `\footnotesize`, or `\resizebox{\linewidth}{!}{…}` on tables, never by deleting content that the Quarto deck has.
- If the project lives in a cloud-synced folder (Dropbox, iCloud), copy it to a local temporary folder, compile there, and copy the PDF back. Sync clients can corrupt auxiliary files mid-compile.
- The beamer template uses the metropolis theme. If it is not installed, `\usetheme{metropolis}` fails; install it (`tlmgr install beamertheme-metropolis`) or switch to another theme and keep the macros.

## After every round of edits

Run the checks in the `slide-qa` skill: layout, MathJax, density with the title comparison, and fill. Then look at the screenshots.

## A deck made earlier

A deck keeps the copy of the theme it was created with: `_theme/deck.scss`, or `theme/deck.scss` in a deck made before version 0.2.0. A later fix to the plugin's theme (the PDF print rules from issue #5, the table bottom rule and `.vc` centring from issue #8, the overridable defaults, formula colour classes and `.vc` table margins from issue #14) does not reach it. A deck made before 0.3.0 keeps its `\definecolor` macros, which still work; if you copy the new `\class` macros into such a deck, copy the `.deck-b` … `.deck-p` rules from the theme too, or the formulas lose their colour without any error; copy the rules from this skill's `templates/quarto/_theme/deck.scss`. Issue #10 tracks a command that does this.

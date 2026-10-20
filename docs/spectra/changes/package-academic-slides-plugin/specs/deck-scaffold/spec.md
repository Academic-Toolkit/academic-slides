## Purpose

Give an agent a ready-to-copy starting point for a Quarto revealjs deck and a mirrored beamer deck that share colors, components, and slide titles.

## ADDED Requirements

### Requirement: Quarto template renders and passes the checks

`slide-deck-scaffold/templates/quarto/` SHALL contain `_theme/deck.scss`, the only stylesheet, and four template folders, `research-talk`, `short-talk`, `results-report`, and `lecture`, each holding `_quarto.yml` and `talk.qmd` and no copy of `deck.scss` (issue #8). Every main-body slide of every template SHALL carry speaker notes with a purpose and a script (a cue is optional). `research-talk/talk.qmd` SHALL demonstrate an outline, a research-result slide, a theorem slide, a bridge slide, a simulation setting slide with side-by-side tables, a result table with highlighted key numbers, a discussion slide, and a backup section. `short-talk` SHALL demonstrate a 10–15 minute talk: the question, one approach slide, two result slides, a conclusion, and a backup. `results-report` SHALL demonstrate a Traditional Chinese results report built on tables with no mathematics: the question, the data and rating method, a main result table, an agreement table, limitations, next steps, and a backup. `lecture` SHALL demonstrate a Traditional Chinese lecture: an outline, learning objectives, a definition, a worked example, an in-class question, a recap, and a backup. `research-talk` and `short-talk` SHALL declare `lang: en`; `results-report` and `lecture` SHALL declare `lang: zh-TW`.

#### Scenario: Template renders cleanly

- **WHEN** `scaffold.mjs` creates a deck from each of the four templates in a temporary directory and `quarto render` runs there
- **THEN** `talk.html` is produced, and check-layout (screen and PDF print view), check-density, and check-mathjax all exit with status 0 on it

#### Scenario: Full centred slide in the PDF

- **WHEN** a `{.vc}` slide whose body nearly fills the slide is exported with `export-pdf.mjs`
- **THEN** its last line stays above the footer on the PDF page as it does on screen, and the slide number is visible, because `_theme/deck.scss` pins the `.vc` height and footer reserve and drops the footer backing under `html.print-pdf` (issue #5)

#### Scenario: Centred slide that starts with hidden macros or holds a lone table

- **WHEN** a `{.vc}` slide begins with the hidden MathJax macro block, or its only visible body element is a table, and the deck is rendered
- **THEN** the space above the body is at least half the space below it, because `_theme/deck.scss` gives the auto top margin to the first element after a hidden block and, only for a table that is the slide's only visible body element (speaker notes do not count), removes the auto bottom margin reveal sets on tables (found in issue #8, narrowed in issue #14)

#### Scenario: A table between a lead and a source line keeps its margin

- **WHEN** a `{.vc}` slide holds a lead paragraph, a table, and a source line, and the deck is rendered
- **THEN** the table keeps the bottom margin reveal gives it, so the source line does not touch the table (issue #14)

### Requirement: Palette is a single set of variables

`_theme/deck.scss` SHALL define the palette as `$deck-primary`, `$deck-accent`, `$deck-green`, `$deck-purple`, and `$deck-ink` at the top, each with `!default`, and every component rule SHALL reference these variables rather than literal colors. Every other variable it sets in `scss:defaults` (background, body, link and heading colours, font family, root and heading sizes, heading weight) SHALL also carry `!default`, so a settings layer's `theme.scss` can override any of them (issue #14).

#### Scenario: Recolor by editing five lines

- **WHEN** the five palette variables are changed and the template is rendered again
- **THEN** titles, theorem bars, takeaway boxes, outline numbers, and table headers all take the new colors

#### Scenario: Recolor from a personal theme

- **WHEN** `~/.claude/.academic-slides/theme.scss` sets `$deck-primary: #8b0000;` in its `scss:defaults` section and a deck scaffolded afterwards is rendered
- **THEN** the slide titles of that deck render in `rgb(139, 0, 0)`, while `_theme/deck.scss` in the deck is a byte-for-byte copy of the plugin's

#### Scenario: Fonts and sizes from a personal theme

- **WHEN** `~/.claude/.academic-slides/theme.scss` sets `$font-family-sans-serif: "Times New Roman", serif;` and `$presentation-font-size-root: 30px;` in its `scss:defaults` section and a deck scaffolded afterwards is rendered
- **THEN** the computed font family of the slides begins with `"Times New Roman"` and the computed font size of `.reveal` is `30px`

### Requirement: Mathematics colours follow the palette

The colour macros `\cB`, `\cO`, `\cG`, and `\cP` in every Quarto template that defines them SHALL wrap their argument in the CSS classes `deck-b`, `deck-o`, `deck-g`, and `deck-p` (MathJax `\class`), and `_theme/deck.scss` SHALL colour those classes with `$deck-primary`, `$deck-accent`, `$deck-green`, and `$deck-purple`. The Quarto templates SHALL NOT define the palette a second time with `\definecolor`; the beamer mirror keeps its `\definecolor` lines with the official palette's RGB values (issue #14).

#### Scenario: A formula takes the personal palette

- **WHEN** `~/.claude/.academic-slides/theme.scss` sets `$deck-primary: #8b0000;` and a deck scaffolded afterwards from `research-talk` is rendered
- **THEN** a term written `\cB{…}` renders in `rgb(139, 0, 0)` and check-mathjax reports no errors

### Requirement: Tables draw three rules

`_theme/deck.scss` SHALL draw a 2px rule in `$deck-ink` above the header row, a 1.5px rule below it, and a 2px rule in `$deck-ink` below the last body row, matching booktabs `\toprule`, `\midrule`, and `\bottomrule` in the beamer mirror. Rows between keep a light 1px separator.

#### Scenario: Bottom rule present

- **WHEN** a deck scaffolded from `results-report` is rendered and the last body cell of its first table is inspected
- **THEN** its computed `border-bottom-width` is `2px` and its `border-bottom-color` equals the computed color of `$deck-ink`, while a cell of an earlier body row has a `1px` bottom border

### Requirement: Beamer mirror compiles with matching titles

`slide-deck-scaffold/templates/beamer/talk.tex` SHALL compile with XeLaTeX, define the same RGB palette and the macros `\cB`, `\cO`, `\cG`, `\cP`, `\takeaway`, `\sourceline`, `\algobox`, and `\bibent`, and its main-body frame titles SHALL match the main-body slide titles of `research-talk/talk.qmd` one to one. The other three templates have no beamer mirror.

#### Scenario: Beamer compiles and titles match

- **WHEN** `talk.tex` is compiled twice with XeLaTeX and check-density runs with both files
- **THEN** the log has no errors and no overfull boxes, and check-density reports that all main-body titles match

### Requirement: Scaffold merges three settings layers

`slide-deck-scaffold/scripts/scaffold.mjs` SHALL build a deck from three layers, merged field by field with precedence project > personal > official. The official layer is the chosen template's own front matter and `_quarto.yml`. The personal layer is `~/.claude/.academic-slides/` (from the home directory reported by the operating system). The project layer is the nearest `.claude/.academic-slides/` folder found by walking up from the deck folder, not checking the home directory itself; only the nearest one is used. In each layer, `local.json` SHALL accept exactly these fields: `template`, `lang`, `author`, `affiliation`, and `footer`, each a string or `null`; `null` removes the field from the deck. `--template` and `--title` on the command line override every layer. `author`, `affiliation` (written as Quarto `institute`), `lang`, and the title are written into the front matter of `talk.qmd`; `footer` into `_quarto.yml`. An unknown field is reported as a warning and ignored; a value of another type, or a `local.json` that is not a JSON object, stops the script with status 1 before anything is written.

#### Scenario: Project overrides personal, null removes

- **WHEN** the personal `local.json` sets `author` to `"A. Person"` and `affiliation` to `"Some Institute"`, the project `local.json` sets `affiliation` to `null` and `template` to `"results-report"`, and the scaffold runs with `--out` inside the project
- **THEN** the deck is built from `results-report`, its `talk.qmd` front matter has `author: "A. Person"` and no `institute` line, and the script prints, for each field, the layer it came from

#### Scenario: Invalid settings stop before writing

- **WHEN** the project `local.json` sets `author` to `42`
- **THEN** the script names the file and the field, exits with status 1, and the deck folder is not created

### Requirement: Same-name templates resolve project, personal, official

When looking up a template name, the scaffold SHALL use `templates/<name>/` of the project layer, else of the personal layer, else the official `templates/quarto/<name>/`, and SHALL print which one it used and which same-name templates it shadowed. A template folder SHALL contain `talk.qmd` and a `_quarto.yml` with a `theme:` line; otherwise the script stops with status 1 naming the folder. A template's own `deck.scss` or `_theme/` folder is not copied: the script prints a warning and copies the plugin's `_theme/deck.scss` instead. Symbolic links inside a template are skipped with a warning. Template names SHALL match `^[a-z0-9][a-z0-9-]*$`. `--list` prints every template name with its layer and marks shadowed ones.

#### Scenario: Personal template shadows the official one

- **WHEN** `~/.claude/.academic-slides/templates/short-talk/` exists with `talk.qmd`, `_quarto.yml`, and its own `theme/deck.scss`, and the scaffold runs with `--template short-talk`
- **THEN** the deck is built from the personal folder, the output says the official `short-talk` was shadowed, a warning names the ignored `deck.scss`, and the deck's `_theme/deck.scss` is the plugin's

### Requirement: Scaffold writes only into an empty folder

The scaffold SHALL refuse with status 1 when `--out` names a non-empty folder or a file, and SHALL write nothing with `--dry-run`, which prints the same resolution report. The written `_quarto.yml` SHALL list its theme as `[default, _theme/deck.scss]` followed by `theme/personal.scss` and `theme/project.scss` for the layers that have a `theme.scss`, which are copied there. A template file on a path the scaffold writes itself (one of those overlay paths, or anything under `_theme`), or on a variant of such a path that differs only in letter case or Unicode form, SHALL be skipped with a warning before anything is written, so such a collision never leaves a partly written deck, also on a file system that ignores case.

#### Scenario: Existing deck is not overwritten

- **WHEN** `--out` names a folder that already contains `talk.qmd`
- **THEN** the script exits with status 1, names the folder, and leaves its contents unchanged

#### Scenario: Template copied from a finished deck

- **WHEN** a personal template contains `theme/personal.scss` (copied from a deck scaffolded earlier) and the personal layer has a `theme.scss`
- **THEN** the dry run and the real run both print a warning naming `theme/personal.scss`, the real run exits with status 0, and the deck's `theme/personal.scss` is the personal layer's `theme.scss`

#### Scenario: Dry run writes nothing

- **WHEN** the scaffold runs with `--dry-run` and an `--out` that does not exist
- **THEN** it prints the layers, the template, the merged fields, and the theme list, exits with status 0, and the folder still does not exist

### Requirement: Settings layers cannot leak local files or run code without consent

The project layer is discovered by walking up from the deck folder, so it can come from a repository the user did not write; trust is decided by where a file comes from, not by scanning its content, because no content scan can list every way a Quarto document runs code. The scaffold SHALL therefore refuse with status 1, before writing anything: when a `local.json` or `theme.scss` read from a settings layer, or a template's `talk.qmd` or `_quarto.yml`, is a symbolic link; when a template folder resolves outside its layer's `templates/` folder; when the project settings folder belongs to another user, or, where the system cannot report who owns it, when the project layer is used at all without `--trust-project`; when `lang` is not a language tag (Quarto looks it up as a file name); when a settings value contains `<`, `{`, `[`, `]`, `&`, a backslash, a backtick, or a control character U+0000–U+001F or U+007F (Quarto reads these values as markdown, so they cannot carry HTML, links or images that fetch a remote address, Quarto shortcodes such as `{{< env … >}}`, attribute spans, or inline code; `&` and the backslash are refused because Pandoc decodes character references and backslash escapes after the check, which would rebuild any refused character); and when the deck would use the project layer's template or `theme.scss` without `--trust-project`. That refusal SHALL tell the reader to show the named files to the user and to pass `--trust-project` only with the user's approval. With `--trust-project`, each project-layer file used is printed as a warning. The project layer's `local.json` needs no flag. Personal and official templates need no flag.

#### Scenario: Project template needs consent

- **WHEN** the project layer has `templates/research-talk/` (with or without a `pre-render` hook) and the scaffold runs without `--trust-project`
- **THEN** it names that folder, tells the reader to ask the user before passing `--trust-project`, exits with status 1, and the deck folder is not created; with `--trust-project` the deck is written

#### Scenario: Linked talk.qmd

- **WHEN** a personal template's `talk.qmd` is a symbolic link to a file elsewhere
- **THEN** the scaffold exits with status 1 naming the link, and nothing is written

#### Scenario: Shortcode in a setting

- **WHEN** a project `local.json` sets `footer` to `"{{< env GITHUB_TOKEN >}}"`
- **THEN** the scaffold names the file and the field, exits with status 1, and nothing is written

#### Scenario: Character reference in a setting

- **WHEN** a project `local.json` sets `author` to a shortcode spelled with HTML character references for its braces and angle brackets
- **THEN** the scaffold names the file and the field, exits with status 1, and nothing is written

## Purpose

Package the academic slide workflow as one Claude Code plugin in a standalone repository that follows the PsychQuant single-plugin layout.

## ADDED Requirements

### Requirement: Repository layout and manifests

The repository SHALL contain `.claude-plugin/marketplace.json` at its root listing exactly one plugin named `academic-slides` with source `./plugins/academic-slides`, and the plugin directory SHALL contain `.claude-plugin/plugin.json` and the three skills `academic-slide-design`, `slide-deck-scaffold`, and `slide-qa`, each with a `SKILL.md` that has `name` and `description` frontmatter.

The repository root SHALL also hold `templates`, a symbolic link to `plugins/academic-slides/skills/slide-deck-scaffold/templates`, so the templates are visible on opening the repository; the plugin itself reads its templates only from its own folder (issue #8).

#### Scenario: Strict validation passes

- **WHEN** `claude plugin validate --strict` runs on the repository root and on `plugins/academic-slides`
- **THEN** both runs exit with status 0

#### Scenario: Root entry reaches the templates

- **WHEN** `templates/quarto/_theme/deck.scss` is read through the root `templates` link
- **THEN** it is the same file as `plugins/academic-slides/skills/slide-deck-scaffold/templates/quarto/_theme/deck.scss`

### Requirement: No project-specific content

The repository SHALL NOT contain talk content, institution colors, or file names from the project it was derived from, except in the README section that credits the source.

#### Scenario: Project strings absent

- **WHEN** the repository is searched case-insensitively for `ncku`, `成大`, and `econblue`, excluding `README.md` and `docs/spectra/`
- **THEN** no match is found

### Requirement: Private distribution under PsychQuant

The repository SHALL be published as the private GitHub repository `PsychQuant/academic-slides` on branch `main`, and the README SHALL give the install commands `/plugin marketplace add PsychQuant/academic-slides` and `/plugin install academic-slides@academic-slides`.

#### Scenario: Remote is private

- **WHEN** `gh repo view PsychQuant/academic-slides --json visibility` runs after the push
- **THEN** it reports `PRIVATE` and the default branch contains `plugins/academic-slides/.claude-plugin/plugin.json`

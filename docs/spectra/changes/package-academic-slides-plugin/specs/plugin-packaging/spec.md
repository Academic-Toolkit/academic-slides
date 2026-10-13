## Purpose

Package the academic slide workflow as one Claude Code plugin in a standalone repository that follows the PsychQuant single-plugin layout.

## ADDED Requirements

### Requirement: Repository layout and manifests

The repository SHALL contain `.claude-plugin/marketplace.json` at its root listing exactly one plugin named `academic-slides` with source `./plugins/academic-slides`, and the plugin directory SHALL contain `.claude-plugin/plugin.json` and the three skills `academic-slide-design`, `slide-deck-scaffold`, and `slide-qa`, each with a `SKILL.md` that has `name` and `description` frontmatter.

#### Scenario: Strict validation passes

- **WHEN** `claude plugin validate --strict` runs on the repository root and on `plugins/academic-slides`
- **THEN** both runs exit with status 0

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

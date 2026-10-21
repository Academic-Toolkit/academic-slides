#!/usr/bin/env bash
# Render every official template through scaffold.mjs and run the slide-qa checks on it (issue #8).
# Needs quarto on PATH and `npm install` at the repository root (Playwright). Run: npm run test:render
# Each deck is built inside its own temporary HOME, with HOME pointed there: the personal layer is empty, and the
# walk up for a project layer stops at that HOME, so no settings folder above the temporary area can leak in.
set -uo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
SKILLS="$ROOT/plugins/academic-slides/skills"
SCAFFOLD="$SKILLS/slide-deck-scaffold/scripts/scaffold.mjs"
TEMPLATES_DIR="$SKILLS/slide-deck-scaffold/templates"
QA="$SKILLS/slide-qa/scripts"
PROBE="$ROOT/tests/style-probe.mjs"

[ -d "$ROOT/node_modules/playwright" ] || { echo "Playwright missing: run npm install in $ROOT" >&2; exit 2; }
command -v quarto >/dev/null 2>&1 || { echo "quarto not found on PATH" >&2; exit 2; }

WORK=$(mktemp -d "${TMPDIR:-/tmp}/render-templates.XXXXXX")
trap 'rm -rf "$WORK"' EXIT
FAIL=0
fail() { echo "  ✗ $*"; FAIL=1; }

# scaffold <home> <deck> [scaffold args...]; then render it
build() {
  local home=$1 deck=$2; shift 2
  mkdir -p "$home"
  HOME="$home" node "$SCAFFOLD" --out "$deck" "$@" >"$WORK/scaffold.log" 2>&1 || { fail "scaffold: $(tail -1 "$WORK/scaffold.log")"; return 1; }
  (cd "$deck" && quarto render >"$deck.render.log" 2>&1) || { fail "quarto render failed"; tail -15 "$deck.render.log"; return 1; }
}

check() { # check <label> <command...>, run inside $DECK
  local label=$1; shift
  local out
  out=$(cd "$DECK" && "$@" 2>&1) && echo "  ✓ $label" || { fail "$label"; echo "$out" | sed 's/^/      /' | head -20; }
}

for TPL in $(find "$TEMPLATES_DIR/quarto" -mindepth 1 -maxdepth 1 -type d ! -name '_*' -exec basename {} \; | sort); do
  echo "== $TPL"
  DECK="$WORK/home-$TPL/decks/$TPL"   # under its HOME: the project-layer walk stops there
  build "$WORK/home-$TPL" "$DECK" --template "$TPL" || continue
  check "check-layout (screen and PDF print view)" node "$QA/check-layout.mjs" --out "$WORK/qa-$TPL"
  check "check-mathjax" node "$QA/check-mathjax.mjs"
  if [ "$TPL" = research-talk ]; then
    check "formulas take the official palette" node "$PROBE" --html talk.html --math-color 'rgb(31, 78, 121)'
    check "check-density with the beamer title comparison" node "$QA/check-density.mjs" --qmd talk.qmd --tex "$TEMPLATES_DIR/beamer/talk.tex"
  else
    check "check-density" node "$QA/check-density.mjs" --qmd talk.qmd
  fi
  FILL=$(cd "$DECK" && node "$QA/check-fill.mjs" 2>&1); FILL_RC=$?
  # check-fill exits 0 whenever it printed its report; anything else means it did not run, which is a failure
  if [ "$FILL_RC" -ne 0 ]; then fail "check-fill exited $FILL_RC"; echo "$FILL" | sed 's/^/      /' | head -20
  elif grep -q '→ roomy-' <<<"$FILL"; then fail "check-fill lists sparse slides with no roomy or vc class"; grep '→ roomy-' <<<"$FILL" | sed 's/^/      /'
  else echo "  ✓ check-fill: no sparse slide without roomy or vc"; fi
  check "table rules" node "$PROBE" --html talk.html --table-rule
  check "centred {.vc} slides" node "$PROBE" --html talk.html --vc-centred
  # results-report has lead, table, source slides: the source line sits right below its table (issue #14)
  [ "$TPL" = results-report ] && check "source lines sit right below their tables" node "$PROBE" --html talk.html --source-gap 12-40
done

echo "== personal theme override"
OHOME="$WORK/home-override"
mkdir -p "$OHOME/.claude/.academic-slides"
# Every scss:defaults value in deck.scss is !default, so a layer can set fonts and sizes as well as the palette,
# and the colour macros take the palette through CSS classes (issue #14)
# Layers write !default, as the SKILL recommends, so that a project layer can beat a personal one (verify round 1)
cat >"$OHOME/.claude/.academic-slides/theme.scss" <<'SCSS'
/*-- scss:defaults --*/
$deck-primary: #8b0000 !default;
$font-family-sans-serif: "Times New Roman", serif !default;
$presentation-font-size-root: 30px !default;
$body-bg: #fafaf7 !default;
SCSS
DECK="$OHOME/decks/override"
if build "$OHOME" "$DECK" --template research-talk; then
  check "slide titles take the personal palette" node "$PROBE" --html talk.html --title-color 'rgb(139, 0, 0)'
  check "slides take the personal font" node "$PROBE" --html talk.html --font-family 'Times New Roman'
  check "slides take the personal root size" node "$PROBE" --html talk.html --root-size 30px
  check "formulas take the personal palette" node "$PROBE" --html talk.html --math-color 'rgb(139, 0, 0)'
  check "every formula colour class takes the palette" node "$PROBE" --html talk.html --class-colors 'deck-b=rgb(139, 0, 0);deck-o=rgb(192, 80, 77);deck-g=rgb(46, 125, 91);deck-p=rgb(123, 79, 157)'
  check "footer backing follows the personal background" node "$PROBE" --html talk.html --footer-bg 'rgba(250, 250, 247, 0.92)'
  cmp -s "$DECK/_theme/deck.scss" "$TEMPLATES_DIR/quarto/_theme/deck.scss" && echo "  ✓ _theme/deck.scss is the plugin's copy" || fail "_theme/deck.scss differs from the plugin's"
fi

echo "== personal and project layers"
# Both layers set the same variables with !default: the project layer is compiled first and wins, as documented
PHOME="$WORK/home-layers"
mkdir -p "$PHOME/.claude/.academic-slides" "$PHOME/proj/.claude/.academic-slides"
printf '/*-- scss:defaults --*/\n$deck-primary: #8b0000 !default;\n$presentation-font-size-root: 30px !default;\n' >"$PHOME/.claude/.academic-slides/theme.scss"
printf '/*-- scss:defaults --*/\n$deck-primary: #006400 !default;\n$presentation-font-size-root: 24px !default;\n$presentation-heading-color: #123456 !default;\n' >"$PHOME/proj/.claude/.academic-slides/theme.scss"
DECK="$PHOME/proj/decks/layers"
if build "$PHOME" "$DECK" --template research-talk --trust-project; then
  check "project heading colour beats the derived one" node "$PROBE" --html talk.html --title-color 'rgb(18, 52, 86)'
  check "project root size beats personal" node "$PROBE" --html talk.html --root-size 24px
  check "project palette reaches formulas" node "$PROBE" --html talk.html --class-colors 'deck-b=rgb(0, 100, 0)'
fi

echo "== centred slides: lead, table, source; notes before a lone table"
FHOME="$WORK/home-fixture"
DECK="$FHOME/decks/fixture"
if build "$FHOME" "$DECK" --template results-report; then
  cat >>"$DECK/talk.qmd" <<'QMD'

## 導言、表格、出處 {.vc}

兩位評分者的一致度，依題型分列。

| 題型 | 一致度 |
|------|--------|
| 選擇 | .91 |
| 簡答 | .78 |
| 申論 | .64 |

::: {.source}
資料來源：示意資料。
:::

## 備註寫在表格前 {.vc}

::: {.notes}
Fixture: speaker notes written before a lone table.
:::

| 指標 | 值 |
|------|----|
| 一 | 1 |
| 二 | 2 |
QMD
  (cd "$DECK" && quarto render >"$DECK.render.log" 2>&1) || { fail "quarto render failed (fixture)"; tail -15 "$DECK.render.log"; }
  check "lead, table, source: the source line stays with its table" node "$PROBE" --html talk.html --source-gap 12-40
  check "centred {.vc} slides, including both fixtures" node "$PROBE" --html talk.html --vc-centred
fi

echo "== probe argument checks"
node "$PROBE" --html "$DECK/talk.html" --source-gap abc >/dev/null 2>&1; [ $? -eq 2 ] && echo "  ✓ malformed --source-gap exits 2" || fail "malformed --source-gap did not exit 2"
node "$PROBE" --html "$DECK/talk.html" --class-colors 'deck-x=red' >/dev/null 2>&1; [ $? -eq 2 ] && echo "  ✓ malformed --class-colors exits 2" || fail "malformed --class-colors did not exit 2"

[ "$FAIL" = 0 ] && { echo "✓ every template rendered and passed its checks"; exit 0; }
echo "✗ some checks failed"; exit 1

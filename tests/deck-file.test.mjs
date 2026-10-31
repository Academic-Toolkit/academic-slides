// Tests for how the slide-qa scripts find the deck file when no file option is given (issue #44): the
// single file with that extension in the current folder, exit 2 listing every candidate when there is
// none or more than one, never a fixed talk.* name. Run with: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPTS = path.join(ROOT, 'plugins/academic-slides/skills/slide-qa/scripts');
const lib = await import(path.join(SCRIPTS, '_lib.mjs'));

const QMD = '---\ntitle: "T"\n---\n\n## A slide\n\nShort body text.\n';
const HTML_SCRIPTS = ['check-fill.mjs', 'check-layout.mjs', 'check-mathjax.mjs', 'export-pdf.mjs'];

function folder(files = {}) {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'deck-file-test-')));
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    if (content !== null) writeFileSync(path.join(dir, name), content);
  }
  return dir;
}

function runIn(dir, script, args = []) {
  const r = spawnSync(process.execPath, [path.join(SCRIPTS, script), ...args], { cwd: dir, encoding: 'utf8', timeout: 120000 });
  return { code: r.status, out: r.stdout + r.stderr };
}

// ---------- the lookup ----------

test('deckCandidates lists the files with the extension in the folder, sorted, without looking in subfolders', () => {
  const dir = folder({ 'b.qmd': QMD, 'a.qmd': QMD, 'notes.md': 'x', 'beamer/c.qmd': QMD });
  mkdirSync(path.join(dir, 'folder.qmd'));
  assert.deepEqual(lib.deckCandidates('.qmd', { dir }), ['a.qmd', 'b.qmd']);
});

test('deckCandidates leaves out the names the exclude pattern matches', () => {
  const dir = folder({ 'deck.pdf': 'x', 'deck-handout.pdf': 'x' });
  assert.deepEqual(lib.deckCandidates('.pdf', { dir, exclude: /-handout\.pdf$/ }), ['deck.pdf']);
});

test('deckCandidates returns an empty list when nothing matches', () => {
  assert.deepEqual(lib.deckCandidates('.html', { dir: folder({ 'a.qmd': QMD }) }), []);
});

// ---------- check-density (--qmd) ----------

test('check-density without --qmd checks the only .qmd in the folder', () => {
  const r = runIn(folder({ 'jscs-imputation.qmd': QMD }), 'check-density.mjs');
  assert.equal(r.code, 0, r.out);
});

test('check-density without --qmd and two .qmd files exits 2 naming both and the option', () => {
  const dir = folder({ 'a.qmd': QMD, 'b.qmd': QMD });
  const r = runIn(dir, 'check-density.mjs');
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /a\.qmd/);
  assert.match(r.out, /b\.qmd/);
  assert.match(r.out, /--qmd/);
  assert.ok(r.out.includes(dir), r.out);
});

test('check-density without --qmd and no .qmd file exits 2 naming the folder and the option', () => {
  const dir = folder({ 'talk.html': '<html></html>' });
  const r = runIn(dir, 'check-density.mjs');
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /--qmd/);
  assert.ok(r.out.includes(dir), r.out);
});

test('check-density uses the file given with --qmd even when the folder has several', () => {
  const r = runIn(folder({ 'a.qmd': QMD, 'b.qmd': QMD }), 'check-density.mjs', ['--qmd', 'a.qmd']);
  assert.equal(r.code, 0, r.out);
});

test('an existing deck whose only .qmd is talk.qmd still works without --qmd', () => {
  const r = runIn(folder({ 'talk.qmd': QMD }), 'check-density.mjs');
  assert.equal(r.code, 0, r.out);
});

// ---------- the scripts that read the rendered .html (--html) ----------

test('scripts reading .html exit 2 naming every candidate when the folder has two', () => {
  const dir = folder({ 'a.html': '<html></html>', 'b.html': '<html></html>' });
  for (const script of HTML_SCRIPTS) {
    const r = runIn(dir, script);
    assert.equal(r.code, 2, `${script}: ${r.out}`);
    assert.match(r.out, /a\.html/, script);
    assert.match(r.out, /b\.html/, script);
    assert.match(r.out, /--html/, script);
  }
});

test('scripts reading .html exit 2 when the folder has none, instead of looking for talk.html', () => {
  const dir = folder({ 'deck.qmd': QMD });
  for (const script of HTML_SCRIPTS) {
    const r = runIn(dir, script);
    assert.equal(r.code, 2, `${script}: ${r.out}`);
    assert.match(r.out, /--html/, script);
    assert.doesNotMatch(r.out, /talk\.html/, script);
  }
});

// ---------- handout (--pdf): needs XeLaTeX and poppler ----------

const hasTool = (cmd, flag = '-v') => spawnSync(cmd, [flag], { encoding: 'utf8' }).error === undefined;
const skip = hasTool('xelatex', '--version') && hasTool('pdfinfo') ? false : 'needs xelatex and pdfinfo';

function pdfFixture(dir, name, pages) {
  const body = Array.from({ length: pages }, (_, k) => `\\vspace*{38mm}\\centering{\\Huge Slide ${k + 1}}\\clearpage`).join('\n');
  writeFileSync(path.join(dir, `${name}.tex`), `\\documentclass{article}
\\usepackage[paperwidth=160mm,paperheight=90mm,margin=0mm]{geometry}
\\pagestyle{empty}
\\begin{document}
${body}
\\end{document}
`);
  const r = spawnSync('xelatex', ['-interaction=nonstopmode', '-halt-on-error', `${name}.tex`], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout.slice(-800));
}

const pageCount = (file) => Number(/^Pages:\s+(\d+)/m.exec(spawnSync('pdfinfo', [file], { encoding: 'utf8' }).stdout)?.[1]);

test('handout without --pdf lays out the deck and leaves out its own -handout.pdf', { skip }, () => {
  const dir = folder();
  pdfFixture(dir, 'deck', 5);
  pdfFixture(dir, 'deck-handout', 1);
  const r = runIn(dir, 'handout.mjs');
  assert.equal(r.code, 0, r.out);
  assert.equal(existsSync(path.join(dir, 'deck-handout-handout.pdf')), false);
  assert.equal(pageCount(path.join(dir, 'deck-handout.pdf')), 2);   // 5 slides, 4 per landscape page
});

test('handout without --pdf and no .pdf in the folder exits 2 naming the option', { skip }, () => {
  const r = runIn(folder({ 'deck.qmd': QMD }), 'handout.mjs');
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /--pdf/);
});

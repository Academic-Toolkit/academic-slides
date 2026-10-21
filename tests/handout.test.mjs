// Tests for slide-qa/scripts/handout.mjs and _handout.mjs (issue #34). Run with: node --test tests/
// The geometry targets are the numbers in the issue: landscape A4 2×2 → 132.5 × 74.5 mm with
// 26.5 mm above and below; portrait A4 3 rows × 2 columns → 89.0 × 50.1 mm with 65.4 mm above and below.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPTS = path.join(ROOT, 'plugins/academic-slides/skills/slide-qa/scripts');
const HANDOUT = path.join(SCRIPTS, 'handout.mjs');
const lib = await import(path.join(SCRIPTS, '_handout.mjs'));

const near = (actual, expected, tol = 0.05) =>
  assert.ok(Math.abs(actual - expected) <= tol, `expected ${expected} ± ${tol}, got ${actual}`);
const A4L = { paperW: 297, paperH: 210 };
const A4P = { paperW: 210, paperH: 297 };

test('landscape 2×2 preset: 132.5 × 74.5 mm slides, centred with 26.5 mm above and below', () => {
  const g = lib.geometry({ ...A4L, rows: 2, cols: 2 });
  near(g.slideW, 132.5);
  near(g.slideH, 74.5, 0.06);
  near(g.left, 12);
  near(g.top, 26.5, 0.06);
  near(210 - (g.top + g.gridH), 26.5, 0.06);
  assert.equal(g.bound, 'width');
});

test('portrait 3 rows × 2 columns preset: 89.0 × 50.1 mm slides, centred with 65.4 mm above and below', () => {
  const g = lib.geometry({ ...A4P, rows: 3, cols: 2 });
  near(g.slideW, 89.0);
  near(g.slideH, 50.1, 0.06);
  near(g.left, 12);
  near(g.top, 65.4, 0.1);
  near(297 - (g.top + g.gridH), 65.4, 0.1);
});

test('header and footer bands leave both presets unchanged', () => {
  for (const [paper, rows, cols] of [[A4L, 2, 2], [A4P, 3, 2]]) {
    const plain = lib.geometry({ ...paper, rows, cols });
    const banded = lib.geometry({ ...paper, rows, cols, headerBand: 8, footerBand: 8 });
    near(banded.slideW, plain.slideW, 1e-9);
    near(banded.top, plain.top, 1e-9);
  }
});

test('cells run left to right, then top to bottom, one gap apart', () => {
  const g = lib.geometry({ ...A4L, rows: 2, cols: 2 });
  assert.equal(g.cells.length, 4);
  near(g.cells[1].x - g.cells[0].x, 132.5 + 8);
  near(g.cells[1].y, g.cells[0].y, 1e-9);
  near(g.cells[2].y - g.cells[0].y, 74.53 + 8, 0.06);
  near(g.cells[2].x, g.cells[0].x, 1e-9);
});

test('a tall grid is bound by the height and centred horizontally', () => {
  const g = lib.geometry({ ...A4L, rows: 3, cols: 1 });
  assert.equal(g.bound, 'height');
  near(g.top, 12);
  near(g.gridH, 186);
  near(g.left, (297 - g.slideW) / 2, 1e-9);
});

test('the aspect ratio of the deck sets the slide height', () => {
  const g = lib.geometry({ ...A4L, rows: 2, cols: 2, aspect: 4 / 3 });
  near(g.slideH, g.slideW * 3 / 4, 1e-9);
});

test('a grid that does not fit on the page is refused', () => {
  assert.throws(() => lib.geometry({ ...A4L, rows: 2, cols: 40 }), /does not fit/);
});

test('texEscape escapes the LaTeX special characters and keeps CJK text', () => {
  assert.equal(lib.texEscape('A & B: 50% #1_x $y$ {z} ~ ^ \\'),
    'A \\& B: 50\\% \\#1\\_x \\$y\\$ \\{z\\} \\textasciitilde{} \\textasciicircum{} \\textbackslash{}');
  assert.equal(lib.texEscape('普通心理學\n第七週'), '普通心理學 第七週');
});

test('texFor: one sheet per four slides, every page referenced once, frames by default', () => {
  const g = lib.geometry({ ...A4L, rows: 2, cols: 2, headerBand: 8, footerBand: 8 });
  const tex = lib.texFor({ geometry: g, paperW: 297, paperH: 210, pages: 5, title: 'Talk', pageNumbers: true });
  assert.equal((tex.match(/\\clearpage/g) || []).length, 2);
  for (let k = 1; k <= 5; k++) assert.equal((tex.match(new RegExp(`page=${k},`, 'g')) || []).length, 1);
  assert.match(tex, /draw=black, line width=0\.4pt/);
  assert.match(tex, /\{1 \/ 2\}/);
  assert.match(tex, /\{Talk\}/);
  assert.doesNotMatch(tex, /xeCJK/);
});

test('texFor: frame, header and page number can each be turned off', () => {
  const g = lib.geometry({ ...A4L, rows: 2, cols: 2 });
  const tex = lib.texFor({ geometry: g, paperW: 297, paperH: 210, pages: 4, frame: false, title: '', pageNumbers: false });
  assert.doesNotMatch(tex, /draw=black/);
  assert.doesNotMatch(tex, /\/ 1\}/);
  assert.doesNotMatch(tex, /anchor=south west/);
});

test('texFor: a CJK title loads xeCJK with a fallback list, or the font the user named', () => {
  const g = lib.geometry({ ...A4L, rows: 2, cols: 2 });
  const auto = lib.texFor({ geometry: g, paperW: 297, paperH: 210, pages: 1, title: '普通心理學' });
  assert.match(auto, /\\usepackage\{xeCJK\}/);
  assert.match(auto, /\\IfFontExistsTF\{PingFang TC\}/);
  assert.match(auto, /HANDOUT: no CJK font/);
  const named = lib.texFor({ geometry: g, paperW: 297, paperH: 210, pages: 1, title: '普通心理學', cjkFont: 'Noto Sans CJK TC' });
  assert.match(named, /\\setCJKmainfont\{Noto Sans CJK TC\}/);
  assert.doesNotMatch(named, /IfFontExistsTF/);
});

// ---- Command-line tests: need XeLaTeX and poppler (pdfinfo, pdftoppm, pdftotext); skipped without them.

const hasTool = (cmd, flag = '-v') => spawnSync(cmd, [flag], { encoding: 'utf8' }).error === undefined;
const TOOLS = hasTool('xelatex', '--version') && hasTool('pdfinfo') && hasTool('pdftoppm') && hasTool('pdftotext');
const skip = TOOLS ? false : 'needs xelatex, pdfinfo, pdftoppm and pdftotext';

let fixtureDir;
// A 5-page, 160 × 90 mm (16:9) deck titled "Fixture Deck", with "Slide k" in the middle of each page.
function fixture() {
  if (fixtureDir) return path.join(fixtureDir, 'deck.pdf');
  fixtureDir = realpathSync(mkdtempSync(path.join(tmpdir(), 'handout-test-')));
  const pages = [1, 2, 3, 4, 5].map((k) => `\\vspace*{38mm}\\centering{\\Huge Slide ${k}}\\clearpage`).join('\n');
  writeFileSync(path.join(fixtureDir, 'deck.tex'), `\\documentclass{article}
\\usepackage[paperwidth=160mm,paperheight=90mm,margin=0mm]{geometry}
\\usepackage{hyperref}\\hypersetup{pdftitle={Fixture Deck}}
\\pagestyle{empty}
\\begin{document}
${pages}
\\end{document}
`);
  const r = spawnSync('xelatex', ['-interaction=nonstopmode', '-halt-on-error', 'deck.tex'], { cwd: fixtureDir, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout.slice(-800));
  return path.join(fixtureDir, 'deck.pdf');
}

function runHandout(args) {
  const r = spawnSync(process.execPath, [HANDOUT, ...args], { encoding: 'utf8', timeout: 120000 });
  return { code: r.status, out: r.stdout + r.stderr };
}

function pdfinfo(file) {
  const out = spawnSync('pdfinfo', [file], { encoding: 'utf8' }).stdout;
  return { pages: Number(out.match(/^Pages:\s+(\d+)/m)[1]), size: out.match(/^Page size:\s+([\d.]+) x ([\d.]+)/m).slice(1).map(Number) };
}

// Render page 1 at 254 dpi (10 px per mm) as greyscale and return a lookup of pixel darkness.
function raster(file) {
  const prefix = path.join(path.dirname(file), 'raster');
  spawnSync('pdftoppm', ['-gray', '-r', '254', '-f', '1', '-l', '1', '-singlefile', file, prefix]);
  const buf = readFileSync(`${prefix}.pgm`);
  const [header, w, h] = buf.toString('latin1', 0, 40).match(/^P5\s+(\d+)\s+(\d+)\s+255\s/);
  const data = buf.subarray(header.length);
  return { w: Number(w), h: Number(h), at: (xmm, ymm) => data[Math.round(ymm * 10) * Number(w) + Math.round(xmm * 10)] };
}

// First millimetre position, scanning from the start, where the page is dark.
function firstDark(r, { row, col }) {
  if (row !== undefined) { for (let x = 0; x < r.w / 10; x += 0.1) if (r.at(x, row) < 128) return x; }
  else { for (let y = 0; y < r.h / 10; y += 0.1) if (r.at(col, y) < 128) return y; }
  return undefined;
}

test('handout: landscape 2×2 by default, 5 slides on 2 A4 pages, frames where the geometry puts them', { skip }, () => {
  const deck = fixture();
  const { code, out } = runHandout(['--pdf', deck]);
  assert.equal(code, 0, out);
  const file = path.join(fixtureDir, 'deck-handout.pdf');
  assert.ok(existsSync(file));
  const info = pdfinfo(file);
  assert.equal(info.pages, 2);
  near(info.size[0], 841.89, 0.5);
  near(info.size[1], 595.28, 0.5);
  const r = raster(file);
  near(firstDark(r, { row: 26.5 + 74.5 / 2 }), 12.0, 0.3);   // left edge of the first frame
  near(firstDark(r, { col: 32 }), 26.5, 0.3);                // top edge of the first frame
});

test('handout: the header takes the PDF title and the footer numbers the pages', { skip }, () => {
  const deck = fixture();
  const out = path.join(fixtureDir, 'titled.pdf');
  assert.equal(runHandout(['--pdf', deck, '--out', out]).code, 0);
  const text = spawnSync('pdftotext', ['-layout', out, '-'], { encoding: 'utf8' }).stdout;
  assert.match(text, /Fixture Deck/);
  assert.match(text, /1 ?\/ ?2/);   // pdftotext may drop the thin spaces around the slash
  const bare = path.join(fixtureDir, 'bare.pdf');
  assert.equal(runHandout(['--pdf', deck, '--out', bare, '--no-header', '--no-page-numbers']).code, 0);
  const bareText = spawnSync('pdftotext', ['-layout', bare, '-'], { encoding: 'utf8' }).stdout;
  assert.doesNotMatch(bareText, /Fixture Deck|1 ?\/ ?2/);
});

test('handout: --portrait puts 3 rows × 2 columns on a portrait A4 page', { skip }, () => {
  const deck = fixture();
  const out = path.join(fixtureDir, 'portrait.pdf');
  const { code, out: log } = runHandout(['--pdf', deck, '--out', out, '--portrait']);
  assert.equal(code, 0, log);
  const info = pdfinfo(out);
  assert.equal(info.pages, 1);
  near(info.size[0], 595.28, 0.5);
  near(info.size[1], 841.89, 0.5);
  const r = raster(out);
  near(firstDark(r, { row: 65.4 + 50.1 / 2 }), 12.0, 0.3);
  near(firstDark(r, { col: 25 }), 65.4, 0.3);
});

test('handout: --no-frame leaves the slide edge unmarked', { skip }, () => {
  const deck = fixture();
  const out = path.join(fixtureDir, 'noframe.pdf');
  assert.equal(runHandout(['--pdf', deck, '--out', out, '--no-frame']).code, 0);
  const x = firstDark(raster(out), { row: 26.5 + 74.5 / 2 });
  assert.ok(x === undefined || x > 20, `expected no frame at 12 mm, found dark pixels at ${x} mm`);
});

test('handout: a CJK title is typeset, or refused with a hint about --cjk-font', { skip }, () => {
  const deck = fixture();
  const out = path.join(fixtureDir, 'cjk.pdf');
  const { code, out: log } = runHandout(['--pdf', deck, '--out', out, '--title', '普通心理學']);
  if (code === 0) {
    assert.match(spawnSync('pdftotext', [out, '-'], { encoding: 'utf8' }).stdout, /普通心理學/);
  } else {
    assert.equal(code, 1);
    assert.match(log, /--cjk-font/);
  }
});

test('handout: a missing PDF exits 2', () => {
  const { code, out } = runHandout(['--pdf', path.join(tmpdir(), 'no-such-deck.pdf')]);
  assert.equal(code, 2, out);
});

test('handout: --rows without --cols is refused before anything is written', () => {
  const { code, out } = runHandout(['--pdf', path.join(tmpdir(), 'no-such-deck.pdf'), '--rows', '2']);
  assert.equal(code, 1, out);
  assert.match(out, /--rows and --cols/);
});
